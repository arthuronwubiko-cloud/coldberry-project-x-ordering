"use strict";

const fs = require("fs");
const path = require("path");

const BRAND_SLUG = "coldberry";
const MAX_PROMO_PERCENT = 50;
const MAX_VOUCHER_TOTAL_RATIO = 0.95; // Final total after % voucher can never exceed 95% of original price without voucher
const LOYALTY_EARN_UNIT_NAIRA = 500;  // 1 point per ₦500 of net food subtotal ONLY (excludes delivery & service fees)
const LOYALTY_REDEEM_POINTS = 2500;   // Cash tier: 2,500 points = ₦2,500 off
const LOYALTY_REDEEM_VALUE = 2500;

const LOYALTY_REWARDS = [
  { id: "drink_10", points: 10, type: "item", label: "Free Cold Drink (50cl)", itemName: "Cold Coca-Cola (50cl)", cashValue: 0 },
  { id: "shawarma_50", points: 50, type: "item", label: "Free Shawarma", itemName: "Shawarma Roll", cashValue: 0 },
  { id: "medium_pizza_70", points: 70, type: "item", label: "Free Medium Pizza", itemName: "Medium Pizza", cashValue: 0 },
  { id: "large_pizza_80", points: 80, type: "item", label: "Free Large Pizza", itemName: "Large Pizza", cashValue: 0 },
  { id: "champion_pizza_90", points: 90, type: "item", label: "Free Champion Pizza", itemName: "Champion Pizza", cashValue: 0 },
  { id: "cash_2500", points: 2500, type: "discount", label: "₦2,500 Off Order", itemName: "", cashValue: 2500 },
];

const LOCAL_VOUCHERS_FILE = path.join("/tmp", `${BRAND_SLUG}-promo-vouchers.json`);
const LOCAL_LOYALTY_FILE = path.join("/tmp", `${BRAND_SLUG}-loyalty-points.json`);

const DEFAULT_VOUCHERS = [
  {
    code: "WELCOME10",
    type: "percent",
    percent: 10,
    minOrder: 0,
    freeItem: "",
    description: "10% off your food subtotal",
    isActive: true,
    validUntil: "2027-12-31",
    createdBy: "system",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    code: "WEEKEND15",
    type: "percent",
    percent: 15,
    minOrder: 20000,
    freeItem: "",
    description: "15% off orders ₦20,000+",
    isActive: true,
    validUntil: "2027-12-31",
    createdBy: "system",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    code: "FREEDRINK",
    type: "drink",
    percent: 0,
    minOrder: 0,
    freeItem: "Cold Coca-Cola (50cl)",
    description: "Complimentary 50cl Coca-Cola (exempt from fee scaling)",
    isActive: true,
    validUntil: "2027-12-31",
    createdBy: "system",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

let neonSqlClient = null;
let neonTablesReady = false;

function getNeonClient() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return null;
  if (!neonSqlClient) {
    try {
      const { neon } = require("@neondatabase/serverless");
      neonSqlClient = neon(url);
    } catch (_) {
      return null;
    }
  }
  return neonSqlClient;
}

async function ensureNeonVoucherTables() {
  const sql = getNeonClient();
  if (!sql || neonTablesReady) return sql;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS promo_vouchers (
        code TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'percent',
        percent INTEGER NOT NULL DEFAULT 0,
        min_order INTEGER NOT NULL DEFAULT 0,
        free_item TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        valid_until TEXT NOT NULL DEFAULT '2027-12-31',
        created_by TEXT NOT NULL DEFAULT 'admin',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS customer_loyalty (
        account_key TEXT PRIMARY KEY,
        points INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    const existing = await sql`SELECT COUNT(*)::int AS cnt FROM promo_vouchers`;
    if (existing?.[0]?.cnt === 0) {
      for (const v of DEFAULT_VOUCHERS) {
        await sql`
          INSERT INTO promo_vouchers (code, type, percent, min_order, free_item, description, is_active, valid_until, created_by)
          VALUES (${v.code}, ${v.type}, ${v.percent}, ${v.minOrder}, ${v.freeItem}, ${v.description}, ${v.isActive}, ${v.validUntil}, ${v.createdBy})
          ON CONFLICT (code) DO NOTHING
        `;
      }
    }
    neonTablesReady = true;
    return sql;
  } catch (_) {
    return null;
  }
}

function readLocalJson(filePath, fallback) {
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch (_) {}
  return typeof fallback === "function" ? fallback() : fallback;
}

function writeLocalJson(filePath, data) {
  try {
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.renameSync(tmp, filePath);
  } catch (_) {}
}

function normalizeCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 32);
}

function normalizeVoucherRow(row) {
  const type = String(row.type || "percent").toLowerCase() === "drink" ? "drink" : "percent";
  const rawPct = Math.round(Number(row.percent) || 0);
  const percent = type === "drink" ? 0 : Math.min(MAX_PROMO_PERCENT, Math.max(1, rawPct));
  return {
    code: normalizeCode(row.code),
    type,
    percent,
    minOrder: Math.max(0, Math.round(Number(row.minOrder ?? row.min_order) || 0)),
    freeItem: type === "drink" ? String(row.freeItem ?? row.free_item ?? "Cold Coca-Cola (50cl)").trim() || "Cold Coca-Cola (50cl)" : "",
    description: String(row.description || (type === "drink" ? "Complimentary drink voucher" : `${percent}% off food subtotal`)).trim().slice(0, 160),
    isActive: row.isActive !== undefined ? Boolean(row.isActive) : (row.is_active !== undefined ? Boolean(row.is_active) : true),
    validUntil: String(row.validUntil ?? row.valid_until ?? "2027-12-31").trim().slice(0, 20),
    createdBy: String(row.createdBy ?? row.created_by ?? "admin").trim().slice(0, 40),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? new Date().toISOString()),
  };
}

function getLocalVouchersMap() {
  const existing = readLocalJson(LOCAL_VOUCHERS_FILE, null);
  if (existing && !Array.isArray(existing)) {
    return existing;
  }
  const map = {};
  for (const v of DEFAULT_VOUCHERS) {
    map[v.code] = { ...v };
  }
  writeLocalJson(LOCAL_VOUCHERS_FILE, map);
  return map;
}

async function listVouchers() {
  const sql = await ensureNeonVoucherTables();
  if (sql) {
    try {
      const rows = await sql`SELECT code, type, percent, min_order, free_item, description, is_active, valid_until, created_by, updated_at FROM promo_vouchers ORDER BY updated_at DESC, code ASC`;
      return rows.map(normalizeVoucherRow);
    } catch (_) {}
  }
  const map = getLocalVouchersMap();
  return Object.values(map).map(normalizeVoucherRow);
}

async function getVoucher(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return null;
  const sql = await ensureNeonVoucherTables();
  if (sql) {
    try {
      const rows = await sql`SELECT code, type, percent, min_order, free_item, description, is_active, valid_until, created_by, updated_at FROM promo_vouchers WHERE code = ${code} LIMIT 1`;
      if (rows.length > 0) return normalizeVoucherRow(rows[0]);
      return null;
    } catch (_) {}
  }
  const map = getLocalVouchersMap();
  return map[code] ? normalizeVoucherRow(map[code]) : null;
}

async function upsertVoucher(input, actor = "admin") {
  const code = normalizeCode(input?.code);
  if (!code || code.length < 3) {
    return { error: "Voucher code must be at least 3 alphanumeric characters." };
  }
  const type = String(input?.type || "percent").toLowerCase() === "drink" ? "drink" : "percent";
  let percent = 0;
  if (type === "percent") {
    const rawPct = Number(input?.percent);
    if (!Number.isFinite(rawPct) || rawPct < 1) {
      return { error: "Percentage voucher discount must be at least 1%." };
    }
    if (rawPct > MAX_PROMO_PERCENT) {
      return { error: `Percentage voucher discount cannot exceed the ${MAX_PROMO_PERCENT}% maximum cap.` };
    }
    percent = Math.round(rawPct);
  }
  const minOrder = Math.max(0, Math.round(Number(input?.minOrder) || 0));
  const freeItem = type === "drink"
    ? String(input?.freeItem || "Cold Coca-Cola (50cl)").trim().slice(0, 80) || "Cold Coca-Cola (50cl)"
    : "";
  const description = String(
    input?.description || (type === "drink" ? `Complimentary ${freeItem} (exempt from fee scaling)` : `${percent}% off your food subtotal`)
  ).trim().slice(0, 160);
  const isActive = input?.isActive !== undefined ? Boolean(input.isActive) : true;
  const validUntil = String(input?.validUntil || "2027-12-31").trim().slice(0, 20);
  if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    return { error: "validUntil must use YYYY-MM-DD date format." };
  }

  const record = {
    code,
    type,
    percent,
    minOrder,
    freeItem,
    description,
    isActive,
    validUntil: validUntil || "2027-12-31",
    createdBy: String(actor || "admin").slice(0, 40),
    updatedAt: new Date().toISOString(),
  };

  const sql = await ensureNeonVoucherTables();
  if (sql) {
    try {
      await sql`
        INSERT INTO promo_vouchers (code, type, percent, min_order, free_item, description, is_active, valid_until, created_by, updated_at)
        VALUES (${record.code}, ${record.type}, ${record.percent}, ${record.minOrder}, ${record.freeItem}, ${record.description}, ${record.isActive}, ${record.validUntil}, ${record.createdBy}, NOW())
        ON CONFLICT (code) DO UPDATE SET
          type = EXCLUDED.type,
          percent = EXCLUDED.percent,
          min_order = EXCLUDED.min_order,
          free_item = EXCLUDED.free_item,
          description = EXCLUDED.description,
          is_active = EXCLUDED.is_active,
          valid_until = EXCLUDED.valid_until,
          created_by = EXCLUDED.created_by,
          updated_at = NOW()
      `;
    } catch (_) {}
  }

  const map = getLocalVouchersMap();
  map[code] = record;
  writeLocalJson(LOCAL_VOUCHERS_FILE, map);
  return { voucher: record };
}

async function updateVoucher(rawCode, patch, actor = "admin") {
  const existing = await getVoucher(rawCode);
  if (!existing) {
    return { error: "Promo voucher not found." };
  }
  const merged = {
    ...existing,
    ...patch,
    code: existing.code,
  };
  return upsertVoucher(merged, actor);
}

async function deleteVoucher(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return { error: "Voucher code is required." };

  let deletedInDb = false;
  const sql = await ensureNeonVoucherTables();
  if (sql) {
    try {
      const rows = await sql`DELETE FROM promo_vouchers WHERE code = ${code} RETURNING code`;
      if (rows && rows.length > 0) deletedInDb = true;
    } catch (_) {}
  }

  const map = getLocalVouchersMap();
  const deletedInLocal = Boolean(map[code]);
  if (deletedInLocal) {
    delete map[code];
    writeLocalJson(LOCAL_VOUCHERS_FILE, map);
  }
  if (!deletedInDb && !deletedInLocal) {
    return { error: "Promo voucher not found." };
  }
  return { deleted: true, code };
}

function isVoucherExpired(validUntil, now = new Date()) {
  if (!validUntil) return false;
  const end = new Date(`${validUntil}T23:59:59.999Z`);
  if (Number.isNaN(end.getTime())) return false;
  return now.getTime() > end.getTime();
}

async function validateVoucherForOrder(rawCode, subtotal = 0) {
  const code = normalizeCode(rawCode);
  if (!code) return { valid: false, error: "Enter a promo or drink voucher code." };
  const voucher = await getVoucher(code);
  if (!voucher) return { valid: false, error: "Invalid voucher code." };
  if (!voucher.isActive) return { valid: false, error: "This voucher is currently paused." };
  if (isVoucherExpired(voucher.validUntil)) {
    return { valid: false, error: `This voucher expired on ${voucher.validUntil}.` };
  }
  const foodSub = Math.max(0, Number(subtotal) || 0);
  if (voucher.minOrder > 0 && foodSub < voucher.minOrder) {
    return {
      valid: false,
      error: `${voucher.code} requires a minimum food subtotal of ₦${voucher.minOrder.toLocaleString("en-NG")}.`,
    };
  }
  return { valid: true, voucher };
}

function getLoyaltyRewardById(rewardId) {
  if (!rewardId) return null;
  const clean = String(rewardId).trim().toLowerCase();
  return LOYALTY_REWARDS.find((r) => r.id === clean) || null;
}

function calculateLoyaltyPointsEarned(foodSubtotalOnly) {
  // Earn 1 point per ₦500 of net food subtotal ONLY (delivery fee & service fee strictly excluded)
  const sub = Math.max(0, Number(foodSubtotalOnly) || 0);
  return Math.floor(sub / LOYALTY_EARN_UNIT_NAIRA);
}

function applyVoucherAndLoyaltyPolicy({
  subtotal = 0,
  baseServiceFee = 0,
  baseDeliveryFee = 0,
  voucher = null,
  redeemLoyalty = false,
  loyaltyRewardId = null,
  availablePoints = 0,
}) {
  const foodSub = Math.max(0, Math.round(Number(subtotal) || 0));
  const baseSvc = Math.max(0, Math.round(Number(baseServiceFee) || 0));
  const baseDel = Math.max(0, Math.round(Number(baseDeliveryFee) || 0));
  const originalGrandTotal = foodSub + baseSvc + baseDel;

  let serviceFee = baseSvc;
  let deliveryFee = baseDel;
  let promoDiscount = 0;
  let promoPercent = 0;
  let cap95Applied = false;
  let exemptDrinkVoucher = false;
  let freeDrinkItem = "";
  let voucherCode = "";

  if (voucher && foodSub > 0) {
    voucherCode = normalizeCode(voucher.code);
    if (voucher.type === "drink") {
      // Drink voucher policy exemption: NO service/delivery fee increase, NO 95% ceiling mutation
      exemptDrinkVoucher = true;
      freeDrinkItem = voucher.freeItem || "Cold Coca-Cola (50cl)";
      promoDiscount = 0;
      serviceFee = baseSvc;
      deliveryFee = baseDel;
    } else {
      const pct = Math.min(MAX_PROMO_PERCENT, Math.max(0, Math.round(Number(voucher.percent) || 0)));
      promoPercent = pct;
      if (pct > 0) {
        promoDiscount = Math.round(foodSub * (pct / 100));
        const discountedSubtotal = Math.max(0, foodSub - promoDiscount);
        let scaledSvc = Math.round(baseSvc * (1 + pct / 100));
        let scaledDel = Math.round(baseDel * (1 + pct / 100));
        const rawTotal = discountedSubtotal + scaledSvc + scaledDel;
        const maxAllowedTotal = Math.floor(originalGrandTotal * MAX_VOUCHER_TOTAL_RATIO);

        if (rawTotal > maxAllowedTotal) {
          cap95Applied = true;
          let excess = rawTotal - maxAllowedTotal;
          const delTrim = Math.min(scaledDel, excess);
          scaledDel -= delTrim;
          excess -= delTrim;
          if (excess > 0) {
            const svcTrim = Math.min(scaledSvc, excess);
            scaledSvc -= svcTrim;
            excess -= svcTrim;
          }
          if (excess > 0) {
            // Guarantees strict <= 95% ceiling even on 1%-4% Pickup orders where fees are small
            promoDiscount = Math.min(foodSub, promoDiscount + excess);
          }
        }
        serviceFee = scaledSvc;
        deliveryFee = scaledDel;
      }
    }
  }

  const totalAfterVoucher = Math.max(0, (foodSub - promoDiscount) + serviceFee + deliveryFee);

  // Loyalty Reward Redemption (supports item tiers: 10/50/70/80/90 pts AND cash tier: 2,500 pts = ₦2,500 off)
  let loyaltyPointsRedeemed = 0;
  let loyaltyDiscount = 0;
  let loyaltyRewardRedeemed = null;
  const ptsAvailable = Math.max(0, Math.floor(Number(availablePoints) || 0));

  const requestedReward = loyaltyRewardId
    ? getLoyaltyRewardById(loyaltyRewardId)
    : (redeemLoyalty ? getLoyaltyRewardById("cash_2500") : null);

  if (requestedReward && ptsAvailable >= requestedReward.points && (foodSub > 0 || requestedReward.type === "item")) {
    loyaltyPointsRedeemed = requestedReward.points;
    loyaltyRewardRedeemed = {
      id: requestedReward.id,
      points: requestedReward.points,
      type: requestedReward.type,
      label: requestedReward.label,
      itemName: requestedReward.itemName,
      cashValue: requestedReward.cashValue,
    };
    if (requestedReward.type === "discount" && requestedReward.cashValue > 0 && totalAfterVoucher > 0) {
      loyaltyDiscount = Math.min(requestedReward.cashValue, totalAfterVoucher);
    }
  }

  const grandTotal = Math.max(0, totalAfterVoucher - loyaltyDiscount);
  // Earn rate: 1 point per ₦500 of net paid food subtotal ONLY (delivery & service fees excluded!)
  const netFoodSubtotal = Math.max(0, foodSub - promoDiscount - loyaltyDiscount);
  const loyaltyPointsEarned = calculateLoyaltyPointsEarned(netFoodSubtotal);

  return {
    subtotal: foodSub,
    baseServiceFee: baseSvc,
    baseDeliveryFee: baseDel,
    originalGrandTotal,
    serviceFee,
    deliveryFee,
    voucherCode,
    promoPercent,
    promoDiscount,
    cap95Applied,
    exemptDrinkVoucher,
    freeDrinkItem,
    loyaltyPointsRedeemed,
    loyaltyDiscount,
    loyaltyRewardRedeemed,
    loyaltyPointsEarned,
    grandTotal,
  };
}

function normalizeLoyaltyKey(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

async function getLoyaltyBalance(rawKey) {
  const key = normalizeLoyaltyKey(rawKey);
  if (!key) return 0;
  const sql = await ensureNeonVoucherTables();
  if (sql) {
    try {
      const rows = await sql`SELECT points FROM customer_loyalty WHERE account_key = ${key} LIMIT 1`;
      if (rows.length > 0) return Math.max(0, Number(rows[0].points) || 0);
      return 0;
    } catch (_) {}
  }
  const map = readLocalJson(LOCAL_LOYALTY_FILE, {});
  return Math.max(0, Number(map[key]) || 0);
}

async function adjustLoyaltyBalance(rawKey, delta) {
  const key = normalizeLoyaltyKey(rawKey);
  if (!key) return 0;
  const change = Math.round(Number(delta) || 0);

  const sql = await ensureNeonVoucherTables();
  if (sql) {
    try {
      const rows = await sql`
        INSERT INTO customer_loyalty (account_key, points, updated_at)
        VALUES (${key}, GREATEST(0, ${change}), NOW())
        ON CONFLICT (account_key) DO UPDATE SET
          points = GREATEST(0, customer_loyalty.points + ${change}),
          updated_at = NOW()
        RETURNING points
      `;
      if (rows && rows.length > 0) return Math.max(0, Number(rows[0].points) || 0);
    } catch (_) {}
  }

  const map = readLocalJson(LOCAL_LOYALTY_FILE, {});
  const next = Math.max(0, (Number(map[key]) || 0) + change);
  map[key] = next;
  writeLocalJson(LOCAL_LOYALTY_FILE, map);
  return next;
}

async function redeemLoyaltyPointsAtomic(rawKey, pointsCost) {
  const key = normalizeLoyaltyKey(rawKey);
  const cost = Math.max(0, Math.floor(Number(pointsCost) || 0));
  if (!key || cost <= 0) return { ok: false, balance: 0 };

  const sql = await ensureNeonVoucherTables();
  if (sql) {
    try {
      const rows = await sql`
        UPDATE customer_loyalty
        SET points = points - ${cost}, updated_at = NOW()
        WHERE account_key = ${key} AND points >= ${cost}
        RETURNING points
      `;
      if (rows && rows.length > 0) {
        return { ok: true, balance: Math.max(0, Number(rows[0].points) || 0) };
      }
      const cur = await getLoyaltyBalance(key);
      return { ok: false, balance: cur };
    } catch (_) {}
  }

  const map = readLocalJson(LOCAL_LOYALTY_FILE, {});
  const cur = Math.max(0, Number(map[key]) || 0);
  if (cur < cost) return { ok: false, balance: cur };
  const next = cur - cost;
  map[key] = next;
  writeLocalJson(LOCAL_LOYALTY_FILE, map);
  return { ok: true, balance: next };
}

module.exports = {
  MAX_PROMO_PERCENT,
  MAX_VOUCHER_TOTAL_RATIO,
  LOYALTY_EARN_UNIT_NAIRA,
  LOYALTY_REDEEM_POINTS,
  LOYALTY_REDEEM_VALUE,
  LOYALTY_REWARDS,
  DEFAULT_VOUCHERS,
  listVouchers,
  getVoucher,
  upsertVoucher,
  updateVoucher,
  deleteVoucher,
  validateVoucherForOrder,
  getLoyaltyRewardById,
  calculateLoyaltyPointsEarned,
  applyVoucherAndLoyaltyPolicy,
  getLoyaltyBalance,
  adjustLoyaltyBalance,
  redeemLoyaltyPointsAtomic,
};

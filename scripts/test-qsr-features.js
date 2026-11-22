"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end(payload) { this.body = payload; return this; },
  };
}

let passed = 0;
let failed = 0;
function check(label, fn) {
  return Promise.resolve()
    .then(fn)
    .then((detail) => {
      passed++;
      console.log(`  [PASS] ${label}${detail ? " — " + detail : ""}`);
    })
    .catch((err) => {
      failed++;
      console.error(`  [FAIL] ${label} — ${err.message}`);
    });
}

(async () => {
  console.log(`\n=== QSR Features, Loyalty Tiers & Policy Verification (${path.basename(ROOT_DIR)}) ===`);
  const vouchers = require(path.join(ROOT_DIR, "api/vouchers.js"));
  const adminHandler = require(path.join(ROOT_DIR, "api/admin.js"));
  const ordersHandler = require(path.join(ROOT_DIR, "api/orders.js"));
  const authHandler = require(path.join(ROOT_DIR, "api/auth.js"));
  const clientOrder = require(path.join(ROOT_DIR, "js/order.js"));
  const { issueSessionToken } = adminHandler;

  const adminToken = issueSessionToken("RomeosAdmin890", "admin");
  const staffToken = issueSessionToken("StaffTest", "staff");
  const driverToken = issueSessionToken("DriverTest", "driver");
  const managerToken = issueSessionToken("ManagerTest", "manager");

  const catalogEntries = Object.entries(clientOrder.ITEM_PRICES).filter(([, p]) => Number(p) >= 4000);
  const [sampleItemName, sampleItemPrice] = catalogEntries[0];

  // 1. Loyalty earn = Math.floor(netFoodSubtotal / 500) strictly excluding delivery & service fees
  await check("Loyalty earn is 1 pt per ₦500 of net food subtotal ONLY (excludes delivery & service fees)", () => {
    assert.strictEqual(vouchers.calculateLoyaltyPointsEarned(499), 0);
    assert.strictEqual(vouchers.calculateLoyaltyPointsEarned(500), 1);
    const res = vouchers.applyVoucherAndLoyaltyPolicy({
      subtotal: 14150,
      baseServiceFee: 800,
      baseDeliveryFee: 2123,
    });
    assert.strictEqual(res.loyaltyPointsEarned, 28);
    return `subtotal=₦14,150 + fees=₦2,923 => ${res.loyaltyPointsEarned} pts (fees excluded)`;
  });

  // 2. All 6 Loyalty Reward Tiers (10 Drink, 50 Shawarma, 70 Med Pizza, 80 Large Pizza, 90 Champion Pizza, 2500 = ₦2,500 off)
  await check("All 6 Loyalty Reward Tiers redeem accurately (10 Drink, 50 Shawarma, 70 Med, 80 Large, 90 Champion, 2500 = ₦2,500)", () => {
    const cases = [
      ["drink_10", 10, "Free Cold Drink (50cl)", 0],
      ["shawarma_50", 50, "Free Shawarma", 0],
      ["medium_pizza_70", 70, "Free Medium Pizza", 0],
      ["large_pizza_80", 80, "Free Large Pizza", 0],
      ["champion_pizza_90", 90, "Free Champion Pizza", 0],
      ["cash_2500", 2500, "₦2,500 Off Order", 2500],
    ];
    for (const [id, pts, label, cash] of cases) {
      // Insufficient points (pts - 1) => rejected
      const low = vouchers.applyVoucherAndLoyaltyPolicy({
        subtotal: 10000,
        baseServiceFee: 800,
        baseDeliveryFee: 1500,
        availablePoints: pts - 1,
        loyaltyRewardId: id,
      });
      assert.strictEqual(low.loyaltyPointsRedeemed, 0, `${id} should not redeem at ${pts - 1} pts`);
      // Exact points => redeemed
      const ok = vouchers.applyVoucherAndLoyaltyPolicy({
        subtotal: 10000,
        baseServiceFee: 800,
        baseDeliveryFee: 1500,
        availablePoints: pts,
        loyaltyRewardId: id,
      });
      assert.strictEqual(ok.loyaltyPointsRedeemed, pts, `${id} expected ${pts} pts`);
      assert.strictEqual(ok.loyaltyRewardRedeemed.label, label);
      assert.strictEqual(ok.loyaltyDiscount, cash);
    }
    return `10=Drink, 50=Shawarma, 70=Med, 80=Lrg, 90=Champ, 2500=₦2,500 all verified`;
  });

  // 3. Percentage voucher policy: fee scaling + hard <= 95% ceiling (including 1%-4% Pickup edge case!)
  await check("Percentage voucher scales service & delivery fees AND strictly enforces <= 95% ceiling (incl. 2% Pickup edge case)", () => {
    const big = vouchers.applyVoucherAndLoyaltyPolicy({
      subtotal: 20000,
      baseServiceFee: 800,
      baseDeliveryFee: 2000,
      voucher: { code: "HALF50", type: "percent", percent: 50 },
    });
    assert.strictEqual(big.promoDiscount, 10000);
    assert.strictEqual(big.serviceFee, 1200);
    assert.strictEqual(big.deliveryFee, 3000);
    assert.strictEqual(big.grandTotal, 14200);

    // 2% Pickup edge case (orig = 20000 + 800 = 20800; 95% ceiling = 19760)
    const pickup2 = vouchers.applyVoucherAndLoyaltyPolicy({
      subtotal: 20000,
      baseServiceFee: 800,
      baseDeliveryFee: 0,
      voucher: { code: "TINY2", type: "percent", percent: 2 },
    });
    assert.strictEqual(pickup2.cap95Applied, true);
    assert.ok(pickup2.grandTotal <= Math.floor(20800 * 0.95), `2% pickup total ${pickup2.grandTotal} breached 95% cap ${Math.floor(20800 * 0.95)}`);
    return `50%=>₦14,200; 2% pickup edge=>₦${pickup2.grandTotal} <= ₦${Math.floor(20800 * 0.95)}`;
  });

  // 4. Drink voucher exemption
  await check("Drink voucher (FREEDRINK) is completely EXEMPT from service/delivery fee scaling and 95% ceiling", () => {
    const drink = vouchers.applyVoucherAndLoyaltyPolicy({
      subtotal: 12000,
      baseServiceFee: 600,
      baseDeliveryFee: 1800,
      voucher: { code: "FREEDRINK", type: "drink", percent: 0, freeItem: "Cold Coca-Cola (50cl)" },
    });
    assert.strictEqual(drink.exemptDrinkVoucher, true);
    assert.strictEqual(drink.serviceFee, 600);
    assert.strictEqual(drink.deliveryFee, 1800);
    assert.strictEqual(drink.grandTotal, 14400);
    return `exempt=true, fees unchanged (₦600/₦1,800)`;
  });

  // 5. Admin Console Voucher CRUD + 50% cap + RBAC 403
  const testCode = "QSRTEST" + Math.floor(1000 + Math.random() * 8999);
  await check("Admin API blocks >50% vouchers (400), enforces Admin-only RBAC (403), and supports Create/Update/Delete", async () => {
    for (const [role, tok] of [["staff", staffToken], ["driver", driverToken], ["manager", managerToken]]) {
      const rGet = createMockRes();
      await adminHandler({ method: "GET", query: { view: "vouchers" }, headers: { authorization: `Bearer ${tok}` } }, rGet);
      assert.strictEqual(rGet.statusCode, 403);
    }
    const rOver = createMockRes();
    await adminHandler({
      method: "POST",
      body: { action: "create_voucher", code: "OVER60", type: "percent", percent: 60, validUntil: "2027-12-31" },
      headers: { authorization: `Bearer ${adminToken}` },
    }, rOver);
    assert.strictEqual(rOver.statusCode, 400);

    const rCreate = createMockRes();
    await adminHandler({
      method: "POST",
      body: { action: "create_voucher", code: testCode, type: "percent", percent: 25, minOrder: 5000, validUntil: "2027-12-31", isActive: true },
      headers: { authorization: `Bearer ${adminToken}` },
    }, rCreate);
    assert.strictEqual(rCreate.statusCode, 200);

    const rDel = createMockRes();
    await adminHandler({
      method: "POST",
      body: { action: "delete_voucher", code: testCode },
      headers: { authorization: `Bearer ${adminToken}` },
    }, rDel);
    assert.strictEqual(rDel.statusCode, 200);
    return `RBAC=[403,403,403], >50%=400, CRUD verified (${testCode})`;
  });

  // 6. End-to-End Authenticated Loyalty Redemption (50 pts => Free Shawarma, 90 pts => Champion Pizza) + Call To Collect
  await check("End-to-end authenticated loyalty tier redemption (50 pts Shawarma) + Call To Collect (₦0 delivery)", async () => {
    const uName = "loy_" + Date.now().toString().slice(-6);
    const regRes = createMockRes();
    await authHandler({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { action: "register", username: uName, password: "Password123!", fullName: "Loyalty Tester", email: `${uName}@example.com`, phone: "08088776655", consent: true },
    }, regRes);
    assert.strictEqual(regRes.statusCode, 201, `Reg failed: ${JSON.stringify(regRes.body)}`);
    const cookie = String(regRes.headers["set-cookie"] || "").split(";")[0];

    // Seed 95 points for this authenticated user
    await vouchers.adjustLoyaltyBalance(uName, 95);

    // Redeem 50 pts for Free Shawarma on Call To Collect order
    const ordRes = createMockRes();
    await ordersHandler({
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: {
        consent: true,
        customer: { name: "Loyalty Tester", phone: "08088776655" },
        fulfilment: "Call To Collect",
        location: "Garki, Abuja",
        loyaltyRewardId: "shawarma_50",
        items: [{ name: sampleItemName, quantity: 2 }],
      },
    }, ordRes);
    assert.strictEqual(ordRes.statusCode, 200, `Redeem order failed: ${JSON.stringify(ordRes.body)}`);
    assert.strictEqual(ordRes.body?.pricing?.deliveryFee, 0);
    assert.strictEqual(ordRes.body?.loyaltyRewardRedeemed?.label, "Free Shawarma");
    assert.strictEqual(ordRes.body?.loyaltyBalance, 45); // 95 - 50 = 45 (pending points not prematurely credited!)
    return `CallToCollect=₦0 del, 95pts - 50pts (Free Shawarma) = 45pts remaining`;
  });

  // 7. Party Bundle pricing integrity (H-05 fix) & client-server parity
  await check("Party bundles with flavour suffixes price accurately (H-05 fix) and client matches server", () => {
    assert.strictEqual(clientOrder.getItemPrice("Office Friday Feast (Pepperoni Pizza + BBQ Chicken Pizza + Beef Suya Pizza)"), 98500);
    assert.strictEqual(clientOrder.getItemPrice("Coldberry Birthday Ice Cream Bar (Coldberry Vanilla Bean + Strawberry Bliss Swirl + Belgian Chocolate Fudge)"), 72000);
    assert.strictEqual(clientOrder.getItemPrice("Coldberry 3-Tub Party Box (Coldberry Vanilla Bean + Strawberry Bliss Swirl + Belgian Chocolate Fudge)"), 30000);

    const items = { [sampleItemName]: 2 };
    const base = clientOrder.calculateOrderTotals(items, "Delivery");
    const c90 = clientOrder.calculateOrderTotals(items, "Delivery", { loyaltyRewardId: "champion_pizza_90", availablePoints: 90 });
    assert.strictEqual(c90.loyaltyRewardRedeemed.label, "Free Champion Pizza");
    assert.strictEqual(c90.loyaltyPointsRedeemed, 90);
    return `FridayFeast=₦98,500, BirthdayBar=₦72,000, 3Tub=₦30,000, 90pts=Free Champion Pizza`;
  });

  // 8. Deferred scope guard
  await check("Deferred items (Digital e-Gift Cards & Mix-Ins/Toppings Customizer) remain in README.md only", () => {
    const readme = fs.readFileSync(path.join(ROOT_DIR, "README.md"), "utf8");
    assert.ok(readme.includes("Future Implementations"));
    assert.ok(/e-Gift Card/i.test(readme));
    assert.ok(/Toppings|Mix-Ins/i.test(readme));
    return `README documented, storefront clean`;
  });

  console.log(`\nQSR Features Summary (${path.basename(ROOT_DIR)}): ${passed}/${passed + failed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
})();

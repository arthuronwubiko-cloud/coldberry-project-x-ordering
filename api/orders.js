const { validateVoucherForOrder, applyVoucherAndLoyaltyPolicy, getLoyaltyBalance, adjustLoyaltyBalance, redeemLoyaltyPointsAtomic, LOYALTY_REDEEM_POINTS, LOYALTY_REDEEM_VALUE, LOYALTY_REWARDS } = require("./vouchers");
const {
  getItemPrice,
  calculateOrderTotals,
  normalizeItemName,
  formatNaira,
} = require("../js/order.js");
const { generateOrderPin, allocateOrderPin } = require("./pin-manager.js");

const ALLOWED_LOCATIONS = new Set([
  "Garki, Abuja",
  "Lugbe, Abuja",
  "Yaba, Lagos",
  "Surulere, Lagos",
  "Okota, Lagos",
  "Festac, Lagos",
  "Ajao, Lagos",
]);

const DEFAULT_RESTAURANT_WHATSAPP_NUMBER = "2349055303848";
const MAX_TEMPLATE_TEXT_LENGTH = 1500;

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizePhoneNumber(value) {
  if (typeof value !== "string") return "";
  const phone = value.trim();
  if (!/^\+?[0-9()\s-]+$/.test(phone)) return "";

  const digits = phone.replace(/\D/g, "");
  let internationalNumber = digits;

  if (phone.startsWith("+")) {
    internationalNumber = `+${digits}`;
  } else if (digits.startsWith("0")) {
    if (digits.length !== 11) return "";
    internationalNumber = `+234${digits.slice(1)}`;
  } else if (digits.length === 10 && /^(70|80|81|90|91)/.test(digits)) {
    internationalNumber = `+234${digits}`;
  } else {
    internationalNumber = `+${digits}`;
  }

  return /^\+[1-9]\d{6,14}$/.test(internationalNumber) ? internationalNumber : "";
}

function getRestaurantWhatsAppNumber() {
  const envNumber =
    process.env.RESTAURANT_WHATSAPP_NUMBER ||
    process.env.WHATSAPP_ORDER_RECIPIENT;

  if (envNumber) {
    const digits = String(envNumber).replace(/\D/g, "");
    if (/^\d{8,15}$/.test(digits)) {
      return digits;
    }
  }

  return DEFAULT_RESTAURANT_WHATSAPP_NUMBER;
}

const crypto = require("crypto");

function generateOrderId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `order-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

function validateOrder(body, orderPin, policyContext = null) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid order details." };
  }
  if (body.consent !== true) {
    return { error: "Consent is required before submitting an order." };
  }

  const { customer, fulfilment, location } = body;
  if (!customer || typeof customer !== "object" || Array.isArray(customer)) {
    return { error: "Customer details are required." };
  }

  const name = cleanText(customer.name, 80);
  const phone = normalizePhoneNumber(customer.phone) || cleanText(customer.phone, 20);
  if (name.length < 2) {
    return { error: "Enter your name using at least 2 characters." };
  }
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
    return { error: "Enter a valid phone number, such as 08012345678 or +2348012345678." };
  }

  if (!ALLOWED_LOCATIONS.has(location)) {
    return { error: "Choose a valid Coldberry Ice Cream location." };
  }
  if (fulfilment !== "Delivery" && fulfilment !== "Pickup" && fulfilment !== "Call To Collect") {
    return { error: "Choose delivery or pickup." };
  }

  const address = cleanText(body.address, 300);
  if (fulfilment === "Delivery" && address.length < 5) {
    return { error: "A delivery address is required." };
  }

  if (!Array.isArray(body.items) && !body.additionalItems) {
    return { error: "Add valid items to your order." };
  }

  const items = [];
  const itemsMap = Object.create(null);
  let cumulativeQty = 0;
  if (Array.isArray(body.items)) {
    for (const item of body.items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const itemName = normalizeItemName(cleanText(item.name, 120));
      if (!itemName || /^(__proto__|constructor|prototype)$/i.test(itemName)) continue;
      const quantity = Number(item.quantity);
      if (Number.isInteger(quantity) && quantity > 0 && quantity <= 50) {
        if (cumulativeQty + quantity > 50) {
          return { error: "Maximum 50 items per online order. Contact catering for larger events." };
        }
        cumulativeQty += quantity;
        const unitPrice = getItemPrice(itemName);
        const lineTotal = unitPrice > 0 ? ` (${formatNaira(unitPrice * quantity)})` : "";
        items.push(`${quantity} × ${itemName}${lineTotal}`);
        itemsMap[itemName] = (itemsMap[itemName] || 0) + quantity;
      }
    }
  }

  const additionalItems = normalizeItemName(cleanText(body.additionalItems, 1000));
  const notes = cleanText(body.notes, 500);
  const email = cleanText(customer.email || "", 254);

  if (items.length === 0 && !additionalItems) {
    return { error: "Add an item to your order." };
  }

  const basePricing = calculateOrderTotals(itemsMap, fulfilment);
  const policy = applyVoucherAndLoyaltyPolicy({
    subtotal: basePricing.subtotal,
    baseServiceFee: basePricing.serviceFee !== undefined ? basePricing.serviceFee : (basePricing.totalCount > 0 ? 800 : 0),
    baseDeliveryFee: fulfilment === "Delivery" ? basePricing.deliveryFee : 0,
    voucher: policyContext?.voucher || null,
    redeemLoyalty: Boolean(policyContext?.redeemLoyalty),
    loyaltyRewardId: policyContext?.loyaltyRewardId || null,
    availablePoints: Number(policyContext?.availablePoints) || 0,
  });
  const pricing = {
    ...basePricing,
    ...policy,
  };
  const scheduledTime = cleanText(body.scheduledTime || "ASAP", 60) || "ASAP";
  const hotspotLandmark = cleanText(body.hotspotLandmark || "", 120);
  const allItems = [...items, ...(additionalItems ? [additionalItems] : [])].join(", ");
  const pin = orderPin || (typeof body.orderPin === "string" && /^\d{6}$/.test(body.orderPin) ? body.orderPin : null);

  const lines = [
    "🍦 *New Order Request - Coldberry Ice Cream Nigeria*",
    "",
    "*Customer Details:*",
    `• Name: ${name}`,
    `• Phone: ${phone}`,
  ];

  if (pin) {
    lines.push(`• Order PIN: ${pin}`);
  }

  lines.push(
    "",
    "*Fulfilment Details:*",
    `• Fulfilment: ${fulfilment}`,
    `• Location: ${location}`,
  );

  if (fulfilment === "Delivery") {
    lines.push(`• Delivery Address: ${address}`);
    if (hotspotLandmark) {
      lines.push(`• Hotspot Landmark: ${hotspotLandmark}`);
    }
  }
  if (scheduledTime && scheduledTime !== "ASAP") {
    lines.push(`• Scheduled Time: ${scheduledTime}`);
  }

  lines.push("", "*Order Items:*");
  for (const item of items) {
    lines.push(`• ${item}`);
  }
  if (additionalItems) {
    lines.push(`• Additional Items/Requests: ${additionalItems}`);
  }

  const isDelivery = fulfilment === "Delivery";
  const freeLabel = fulfilment === "Call To Collect" ? "₦0 (Call To Collect)" : "₦0 (Free Pickup)";
  lines.push(
    "",
    "*Payment Summary:*",
    `• Subtotal: ${formatNaira(pricing.subtotal)}`
  );
  if (pricing.voucherCode) {
    if (pricing.exemptDrinkVoucher) {
      lines.push(`• Drink Voucher (${pricing.voucherCode}): ${pricing.freeDrinkItem} FREE`);
    } else if (pricing.promoDiscount > 0) {
      lines.push(`• Promo Voucher (${pricing.voucherCode} — ${pricing.promoPercent}% off): -${formatNaira(pricing.promoDiscount)}`);
    }
  }
  lines.push(
    `• Service Fee: ${formatNaira(pricing.serviceFee)}`,
    `• Delivery Fee: ${isDelivery ? formatNaira(pricing.deliveryFee) : freeLabel}`
  );
  if (pricing.loyaltyRewardRedeemed) {
    if (pricing.loyaltyDiscount > 0) {
      lines.push(`• Loyalty Reward (${pricing.loyaltyPointsRedeemed.toLocaleString("en-NG")} pts): -${formatNaira(pricing.loyaltyDiscount)}`);
    } else {
      lines.push(`• Loyalty Reward (${pricing.loyaltyPointsRedeemed.toLocaleString("en-NG")} pts): ${pricing.loyaltyRewardRedeemed.label} FREE`);
    }
  } else if (pricing.loyaltyDiscount > 0) {
    lines.push(`• Loyalty Redemption (${pricing.loyaltyPointsRedeemed.toLocaleString("en-NG")} pts): -${formatNaira(pricing.loyaltyDiscount)}`);
  }
  lines.push(`• Grand Total: ${formatNaira(pricing.grandTotal)}`);
  if (pricing.loyaltyPointsEarned > 0) {
    lines.push(`• Loyalty Points Pending: +${pricing.loyaltyPointsEarned} pts (credited once paid & completed; food subtotal only)`);
  }

  if (notes) {
    lines.push("", "*Special Notes:*", notes);
  }

  lines.push("", "Please confirm availability and order details. Thank you!");

  const message = lines.join("\n");
  if (message.length > MAX_TEMPLATE_TEXT_LENGTH) {
    return { error: "Your order details are too long. Please shorten the notes or item details." };
  }

  return {
    message,
    pricing,
    orderData: {
      orderPin: pin || null,
      customerName: name,
      customerPhone: phone,
      customerEmail: email,
      fulfilment,
      location,
      address: fulfilment === "Delivery" ? address : "",
      items: allItems,
      notes,
      subtotal: pricing.subtotal,
      serviceFee: pricing.serviceFee !== undefined ? pricing.serviceFee : (pricing.totalCount > 0 ? 800 : 0),
      deliveryFee: isDelivery ? pricing.deliveryFee : 0,
      grandTotal: pricing.grandTotal,
      scheduledTime,
      hotspotLandmark,
      promoCode: pricing.voucherCode || null,
      promoDiscount: pricing.promoDiscount || 0,
      freeDrinkItem: pricing.freeDrinkItem || null,
      loyaltyPointsEarned: pricing.loyaltyPointsEarned || 0,
      loyaltyPointsPending: pricing.loyaltyPointsEarned || 0,
      loyaltyCredited: false,
      loyaltyPointsRedeemed: pricing.loyaltyPointsRedeemed || 0,
      loyaltyReward: pricing.loyaltyRewardRedeemed ? pricing.loyaltyRewardRedeemed.label : null,
      loyaltyDiscount: pricing.loyaltyDiscount || 0,
      paymentStatus: "pending",
    },
  };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const {
    acquireRequestSlot,
    releaseRequestSlot,
    checkRateLimit,
    getClientIp,
  } = require("./overload-protection");

  // Overload fail-safe 1: Rate limiter (prevents abusive floods from starving regular users)
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    res.setHeader("Retry-After", String(rateLimit.retryAfter));
    return res.status(429).json({
      error: "Too many requests. Please try again shortly.",
      retryAfter: rateLimit.retryAfter,
    });
  }

  // Overload fail-safe 2: Concurrency governor (sheds excess requests in <1ms to keep server speed fast)
  if (!acquireRequestSlot()) {
    res.setHeader("Retry-After", "1");
    return res.status(503).json({
      error: "Server is temporarily busy under high demand. Please try again in a moment.",
    });
  }

  try {
    if (req.method === "GET" && req.query?.diagnostics === "1") {
      const { resolveAuthFromRequest } = require("./admin");
      const auth = resolveAuthFromRequest(req);
      if (!auth || auth.role !== "admin") {
        return res.status(401).json({ error: "Unauthorized. Admin authentication required for diagnostics." });
      }
      const envRecipient =
        process.env.RESTAURANT_WHATSAPP_NUMBER ||
        process.env.WHATSAPP_ORDER_RECIPIENT;
      const recipient = getRestaurantWhatsAppNumber();
      const { isConfigured: dbConfigured } = require("./db");
      return res.status(200).json({
        configured: true,
        usingDefault: !envRecipient,
        recipient,
        envRecipientConfigured: Boolean(envRecipient),
        databaseConfigured: dbConfigured(),
      });
    }

    if (req.method === "GET" && req.query?.action === "validate_voucher") {
      const code = String(req.query?.code || "").trim();
      const sub = Number(req.query?.subtotal) || 0;
      const vRes = await validateVoucherForOrder(code, sub);
      if (!vRes.valid) {
        return res.status(200).json({ valid: false, error: vRes.error });
      }
      return res.status(200).json({ valid: true, voucher: vRes.voucher });
    }

    if (req.method === "GET" && req.query?.action === "loyalty_balance") {
      let authUsername = null;
      try {
        const { resolveCustomerSession } = require("./auth");
        const { isSessionRevoked } = require("./redis");
        const sess = resolveCustomerSession(req);
        if (sess && sess.username && !(sess.jti && await isSessionRevoked(sess.jti))) {
          authUsername = sess.username;
        }
      } catch (_) {}
      const points = authUsername ? await getLoyaltyBalance(authUsername) : 0;
      const unlockedRewards = LOYALTY_REWARDS.filter((r) => points >= r.points);
      return res.status(200).json({
        ok: true,
        authenticated: Boolean(authUsername),
        points,
        rewards: LOYALTY_REWARDS,
        unlockedRewards,
        redeemThreshold: LOYALTY_REDEEM_POINTS,
        redeemValue: LOYALTY_REDEEM_VALUE,
        canRedeem: points >= 10,
      });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed." });
    }

    if (!req.headers["content-type"]?.toLowerCase().includes("application/json")) {
      return res.status(415).json({ error: "Send order details as JSON." });
    }

    const body =
      typeof req.body === "string"
        ? (() => {
            try {
              return JSON.parse(req.body);
            } catch {
              return null;
            }
          })()
        : req.body;

    if (Buffer.byteLength(JSON.stringify(body ?? null), "utf8") > 12_000) {
      return res.status(413).json({ error: "Order details are too large." });
    }

    const pinAlloc = typeof allocateOrderPin === "function" ? await allocateOrderPin() : { pin: generateOrderPin() };
    const orderPin = pinAlloc.pin || generateOrderPin();
    let customerUsernamePre = null;
    try {
      const { resolveCustomerSession } = require("./auth");
      const { isSessionRevoked } = require("./redis");
      const sess = resolveCustomerSession(req);
      if (sess && sess.username && !(sess.jti && await isSessionRevoked(sess.jti))) {
        customerUsernamePre = sess.username;
      }
    } catch (_) {}

    const wantsLoyaltyRedeem = Boolean(body?.redeemLoyalty) || Boolean(body?.loyaltyRewardId && String(body.loyaltyRewardId).trim());
    if (wantsLoyaltyRedeem && !customerUsernamePre) {
      return res.status(401).json({ error: "Please sign in to your account to redeem loyalty points." });
    }

    const loyaltyKey = customerUsernamePre || "";
    const availablePoints = loyaltyKey ? await getLoyaltyBalance(loyaltyKey) : 0;
    let resolvedVoucher = null;
    if (body && typeof body.promoCode === "string" && body.promoCode.trim()) {
      const preCheck = await validateVoucherForOrder(body.promoCode.trim(), 999999999);
      if (!preCheck.valid) {
        return res.status(400).json({ error: preCheck.error });
      }
      resolvedVoucher = preCheck.voucher;
    }

    const validatedOrder = validateOrder(body, orderPin, {
      voucher: resolvedVoucher,
      redeemLoyalty: Boolean(body?.redeemLoyalty),
      loyaltyRewardId: body?.loyaltyRewardId ? String(body.loyaltyRewardId).trim() : null,
      availablePoints,
    });
    if (!validatedOrder.error && resolvedVoucher && resolvedVoucher.minOrder > 0 && validatedOrder.pricing.subtotal < resolvedVoucher.minOrder) {
      return res.status(400).json({
        error: `${resolvedVoucher.code} requires a minimum food subtotal of ₦${resolvedVoucher.minOrder.toLocaleString("en-NG")}.`,
      });
    }
    if (validatedOrder.error) {
      return res.status(400).json({ error: validatedOrder.error });
    }

    const orderId = generateOrderId();
    const timestamp = new Date().toISOString();
    const customerUsername = customerUsernamePre;

    const orderRecord = {
      orderId,
      orderPin,
      timestamp,
      customerUsername,
      ...validatedOrder.orderData,
    };

    // Store the order without delaying the WhatsApp handoff.
    // Order is returned to the customer even if storage fails.
    const { insertOrder } = require("./db");
    const { recordOrderForTracking } = require("./track");
    if (typeof recordOrderForTracking === "function") {
      recordOrderForTracking(orderRecord);
    }

    const results = await Promise.allSettled([insertOrder(orderRecord)]);
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("[Storage] Failed to save order:", result.reason);
      }
    }

    const recipient = getRestaurantWhatsAppNumber();
    const whatsappUrl = `https://wa.me/${recipient}?text=${encodeURIComponent(validatedOrder.message)}`;

    let updatedLoyaltyBalance = availablePoints;
    if (loyaltyKey && (validatedOrder.pricing.loyaltyPointsRedeemed || 0) > 0) {
      const atomicRes = await redeemLoyaltyPointsAtomic(loyaltyKey, validatedOrder.pricing.loyaltyPointsRedeemed);
      if (!atomicRes.ok) {
        return res.status(400).json({ error: "Insufficient loyalty points balance for this reward." });
      }
      updatedLoyaltyBalance = atomicRes.balance;
    }

    return res.status(200).json({
      message: "Your WhatsApp message is ready to send.",
      loyaltyPointsPending: validatedOrder.pricing.loyaltyPointsEarned || 0,
      loyaltyPointsEarned: validatedOrder.pricing.loyaltyPointsEarned || 0,
      loyaltyRewardRedeemed: validatedOrder.pricing.loyaltyRewardRedeemed || null,
      loyaltyBalance: updatedLoyaltyBalance,
      promoCode: validatedOrder.pricing.voucherCode || null,
      promoDiscount: validatedOrder.pricing.promoDiscount || 0,
      orderId,
      orderPin,
      pricing: validatedOrder.pricing,
      whatsappUrl,
    });
  } finally {
    releaseRequestSlot();
  }
};

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

function validateOrder(body, orderPin) {
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
  if (fulfilment !== "Delivery" && fulfilment !== "Pickup") {
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
  const itemsMap = {};
  if (Array.isArray(body.items)) {
    for (const item of body.items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const itemName = normalizeItemName(cleanText(item.name, 80));
      const quantity = Number(item.quantity);
      if (itemName && Number.isInteger(quantity) && quantity > 0 && quantity <= 50) {
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

  const pricing = calculateOrderTotals(itemsMap, fulfilment);
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
  }

  lines.push("", "*Order Items:*");
  for (const item of items) {
    lines.push(`• ${item}`);
  }
  if (additionalItems) {
    lines.push(`• Additional Items/Requests: ${additionalItems}`);
  }

  const isDelivery = fulfilment === "Delivery";
  lines.push(
    "",
    "*Payment Summary:*",
    `• Subtotal: ${formatNaira(pricing.subtotal)}`,
    `• Service Fee: ${formatNaira(pricing.serviceFee !== undefined ? pricing.serviceFee : (pricing.totalCount > 0 ? 800 : 0))}`,
    `• Delivery Fee: ${isDelivery ? formatNaira(pricing.deliveryFee) : "₦0 (Free Pickup)"}`,
    `• Grand Total: ${formatNaira(pricing.grandTotal)}`
  );

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
    const validatedOrder = validateOrder(body, orderPin);
    if (validatedOrder.error) {
      return res.status(400).json({ error: validatedOrder.error });
    }

    const orderId = generateOrderId();
    const timestamp = new Date().toISOString();
    let customerUsername = null;
    try {
      const { resolveCustomerSession } = require("./auth");
      const sess = resolveCustomerSession(req);
      if (sess && sess.username) customerUsername = sess.username;
    } catch (_) {}

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

    return res.status(200).json({
      message: "Your WhatsApp message is ready to send.",
      orderId,
      orderPin,
      pricing: validatedOrder.pricing,
      whatsappUrl,
    });
  } finally {
    releaseRequestSlot();
  }
};

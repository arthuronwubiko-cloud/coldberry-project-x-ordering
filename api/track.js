// Order Tracking API for Romeo's Pizza Nigeria
// Look up active order status using customer phone number and 6-digit PIN.

const {
  findOrderForTracking,
  findRefundByTracking,
  updateOrderStatus,
  saveLocalOrder,
  updateLocalOrderStatus,
  CANCELLATION_WINDOW_MS = 12 * 60 * 1000,
} = require("./db");

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

// In-memory recent orders cache for tracking when external DB is in ephemeral/mock mode
const recentOrdersCache = new Map();

function recordOrderForTracking(order) {
  if (!order || !order.orderPin || !order.customerPhone) return;
  const key = `${order.customerPhone}:${order.orderPin}`;
  const normalized = {
    order_id: order.orderId,
    order_pin: order.orderPin,
    customer_phone: order.customerPhone,
    status: order.status || "pending",
    fulfilment: order.fulfilment,
    location: order.location,
    items: order.items,
    created_at: order.timestamp || new Date().toISOString(),
  };
  recentOrdersCache.set(key, normalized);
  if (typeof saveLocalOrder === "function") {
    saveLocalOrder(order);
  }
}

function computeCancellationEligibility(order, now = Date.now()) {
  const createdMs = Date.parse(order?.created_at || order?.timestamp);
  const effectiveCreated = Number.isFinite(createdMs) ? createdMs : now;
  const elapsedMs = Math.max(0, now - effectiveCreated);
  const statusKey = (order?.status || "pending").toLowerCase();
  const blockedStatuses = new Set(["cancelled", "completed", "out_for_delivery"]);
  const withinWindow = elapsedMs <= CANCELLATION_WINDOW_MS;
  const canCancel = withinWindow && !blockedStatuses.has(statusKey);
  const cancelRemainingSeconds = canCancel
    ? Math.max(0, Math.ceil((CANCELLATION_WINDOW_MS - elapsedMs) / 1000))
    : 0;
  return {
    withinWindow,
    elapsedMs,
    statusKey,
    canCancel,
    cancelRemainingSeconds,
    cancelWindowMinutes: 12,
  };
}

const STATUS_STEPS = {
  pending: { step: 1, label: "Order Received", desc: "Your order request has been received." },
  confirmed: { step: 2, label: "Confirmed", desc: "Restaurant has confirmed order details." },
  preparing: { step: 3, label: "In the Kitchen", desc: "Your pizza is being freshly baked!" },
  out_for_delivery: { step: 4, label: "Out for Delivery", desc: "Rider is heading to your address." },
  ready: { step: 4, label: "Ready for Pickup", desc: "Your order is hot and ready at the counter." },
  completed: { step: 5, label: "Delivered / Collected", desc: "Order fulfilled. Enjoy your meal!" },
  cancelled: { step: 0, label: "Cancelled", desc: "This order was cancelled." },
};

function formatTrackingOrderPayload(order, now = Date.now()) {
  const statusKey = (order.status || "pending").toLowerCase();
  const stepInfo = STATUS_STEPS[statusKey] || STATUS_STEPS.pending;
  const cancelInfo = computeCancellationEligibility(order, now);

  return {
    found: true,
    order: {
      orderId: order.order_id,
      orderPin: order.order_pin,
      status: order.status || "pending",
      statusLabel: stepInfo.label,
      statusDescription: stepInfo.desc,
      step: stepInfo.step,
      totalSteps: 5,
      fulfilment: order.fulfilment,
      location: order.location,
      items: order.items,
      createdAt: order.created_at,
      canCancel: cancelInfo.canCancel,
      cancelRemainingSeconds: cancelInfo.cancelRemainingSeconds,
      cancelWindowMinutes: cancelInfo.cancelWindowMinutes,
      canMarkReceived: !["completed", "cancelled"].includes((order.status || "").toLowerCase()),
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
    getCachedResponse,
    setCachedResponse,
    applyCorsHeaders,
  } = require("./overload-protection");

  applyCorsHeaders(req, res, "GET, POST, DELETE, OPTIONS", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    res.setHeader("Retry-After", String(rateLimit.retryAfter));
    return res.status(429).json({
      error: "Too many tracking lookups. Please wait a moment.",
      retryAfter: rateLimit.retryAfter,
    });
  }

  if (!acquireRequestSlot()) {
    res.setHeader("Retry-After", "1");
    return res.status(503).json({
      error: "Tracking service is temporarily busy. Please retry shortly.",
    });
  }

  try {
    if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE") {
      res.setHeader("Allow", "GET, POST, DELETE");
      return res.status(405).json({ error: "Method not allowed." });
    }

    const body =
      typeof req.body === "string"
        ? (() => {
            try { return JSON.parse(req.body); } catch { return {}; }
          })()
        : (req.body || {});

    const phoneRaw = req.method === "GET" ? req.query?.phone : (body.phone || req.query?.phone);
    const pinRaw = req.method === "GET" ? req.query?.pin : (body.pin || req.query?.pin);
    const action = String(body.action || "").toLowerCase();
    const isCancelAction =
      req.method === "DELETE" ||
      (req.method === "POST" && action === "cancel");
    const isMarkReceivedAction =
      req.method === "POST" &&
      ["mark_received", "mark_done", "done", "received"].includes(action);

    const phone = normalizePhoneNumber(phoneRaw || "");
    const pin = String(pinRaw || "").trim();

    if (!phone) {
      return res.status(400).json({ error: "Enter a valid phone number (e.g. 08012345678)." });
    }

    if (!/^\d{6}$/.test(pin)) {
      return res.status(400).json({ error: "Enter a valid 6-digit Order PIN." });
    }

    const phoneRateLimit = checkRateLimit(`track:${clientIp}:${phone}`, 15, 15 * 60 * 1000);
    if (!phoneRateLimit.allowed) {
      res.setHeader("Retry-After", String(phoneRateLimit.retryAfter));
      return res.status(429).json({
        error: "Too many tracking attempts for this phone number. Please try again later.",
        retryAfter: phoneRateLimit.retryAfter,
      });
    }

    const cacheKey = `track:${phone}:${pin}`;
    const now = Date.now();

    if (!isCancelAction && !isMarkReceivedAction) {
      // Micro-cache check for lookup queries, recalculating live cancel timer
      const cached = getCachedResponse(cacheKey);
      if (cached && cached._rawOrder) {
        return res.status(200).json(formatTrackingOrderPayload(cached._rawOrder, now));
      }
    }

    // 1. Check database + local store
    const dbResult = await findOrderForTracking(phone, pin);
    let order = dbResult.order;

    // 2. Fallback to recent local cache if database is not configured or didn't find row
    if (!order) {
      const key = `${phone}:${pin}`;
      order = recentOrdersCache.get(key) || null;
    }

    if (!order) {
      const refundRec = await findRefundByTracking(phone, pin);
      if (refundRec) {
        return res.status(200).json({
          found: true,
          refunded: true,
          refund: {
            token: refundRec.token,
            amount: Number(refundRec.amount || 0),
            status: refundRec.status || "unclaimed",
            reason: refundRec.reason || "Order Refunded",
            issuedAt: refundRec.issued_at,
            claimedAt: refundRec.claimed_at || null,
          },
          order: {
            orderId: refundRec.order_id,
            orderPin: refundRec.order_pin || pin,
            status: "cancelled",
            statusLabel: "Refund Issued",
            statusDesc: "Your order was refunded. Use your 15-character refund token below.",
            step: 0,
            fulfilment: "Refund",
            location: "Romeo's Pizza Nigeria",
            items: `Refunded Order (${refundRec.order_id})`,
            createdAt: refundRec.issued_at,
            canCancel: false,
            canMarkReceived: false,
            cancelRemainingSeconds: 0,
            cancelWindowMinutes: 12,
          },
        });
      }
      return res.status(404).json({
        error: "No active order found for this phone number and PIN placed in the last 5 days.",
      });
    }

    // Customer confirmation of order receipt (mark received / done)
    if (isMarkReceivedAction) {
      const currentStatus = (order.status || "pending").toLowerCase();

      if (currentStatus === "cancelled") {
        return res.status(400).json({
          error: "This order has been cancelled and cannot be marked as received.",
        });
      }

      if (currentStatus === "completed") {
        const payload = formatTrackingOrderPayload(order, now);
        return res.status(200).json({
          completed: true,
          message: "Your order is already marked as received. Enjoy your Romeo's Pizza!",
          ...payload,
        });
      }

      // If order is active/ready/out_for_delivery/preparing/pending/confirmed
      await updateOrderStatus(order.order_id, "completed");
      updateCachedOrderStatus(order.order_id, "completed");
      order.status = "completed";
      setCachedResponse(cacheKey, null, 0);

      const payload = formatTrackingOrderPayload(order, now);
      return res.status(200).json({
        completed: true,
        received: true,
        message: "Thank you! Your delivery is marked as received. Enjoy your Romeo's Pizza!",
        ...payload,
      });
    }

    // Customer 12-minute easy order cancellation flow
    if (isCancelAction) {
      const eligibility = computeCancellationEligibility(order, now);

      if (eligibility.statusKey === "cancelled") {
        return res.status(400).json({ error: "This order has already been cancelled." });
      }
      if (eligibility.statusKey === "completed" || eligibility.statusKey === "out_for_delivery") {
        return res.status(400).json({
          error: "Order cannot be cancelled because it is already out for delivery or completed.",
        });
      }
      if (!eligibility.withinWindow) {
        return res.status(400).json({
          error: "The 12-minute cancellation window has expired. Orders can only be cancelled within 12 minutes of placing them.",
        });
      }

      await updateOrderStatus(order.order_id, "cancelled");
      updateCachedOrderStatus(order.order_id, "cancelled");
      order.status = "cancelled";
      setCachedResponse(cacheKey, null, 0);

      const payload = formatTrackingOrderPayload(order, now);
      return res.status(200).json({
        cancelled: true,
        message: "Your order has been cancelled.",
        ...payload,
      });
    }

    const responsePayload = formatTrackingOrderPayload(order, now);
    const refundRec = await findRefundByTracking(phone, pin);
    if (refundRec) {
      responsePayload.refunded = true;
      responsePayload.refund = {
        token: refundRec.token,
        amount: Number(refundRec.amount || 0),
        status: refundRec.status || "unclaimed",
        reason: refundRec.reason || "Order Refunded",
        issuedAt: refundRec.issued_at,
        claimedAt: refundRec.claimed_at || null,
      };
    } else {
      setCachedResponse(cacheKey, { _rawOrder: { ...order } }, 5000); // 5s TTL
    }
    return res.status(200).json(responsePayload);
  } finally {
    releaseRequestSlot();
  }
};

module.exports.recordOrderForTracking = recordOrderForTracking;
module.exports.computeCancellationEligibility = computeCancellationEligibility;
module.exports.formatTrackingOrderPayload = formatTrackingOrderPayload;
module.exports.CANCELLATION_WINDOW_MS = CANCELLATION_WINDOW_MS;

function updateCachedOrderStatus(orderId, status) {
  if (typeof updateLocalOrderStatus === "function") {
    updateLocalOrderStatus(orderId, status);
  }
  for (const [, order] of recentOrdersCache.entries()) {
    if (order.order_id === orderId) {
      order.status = status;
      // Invalidate micro-cache so live queries see the update immediately
      const microKey = `track:${order.customer_phone}:${order.order_pin}`;
      const { setCachedResponse } = require("./overload-protection");
      setCachedResponse(microKey, null, 0);
      break;
    }
  }
}

module.exports.updateCachedOrderStatus = updateCachedOrderStatus;

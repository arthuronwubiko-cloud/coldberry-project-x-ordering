// Role-Based Order Verification & State Management API for Romeo's Pizza Nigeria.
// Supports separate-origin hosting (CORS), 14-character alphanumeric Admin & Staff
// authentication, HMAC session tokens, and strict RBAC:
// - admin: full read (unmasked PII), change any state, cancel orders, delete orders, export
// - staff: state-change only (confirmed, preparing, out_for_delivery, ready, completed);
//          customer PII masked; cancel & delete forbidden (HTTP 403).

const crypto = require("crypto");
const {
  getOrders,
  updateOrderStatus,
  deleteOrder,
  ORDER_STATUSES,
  findOrderById,
  saveRefundToken,
  getRefundTokens,
  findRefundToken,
  claimRefundToken,
  deleteRefundToken,
  deleteClaimedRefundTokens,
  recordVisitorHit,
  getActiveVisitorCount,
  getFeedback,
  deleteFeedback,
  getCustomerUsers,
  deleteCustomerUser,
  saveCustomerMessage,
  getAllCustomerMessages,
  savePromotionalEmail,
  getPromotionalEmails,
} = require("./db");
const {
  checkRedisRateLimit,
  isLoginLockedOut,
  recordFailedLogin,
  clearFailedLogins,
  storeSession,
  revokeSession,
  revokeAllUserSessions,
  isSessionRevokedSync,
  isSessionRevoked,
} = require("./redis");

const CREDENTIAL_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{14}$/;
const STAFF_ALLOWED_STATUSES = ["confirmed", "preparing", "out_for_delivery", "ready", "completed"];
const DRIVER_ALLOWED_STATUSES = ["out_for_delivery", "completed"];
const COMPLETED_CONSOLE_STATUSES = ["out_for_delivery", "completed"];
const STAFF_COMPLETED_WINDOW_MS = 48 * 60 * 60 * 1000;       // 48 hours
const MANAGER_COMPLETED_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (1 week)
const DRIVER_COMPLETED_WINDOW_MS = 3 * 60 * 60 * 1000;       // 3 hours (2-3 hour window)

function isOrderCompletedForConsole(order) {
  const st = String(order?.status || "").toLowerCase();
  return COMPLETED_CONSOLE_STATUSES.includes(st);
}

function isOrderWithinWindow(order, windowMs, useCompletedAt = false) {
  const tsStr = useCompletedAt
    ? (order?.completed_at || order?.created_at || order?.timestamp)
    : (order?.created_at || order?.timestamp);
  const ts = Date.parse(tsStr || "");
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts <= windowMs;
}

function escapeCsvCell(val) {
  let str = String(val == null ? "" : val).replace(/\r?\n/g, " ");
  if (/^[=+\-@\t\r]/.test(str)) {
    str = "'" + str;
  }
  if (/[",]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildOrdersCsv(orders) {
  const headers = [
    "order_id",
    "order_pin",
    "created_at",
    "status",
    "payment_status",
    "fulfilment",
    "location",
    "customer_name",
    "customer_phone",
    "customer_email",
    "address",
    "items",
    "subtotal",
    "service_fee",
    "delivery_fee",
    "grand_total",
    "ready_confirmed_by",
    "ready_confirmed_at",
    "completed_by",
    "completed_at",
    "notes",
  ];
  const lines = [headers.join(",")];
  for (const o of orders) {
    const row = [
      o.order_id || o.orderId || "",
      o.order_pin || o.orderPin || "",
      o.created_at || o.timestamp || "",
      o.status || "pending",
      o.payment_status || o.paymentStatus || "pending",
      o.fulfilment || "",
      o.location || "",
      o.customer_name || o.customerName || "",
      o.customer_phone || o.customerPhone || "",
      o.customer_email || o.customerEmail || "",
      o.address || "",
      typeof o.items === "string" ? o.items : JSON.stringify(o.items || ""),
      Number(o.subtotal ?? o.sub_total ?? 0),
      Number(o.service_fee ?? o.serviceFee ?? 0),
      Number(o.delivery_fee ?? o.deliveryFee ?? 0),
      Number(o.grand_total ?? o.grandTotal ?? 0),
      o.ready_confirmed_by || "",
      o.ready_confirmed_at || "",
      o.completed_by || "",
      o.completed_at || "",
      o.notes || "",
    ];
    lines.push(row.map(escapeCsvCell).join(","));
  }
  return lines.join("\n");
}
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPromoEmailHtml({ subject, textBody, ctaText, ctaUrl }) {
  const safeSubject = escapeHtml(subject);
  const safeBody = escapeHtml(textBody).replace(/\r?\n/g, "<br/>");
  const safeCtaUrl = /^https?:\/\//i.test(String(ctaUrl || "")) ? String(ctaUrl) : "";
  const safeCtaText = escapeHtml(ctaText || "Order Now");
  const ctaBlock = safeCtaUrl
    ? `<div style="margin:24px 0;"><a href="${escapeHtml(safeCtaUrl)}" style="display:inline-block;background:#e63946;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:8px;">${safeCtaText}</a></div>`
    : "";
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f7f4ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1e1e1e;">
  <div style="max-width:580px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #eadfd2;">
    <div style="background:#1c1917;color:#ffffff;padding:20px 24px;">
      <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#f59e0b;font-weight:700;">Coldberry Ice Cream Nigeria</div>
      <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3;">${safeSubject}</h1>
    </div>
    <div style="padding:24px;font-size:15px;line-height:1.6;">
      <p style="margin:0 0 16px;">${safeBody}</p>
      ${ctaBlock}
      <hr style="border:none;border-top:1px solid #eee4d8;margin:24px 0;" />
      <p style="margin:0;font-size:12px;color:#6b7280;">You received this promotional update because you registered an account with Coldberry Ice Cream Nigeria.</p>
    </div>
  </div>
</body></html>`;
}

async function dispatchPromoEmails({ recipients, subject, textBody, ctaText, ctaUrl }) {
  const html = buildPromoEmailHtml({ subject, textBody, ctaText, ctaUrl });
  const fromEmail = process.env.PROMO_FROM_EMAIL || "Coldberry Ice Cream Nigeria <onboarding@resend.dev>";

  if (process.env.RESEND_API_KEY) {
    let sentCount = 0;
    let failedCount = 0;
    const errors = [];
    for (const to of recipients) {
      try {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ from: fromEmail, to: [to], subject, html, text: textBody }),
        });
        if (resp.ok) sentCount += 1;
        else {
          failedCount += 1;
          errors.push(`${to}: HTTP ${resp.status}`);
        }
      } catch (err) {
        failedCount += 1;
        errors.push(`${to}: ${err.message}`);
      }
    }
    return { provider: "resend", sentCount, failedCount, errors };
  }

  if (process.env.BREVO_API_KEY) {
    let sentCount = 0;
    let failedCount = 0;
    const errors = [];
    const senderEmail = (fromEmail.match(/<([^>]+)>/) || [])[1] || fromEmail;
    for (const to of recipients) {
      try {
        const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: {
            "api-key": process.env.BREVO_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sender: { name: "Coldberry Ice Cream Nigeria", email: senderEmail },
            to: [{ email: to }],
            subject,
            htmlContent: html,
            textContent: textBody,
          }),
        });
        if (resp.ok) sentCount += 1;
        else {
          failedCount += 1;
          errors.push(`${to}: HTTP ${resp.status}`);
        }
      } catch (err) {
        failedCount += 1;
        errors.push(`${to}: ${err.message}`);
      }
    }
    return { provider: "brevo", sentCount, failedCount, errors };
  }

  if (process.env.SENDGRID_API_KEY) {
    let sentCount = 0;
    let failedCount = 0;
    const errors = [];
    const senderEmail = (fromEmail.match(/<([^>]+)>/) || [])[1] || fromEmail;
    for (const to of recipients) {
      try {
        const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: senderEmail, name: "Coldberry Ice Cream Nigeria" },
            subject,
            content: [
              { type: "text/plain", value: textBody },
              { type: "text/html", value: html },
            ],
          }),
        });
        if (resp.ok) sentCount += 1;
        else {
          failedCount += 1;
          errors.push(`${to}: HTTP ${resp.status}`);
        }
      } catch (err) {
        failedCount += 1;
        errors.push(`${to}: ${err.message}`);
      }
    }
    return { provider: "sendgrid", sentCount, failedCount, errors };
  }

  return { provider: "preview_log", sentCount: recipients.length, failedCount: 0, errors: [] };
}

let ephemeralAdminSecret = null;

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function timingSafeHexEqual(hexA, hexB) {
  if (!hexA || !hexB || hexA.length !== hexB.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(hexA, "hex"), Buffer.from(hexB, "hex"));
  } catch (_) {
    return false;
  }
}

function getSigningKey() {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SECRET;
  if (secret) return secret;
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_SESSION_SECRET or ADMIN_SECRET must be configured in production.");
  }
  if (!ephemeralAdminSecret) {
    ephemeralAdminSecret = crypto.randomBytes(32).toString("hex");
  }
  return ephemeralAdminSecret;
}

function generate15CharRefundToken() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let token = "";
  const bytes = crypto.randomBytes(15);
  for (let i = 0; i < 15; i++) {
    token += chars[bytes[i] % chars.length];
  }
  return token;
}

function getConfiguredRoleCredentials() {
  const roles = [];
  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    roles.push({
      role: "admin",
      user: sha256Hex(process.env.ADMIN_USERNAME),
      pass: sha256Hex(process.env.ADMIN_PASSWORD),
    });
  }
  if (process.env.MANAGER_USERNAME && process.env.MANAGER_PASSWORD) {
    roles.push({
      role: "manager",
      user: sha256Hex(process.env.MANAGER_USERNAME),
      pass: sha256Hex(process.env.MANAGER_PASSWORD),
    });
  }
  if (process.env.STAFF_USERNAME && process.env.STAFF_PASSWORD) {
    roles.push({
      role: "staff",
      user: sha256Hex(process.env.STAFF_USERNAME),
      pass: sha256Hex(process.env.STAFF_PASSWORD),
    });
  }
  if (process.env.DRIVER_USERNAME && process.env.DRIVER_PASSWORD) {
    roles.push({
      role: "driver",
      user: sha256Hex(process.env.DRIVER_USERNAME),
      pass: sha256Hex(process.env.DRIVER_PASSWORD),
    });
  }
  return roles;
}

function authenticateCredentials(username, password) {
  if (!CREDENTIAL_REGEX.test(String(username || "")) || !CREDENTIAL_REGEX.test(String(password || ""))) {
    return { invalidFormat: true };
  }
  const uHex = sha256Hex(username);
  const pHex = sha256Hex(password);
  const configured = getConfiguredRoleCredentials();

  for (const cred of configured) {
    if (timingSafeHexEqual(uHex, cred.user) && timingSafeHexEqual(pHex, cred.pass)) {
      return { username, role: cred.role };
    }
  }
  return null;
}

function issueSessionToken(username, role, customJti) {
  const jti = customJti || (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : crypto.randomBytes(12).toString("hex"));
  const payload = Buffer.from(
    JSON.stringify({
      jti,
      u: username,
      r: role,
      exp: Date.now() + SESSION_TTL_MS,
    }),
    "utf8"
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", getSigningKey()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifySessionToken(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, providedSig] = parts;
  const expectedSig = crypto.createHmac("sha256", getSigningKey()).update(payload).digest("base64url");
  if (providedSig.length !== expectedSig.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(providedSig, "utf8"), Buffer.from(expectedSig, "utf8"))) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!decoded || !decoded.r || !decoded.u || Date.now() > Number(decoded.exp || 0)) {
      return null;
    }
    if (decoded.jti && isSessionRevokedSync(decoded.jti)) {
      return null;
    }
    return { username: decoded.u, role: decoded.r, jti: decoded.jti || null };
  } catch (_) {
    return null;
  }
}

function resolveAuthFromRequest(req) {
  const headers = req.headers || {};

  // 1. Bearer session token or legacy ADMIN_SECRET (header only, never query string)
  const candidateToken = headers.authorization?.startsWith("Bearer ") ? headers.authorization.slice(7).trim() : null;

  if (candidateToken) {
    const tokenAuth = verifySessionToken(candidateToken);
    if (tokenAuth) return tokenAuth;

    const envSecret = process.env.ADMIN_SECRET;
    if (envSecret) {
      const a = Buffer.from(String(candidateToken), "utf8");
      const b = Buffer.from(String(envSecret), "utf8");
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return { username: "env-admin", role: "admin" };
      }
    }
  }

  // 2. Custom credential headers (X-Auth-Username + X-Auth-Password)
  const hdrUser = headers["x-auth-username"];
  const hdrPass = headers["x-auth-password"];
  if (hdrUser && hdrPass) {
    const auth = authenticateCredentials(hdrUser, hdrPass);
    if (auth && !auth.invalidFormat) return auth;
  }

  // 3. HTTP Basic auth header
  if (headers.authorization?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(headers.authorization.slice(6).trim(), "base64").toString("utf8");
      const sep = decoded.indexOf(":");
      if (sep > 0) {
        const u = decoded.slice(0, sep);
        const p = decoded.slice(sep + 1);
        const auth = authenticateCredentials(u, p);
        if (auth && !auth.invalidFormat) return auth;
      }
    } catch (_) {}
  }

  return null;
}

function maskPhone(phone) {
  const str = String(phone || "");
  if (str.length <= 4) return "****";
  return `${"*".repeat(Math.max(4, str.length - 4))}${str.slice(-4)}`;
}

function maskEmail(email) {
  if (!email || typeof email !== "string") return null;
  const parts = email.split("@");
  if (parts.length !== 2) return "***@***";
  const user = parts[0];
  const domain = parts[1];
  const maskedUser = user.length > 2 ? user[0] + "***" + user.slice(-1) : "***";
  return `${maskedUser}@${domain}`;
}

function sanitizeOrderForStaff(order) {
  const fullName = String(order.customer_name || order.customerName || "Customer").trim();
  const firstName = fullName.split(/\s+/)[0] || "Customer";
  return {
    order_id: order.order_id || order.orderId,
    order_pin: order.order_pin || order.orderPin || null,
    customer_name: firstName,
    customer_phone: maskPhone(order.customer_phone || order.customerPhone),
    fulfilment: order.fulfilment,
    location: order.location,
    items: order.items,
    notes: order.notes,
    status: order.status || "pending",
    created_at: order.created_at || order.timestamp,
    subtotal: Number(order.subtotal ?? order.sub_total ?? 0),
    service_fee: Number(order.service_fee ?? order.serviceFee ?? 800),
    delivery_fee: Number(order.delivery_fee ?? order.deliveryFee ?? 0),
    grand_total: Number(order.grand_total ?? order.grandTotal ?? 0),
    payment_status: order.payment_status || order.paymentStatus || "pending",
  };
}

function sanitizeOrderForDriver(order) {
  return {
    order_id: order.order_id || order.orderId,
    order_pin: order.order_pin || order.orderPin || null,
    customer_name: order.customer_name || order.customerName || "Customer",
    customer_phone: order.customer_phone || order.customerPhone || "",
    customer_email: maskEmail(order.customer_email || order.customerEmail || order.email),
    address: order.address || "",
    fulfilment: order.fulfilment || "Delivery",
    location: order.location || "",
    items: order.items || "",
    notes: order.notes || "",
    status: order.status || "pending",
    created_at: order.created_at || order.timestamp,
    subtotal: Number(order.subtotal ?? order.sub_total ?? 0),
    service_fee: Number(order.service_fee ?? order.serviceFee ?? 800),
    delivery_fee: Number(order.delivery_fee ?? order.deliveryFee ?? 0),
    grand_total: Number(order.grand_total ?? order.grandTotal ?? 0),
    payment_status: order.payment_status || order.paymentStatus || "pending",
  };
}

function getPermissionsForRole(role) {
  if (role === "admin") {
    return ["read_all", "change_state", "cancel", "delete", "export", "refunds", "feedback", "users"];
  }
  if (role === "manager") {
    return ["read_orders", "change_state", "cancel", "delete_for_refund", "refunds"];
  }
  if (role === "driver") {
    return ["read_deliveries", "change_delivery_state"];
  }
  return ["change_state"];
}

function parseBody(req) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (_) {
      return {};
    }
  }
  return req.body || {};
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const {
    acquireRequestSlot,
    releaseRequestSlot,
    checkRateLimit,
    getClientIp,
    applyCorsHeaders,
  } = require("./overload-protection");

  applyCorsHeaders(req, res, "GET, POST, PATCH, DELETE, OPTIONS", "Content-Type, Authorization, X-Auth-Username, X-Auth-Password");

  if (req.method === "OPTIONS") {
    return res.status(204).send("");
  }

  if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, PATCH, DELETE, OPTIONS");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const clientIp = getClientIp(req);
  const generalRate = checkRateLimit(`admin:${clientIp}`, 120, 60_000);
  if (!generalRate.allowed) {
    res.setHeader("Retry-After", String(generalRate.retryAfter));
    return res.status(429).json({ error: "Too many requests. Please wait a moment." });
  }

  if (!acquireRequestSlot()) {
    res.setHeader("Retry-After", "1");
    return res.status(503).json({ error: "Service temporarily busy. Please retry shortly." });
  }

  try {
  // POST actions
  if (req.method === "POST") {
    const body = parseBody(req);
    const action = String(body.action || "").toLowerCase();

    // 1. Verify Refund Token (Admin / Staff only)
    if (action === "verify_refund_token" || action === "verify_refund") {
      const postAuth = resolveAuthFromRequest(req);
      if (!postAuth || (postAuth.role !== "admin" && postAuth.role !== "manager")) {
        return res.status(401).json({ error: "Unauthorized. Admin or staff authentication required." });
      }
      const token = String(body.token || body.refundToken || "").trim().toUpperCase();
      if (!token) return res.status(400).json({ error: "Refund token is required." });
      const rec = await findRefundToken(token);
      if (!rec) return res.status(404).json({ valid: false, error: "Refund token not found or invalid." });
      return res.status(200).json({
        valid: true,
        verified: true,
        token: rec.token,
        refundToken: rec.token,
        orderId: rec.order_id,
        customerName: rec.customer_name,
        customerPhone: rec.customer_phone,
        refundedAmount: Number(rec.amount),
        amount: Number(rec.amount),
        reason: rec.reason,
        issuedBy: rec.issued_by,
        issuedAt: rec.issued_at,
        status: rec.status,
        claimedAt: rec.claimed_at,
        checkedIn: rec.status === "claimed",
      });
    }

    // 2. Check-In / Claim Refund Token (Admin / Staff only)
    if (action === "check_in_refund" || action === "claim_refund" || action === "checkin_refund") {
      const auth = resolveAuthFromRequest(req);
      if (!auth || (auth.role !== "admin" && auth.role !== "manager")) {
        return res.status(401).json({ error: "Unauthorized. Admin or staff authentication required to claim refund tokens." });
      }
      const token = String(body.token || body.refundToken || "").trim().toUpperCase();
      if (!token) return res.status(400).json({ error: "Refund token is required." });
      const claimRes = await claimRefundToken(token, auth.username);
      if (claimRes.error) {
        return res.status(400).json({ error: claimRes.error, record: claimRes.record, alreadyClaimed: claimRes.alreadyClaimed });
      }
      return res.status(200).json({
        success: true,
        claimed: true,
        checkedIn: true,
        token: claimRes.token,
        record: claimRes.record,
      });
    }

    // 3. Heartbeat / active visitor recording
    if (action === "heartbeat") {
      const hitCount = recordVisitorHit(body.clientId || req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress);
      return res.status(200).json({ activeVisitors: hitCount });
    }

    // 4. Admin Broadcast or Direct Message to Customers
    if (action === "send_message") {
      const postAuth = resolveAuthFromRequest(req);
      if (!postAuth || postAuth.role !== "admin") {
        return res.status(403).json({ error: "Access denied: Only admin accounts can send customer messages." });
      }
      const msgRes = await saveCustomerMessage({
        recipientUsername: body.target || body.recipientUsername || "ALL",
        recipientPhone: body.recipientPhone || null,
        sender: postAuth.username,
        title: body.title || "",
        body: body.message || body.body || "",
      });
      if (msgRes.error) {
        return res.status(400).json({ error: msgRes.error });
      }
      return res.status(200).json(msgRes);
    }

    // 5. Admin Promotional Email Campaign (Admin Only)
    if (action === "send_promo_email") {
      const postAuth = resolveAuthFromRequest(req);
      if (!postAuth || postAuth.role !== "admin") {
        return res.status(403).json({ error: "Access denied: Only admin accounts can send promotional emails." });
      }
      const subject = String(body.subject || "").trim();
      const textBody = String(body.body || body.message || "").trim();
      const targetMode = String(body.target || "ALL").trim().toUpperCase();
      const ctaText = String(body.ctaText || "").trim();
      const ctaUrl = String(body.ctaUrl || "").trim();

      if (subject.length < 3 || subject.length > 160) {
        return res.status(400).json({ error: "Email subject must be between 3 and 160 characters." });
      }
      if (textBody.length < 5 || textBody.length > 5000) {
        return res.status(400).json({ error: "Email message must be between 5 and 5000 characters." });
      }

      const recipientSet = new Set();
      if (targetMode === "CUSTOM") {
        const rawList = String(body.customEmails || "")
          .split(/[\s,;]+/)
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        for (const item of rawList) {
          if (EMAIL_REGEX.test(item)) recipientSet.add(item);
        }
      } else {
        const usersResult = await getCustomerUsers({ limit: 500 });
        for (const u of usersResult.users || []) {
          const em = String(u.email || "").trim().toLowerCase();
          if (EMAIL_REGEX.test(em)) recipientSet.add(em);
        }
      }

      const recipients = Array.from(recipientSet);
      if (recipients.length === 0) {
        return res.status(400).json({
          error:
            targetMode === "CUSTOM"
              ? "Enter at least one valid recipient email address."
              : "No registered customers with a valid email address were found yet.",
        });
      }

      const dispatch = await dispatchPromoEmails({
        recipients,
        subject,
        textBody,
        ctaText,
        ctaUrl,
      });

      const saved = await savePromotionalEmail({
        sender: postAuth.username,
        subject,
        body: textBody,
        ctaText,
        ctaUrl,
        recipientMode: targetMode,
        recipientCount: recipients.length,
        sentCount: dispatch.sentCount,
        failedCount: dispatch.failedCount,
        provider: dispatch.provider,
        recipients,
      });

      return res.status(200).json({
        success: true,
        provider: dispatch.provider,
        recipientCount: recipients.length,
        sentCount: dispatch.sentCount,
        failedCount: dispatch.failedCount,
        recipients,
        errors: dispatch.errors,
        campaign: saved.campaign,
        notice:
          dispatch.provider === "preview_log"
            ? "Campaign logged (no external email provider key configured). Set RESEND_API_KEY, BREVO_API_KEY, or SENDGRID_API_KEY and PROMO_FROM_EMAIL in Vercel to deliver live emails."
            : `Delivered ${dispatch.sentCount} of ${recipients.length} promotional email(s) via ${dispatch.provider}.`,
      });
    }

    if (action === "logout") {
      const auth = resolveAuthFromRequest(req);
      if (auth && auth.jti) {
        await revokeSession(auth.jti, SESSION_TTL_MS);
      }
      return res.status(200).json({ success: true, authenticated: false });
    }

    // Default POST: Login / verify 14-character alphanumeric username + password
    const redisRate = await checkRedisRateLimit(`admin_login:${clientIp}`, 15, 60_000);
    const loginRate = checkRateLimit(`admin_login:${clientIp}`, 15, 60_000);
    if (!redisRate.allowed || !loginRate.allowed) {
      res.setHeader("Retry-After", String(redisRate.retryAfter || loginRate.retryAfter || 60));
      return res.status(429).json({ error: "Too many login attempts. Please wait a minute." });
    }

    const username = String(body.username || "").trim();
    const password = String(body.password || "").trim();

    const lockoutKey = `console:${clientIp}:${username.toLowerCase()}`;
    const lockout = await isLoginLockedOut(lockoutKey);
    if (lockout.locked) {
      res.setHeader("Retry-After", String(lockout.retryAfter));
      return res.status(429).json({
        error: "Account temporarily locked due to repeated failed login attempts. Please try again later.",
        retryAfter: lockout.retryAfter,
      });
    }

    const result = authenticateCredentials(username, password);
    if (result && result.invalidFormat) {
      return res.status(400).json({
        error: "Username and password must each be exactly 14 alphanumeric characters (letters and numbers).",
      });
    }
    if (!result) {
      const failStatus = await recordFailedLogin(lockoutKey);
      if (failStatus.locked) {
        res.setHeader("Retry-After", String(failStatus.retryAfter));
        return res.status(429).json({
          error: "Account temporarily locked due to repeated failed login attempts. Please try again later.",
          retryAfter: failStatus.retryAfter,
        });
      }
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const requiredRoleRaw = String(body.requiredRole || body.consoleRole || "").trim().toLowerCase();
    const allowedRoles = requiredRoleRaw
      ? requiredRoleRaw.split(",").map((r) => r.trim()).filter((r) => ["admin", "manager", "staff", "driver"].includes(r))
      : [];
    if (allowedRoles.length > 0 && !allowedRoles.includes(result.role)) {
      return res.status(403).json({
        error: `Access denied: This console is strictly locked to ${allowedRoles.join(" / ")} accounts. Please sign in through your dedicated ${result.role} UI.`,
        role: result.role,
        requiredRole: requiredRoleRaw,
      });
    }

    await clearFailedLogins(lockoutKey);
    const jti = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : crypto.randomBytes(12).toString("hex");
    const token = issueSessionToken(result.username, result.role, jti);
    await storeSession(
      jti,
      { jti, u: result.username, r: result.role, exp: Date.now() + SESSION_TTL_MS },
      SESSION_TTL_MS
    );
    return res.status(200).json({
      authenticated: true,
      username: result.username,
      role: result.role,
      permissions: getPermissionsForRole(result.role),
      token,
    });
  }

  const auth = resolveAuthFromRequest(req);
  if (!auth || (auth.jti && await isSessionRevoked(auth.jti))) {
    return res.status(401).json({ error: "Unauthorized. Valid username and password session required." });
  }

  // PATCH: Change order status, payment status, or claim a refund token
  if (req.method === "PATCH") {
    const body = parseBody(req);

    if (body.action === "claim_refund" || body.action === "verify_refund") {
      if (auth.role !== "admin" && auth.role !== "manager") {
        return res.status(403).json({ error: "Access denied: Only admin or manager accounts can claim refund tokens." });
      }
      const token = String(body.token || "").trim().toUpperCase();
      if (!token || token.length !== 15) {
        return res.status(400).json({ error: "Valid 15-character refund token is required." });
      }
      const claimRes = await claimRefundToken(token, auth.username);
      if (claimRes.error) {
        return res.status(400).json({ error: claimRes.error });
      }
      return res.status(200).json({
        claimed: true,
        token: claimRes.token,
        record: claimRes.record,
      });
    }

    const { orderId, status, paymentStatus } = body;
    if (!orderId || (!status && !paymentStatus)) {
      return res.status(400).json({ error: "orderId and status or paymentStatus are required." });
    }

    if (status) {
      if (auth.role === "driver") {
        if (!DRIVER_ALLOWED_STATUSES.includes(status)) {
          return res.status(403).json({
            error: "Access denied: Driver accounts are only allowed to update delivery status to 'out_for_delivery' or 'completed'.",
          });
        }
      } else if (auth.role !== "admin" && auth.role !== "manager" && !STAFF_ALLOWED_STATUSES.includes(status)) {
        return res.status(403).json({
          error: "Access denied: Regular user accounts are only allowed to change operational order state (confirmed, preparing, out_for_delivery, ready, completed).",
        });
      }

      if (!ORDER_STATUSES.includes(status)) {
        return res.status(400).json({ error: "Invalid order status." });
      }
    }

    if (paymentStatus) {
      const validPayments = ["pending", "paid", "received", "unpaid"];
      if (!validPayments.includes(String(paymentStatus).toLowerCase())) {
        return res.status(400).json({ error: "Invalid paymentStatus. Allowed: pending, paid, received, unpaid." });
      }
    }

    const updateResult = await updateOrderStatus(orderId, status, paymentStatus, { username: auth.username, role: auth.role });
    if (updateResult.error) {
      return res.status(400).json({ error: updateResult.error });
    }
    if (status) {
      try {
        const { updateCachedOrderStatus } = require("./track");
        if (typeof updateCachedOrderStatus === "function") {
          updateCachedOrderStatus(orderId, status);
        }
      } catch (_) {}
    }
    let refundInfo = null;
    if (status === "cancelled" && (body.issueRefundToken || auth.role === "admin" || auth.role === "manager")) {
      try {
        const existingOrder = await findOrderById(orderId);
        let refundedAmount = Number(existingOrder?.grand_total ?? existingOrder?.grandTotal ?? body.refundedAmount ?? body.amount ?? 0);
        if (!refundedAmount && existingOrder?.items) {
          const matches = Array.from(String(existingOrder.items).matchAll(/₦([\d,]+)/g));
          if (matches.length > 0) {
            const subtotal = matches.reduce((sum, m) => sum + Number(m[1].replace(/,/g, "")), 0);
            const serviceFee = Number(existingOrder.service_fee ?? 800);
            const deliveryFee = (existingOrder.fulfilment || "Delivery") === "Delivery" ? Math.round(subtotal * 0.15) : 0;
            refundedAmount = subtotal + serviceFee + deliveryFee;
          }
        }
        if (!refundedAmount) refundedAmount = 0;
        const refundToken = generate15CharRefundToken();
        const issuedAt = new Date().toISOString();
        const customerName = existingOrder?.customer_name || existingOrder?.customerName || body.customerName || "Customer";
        const customerPhone = existingOrder?.customer_phone || existingOrder?.customerPhone || body.customerPhone || "";
        await saveRefundToken({
          token: refundToken,
          order_id: orderId,
          customer_name: customerName,
          customer_phone: customerPhone,
          amount: refundedAmount,
          reason: body.reason || "Order Cancellation",
          issued_by: auth.username,
          issued_at: issuedAt,
          status: "unclaimed",
        });
        refundInfo = {
          refundToken,
          token: refundToken,
          refundedAmount,
          customerName,
          issuedAt,
        };
      } catch (_) {}
    }

    return res.status(200).json({
      success: true,
      orderId,
      status: status || undefined,
      paymentStatus: paymentStatus ? (String(paymentStatus).toLowerCase() === "received" ? "paid" : String(paymentStatus).toLowerCase()) : undefined,
      updatedBy: auth.username,
      role: auth.role,
      ...(refundInfo || {}),
    });
  }

  // DELETE: Strictly restricted to Admin -> Delete used refund tokens OR delete order & issue 15-char refund token
  if (req.method === "DELETE") {
    if (auth.role !== "admin" && auth.role !== "manager") {
      return res.status(403).json({ error: "Access denied: Only admin or manager accounts can delete orders for refunds." });
    }
    const body = parseBody(req);

    if (body.deleteUsedTokens === true || req.query?.deleteUsedTokens === "true") {
      if (auth.role !== "admin") return res.status(403).json({ error: "Access denied: Only admin accounts can delete refund tokens." });
      const bulkRes = await deleteClaimedRefundTokens();
      return res.status(200).json({
        deleted: true,
        deleteUsedTokens: true,
        deletedCount: bulkRes.deletedCount || 0,
      });
    }

    const refundTokenToDelete = body.refundToken || req.query?.refundToken;
    if (refundTokenToDelete) {
      if (auth.role !== "admin") return res.status(403).json({ error: "Access denied: Only admin accounts can delete refund tokens." });
      const tokRes = await deleteRefundToken(refundTokenToDelete);
      if (tokRes.error) {
        return res.status(400).json({ error: tokRes.error });
      }
      return res.status(200).json({
        deleted: true,
        refundToken: tokRes.token,
      });
    }

    const customerUsernameToDelete = body.customerUsername || req.query?.customerUsername;
    if (customerUsernameToDelete) {
      if (auth.role !== "admin") return res.status(403).json({ error: "Access denied: Only admin accounts can delete customer accounts." });
      const userRes = await deleteCustomerUser(customerUsernameToDelete);
      if (userRes.error) {
        return res.status(404).json({ error: userRes.error });
      }
      await revokeAllUserSessions(userRes.username);
      return res.status(200).json({
        deleted: true,
        customerUsername: userRes.username,
      });
    }

    const feedbackIdToDelete = body.feedbackId ?? req.query?.feedbackId;
    const feedbackCreatedAt = body.createdAt || req.query?.createdAt || "";
    if ((feedbackIdToDelete !== undefined && String(feedbackIdToDelete).trim() !== "") || feedbackCreatedAt) {
      if (auth.role !== "admin") return res.status(403).json({ error: "Access denied: Only admin accounts can delete feedback." });
      const fbRes = await deleteFeedback({ id: feedbackIdToDelete, createdAt: feedbackCreatedAt });
      if (fbRes.error) {
        return res.status(400).json({ error: fbRes.error });
      }
      return res.status(200).json({
        deleted: true,
        feedbackId: feedbackIdToDelete ?? null,
      });
    }

    const orderId = body.orderId || req.query?.orderId;
    if (!orderId) {
      return res.status(400).json({ error: "orderId is required." });
    }

    // Lookup existing order to record exact refund amount & customer details
    const existingOrder = await findOrderById(orderId);

    let refundedAmount = Number(existingOrder?.grand_total ?? existingOrder?.grandTotal ?? body.refundedAmount ?? body.amount ?? 0);
    if (!refundedAmount && existingOrder?.items) {
      const matches = Array.from(String(existingOrder.items).matchAll(/₦([\d,]+)/g));
      if (matches.length > 0) {
        const subtotal = matches.reduce((sum, m) => sum + Number(m[1].replace(/,/g, "")), 0);
        const serviceFee = Number(existingOrder.service_fee ?? 800);
        const deliveryFee = (existingOrder.fulfilment || "Delivery") === "Delivery" ? Math.round(subtotal * 0.15) : 0;
        refundedAmount = subtotal + serviceFee + deliveryFee;
      }
    }
    if (!refundedAmount) refundedAmount = 0;

    const delResult = await deleteOrder(orderId);
    if (delResult.error) {
      return res.status(400).json({ error: delResult.error });
    }

    // Generate 15-character uppercase alphanumeric refund token
    const refundToken = generate15CharRefundToken();
    const issuedAt = new Date().toISOString();
    const customerName = existingOrder?.customer_name || existingOrder?.customerName || body.customerName || "Customer";
    const customerPhone = existingOrder?.customer_phone || existingOrder?.customerPhone || body.customerPhone || "";
    const reason = body.reason || (auth.role === "manager" ? "Order Deleted by Manager for Refund" : "Order Deleted by Admin");

    await saveRefundToken({
      token: refundToken,
      order_id: orderId,
      order_pin: existingOrder?.order_pin || existingOrder?.orderPin || body.orderPin || null,
      customer_name: customerName,
      customer_phone: customerPhone,
      amount: refundedAmount,
      reason,
      issued_by: auth.username,
      issued_at: issuedAt,
      status: "unclaimed",
    });

    return res.status(200).json({
      deleted: true,
      orderId,
      refundToken,
      token: refundToken,
      refundedAmount,
      customerName,
      issuedAt,
    });
  }

  // Record live active visitor hit
  recordVisitorHit(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || auth?.username);

  // GET: Admin-Only Full-Database CSV Export (strictly forbidden for Manager, Staff, Driver)
  if (req.query?.export === "csv" || req.query?.format === "csv") {
    if (auth.role !== "admin") {
      return res.status(403).json({
        error: "Access denied: Full-database CSV export is strictly restricted to Admin accounts.",
      });
    }
    const allRes = await getOrders({ limit: 10000, offset: 0 });
    const allOrders = Array.isArray(allRes.orders) ? allRes.orders : [];
    const csv = buildOrdersCsv(allOrders);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="orders-database-export.csv"');
    if (typeof res.send === "function") {
      return res.status(200).send(csv);
    }
    return res.status(200).json({ csv, count: allOrders.length });
  }

  // GET: Completed Console (Staff: 48h, Manager: 7d, Driver: 3h, Admin: unlimited full DB)
  if (req.query?.tab === "completed" || req.query?.view === "completed") {
    const limit = Math.min(Number(req.query?.limit) || 200, 1000);
    const offset = Math.max(Number(req.query?.offset) || 0, 0);
    const result = await getOrders({ limit, offset });
    const rawOrders = Array.isArray(result.orders) ? result.orders : [];
    let completedOrders;
    let retentionWindow = "unlimited";
    if (auth.role === "admin") {
      completedOrders = rawOrders.filter(isOrderCompletedForConsole);
    } else if (auth.role === "manager") {
      retentionWindow = "7d";
      completedOrders = rawOrders.filter(
        (o) => isOrderCompletedForConsole(o) && isOrderWithinWindow(o, MANAGER_COMPLETED_WINDOW_MS, false)
      );
    } else if (auth.role === "driver") {
      retentionWindow = "3h";
      completedOrders = rawOrders
        .filter(
          (o) =>
            String(o.fulfilment || "").toLowerCase() === "delivery" &&
            String(o.status || "").toLowerCase() === "completed" &&
            isOrderWithinWindow(o, DRIVER_COMPLETED_WINDOW_MS, true)
        )
        .map(sanitizeOrderForDriver);
    } else {
      retentionWindow = "48h";
      completedOrders = rawOrders
        .filter((o) => isOrderCompletedForConsole(o) && isOrderWithinWindow(o, STAFF_COMPLETED_WINDOW_MS, false))
        .map(sanitizeOrderForStaff);
    }
    return res.status(200).json({
      orders: completedOrders,
      count: completedOrders.length,
      role: auth.role,
      retentionWindow,
      provider: result.provider || "local",
    });
  }

  // GET: Verify Refund Token
  if (req.query?.verifyRefundToken) {
    if (auth.role !== "admin" && auth.role !== "manager") {
      return res.status(403).json({ error: "Access denied: Only admin or manager accounts can verify refund tokens." });
    }
    const token = String(req.query.verifyRefundToken).trim().toUpperCase();
    const rec = await findRefundToken(token);
    if (!rec) {
      return res.status(404).json({ valid: false, error: "Refund token not found." });
    }
    return res.status(200).json({
      valid: true,
      verified: true,
      token: rec.token,
      refundToken: rec.token,
      orderId: rec.order_id,
      customerName: rec.customer_name,
      customerPhone: rec.customer_phone,
      refundedAmount: Number(rec.amount),
      amount: Number(rec.amount),
      reason: rec.reason,
      issuedBy: rec.issued_by,
      issuedAt: rec.issued_at,
      status: rec.status,
      claimedAt: rec.claimed_at,
      checkedIn: rec.status === "claimed",
    });
  }

  // GET: Refund Tokens Tab data
  if (req.query?.tab === "refunds" || req.query?.view === "refunds" || req.query?.refundTokens === "true") {
    if (auth.role !== "admin" && auth.role !== "manager") {
      return res.status(403).json({ error: "Access denied: Only admin or manager accounts can view refund tokens." });
    }
    const limit = Math.min(Number(req.query?.limit) || 50, 200);
    const offset = Math.max(Number(req.query?.offset) || 0, 0);
    const status = req.query?.status || null;
    const result = await getRefundTokens({ limit, offset, status });
    return res.status(200).json({
      tokens: result.tokens || [],
      count: result.count || 0,
      provider: result.provider,
      activeVisitors: getActiveVisitorCount(),
    });
  }

  // GET: Customer Feedback Tab data
  if (req.query?.tab === "feedback" || req.query?.view === "feedback") {
    if (auth.role !== "admin") {
      return res.status(403).json({ error: "Access denied: Only admin accounts can view customer feedback." });
    }
    const limit = Math.min(Number(req.query?.limit) || 50, 200);
    const offset = Math.max(Number(req.query?.offset) || 0, 0);
    const result = await getFeedback({ limit, offset });
    return res.status(200).json({
      feedback: result.feedback || [],
      count: result.feedback?.length || 0,
      provider: result.provider,
      activeVisitors: getActiveVisitorCount(),
    });
  }

  // GET: Signed-In & Active Customer Accounts + Sent Messages (Admin Only)
  if (req.query?.tab === "users" || req.query?.view === "users") {
    if (auth.role !== "admin") {
      return res.status(403).json({ error: "Access denied: Only admin accounts can view signed-in customer accounts." });
    }
    const limit = Math.min(Number(req.query?.limit) || 100, 300);
    const [result, messages, promoEmails] = await Promise.all([
      getCustomerUsers({ limit }),
      getAllCustomerMessages({ limit: 30 }),
      getPromotionalEmails({ limit: 20 }),
    ]);
    return res.status(200).json({
      users: result.users || [],
      totalSignedIn: result.totalSignedIn || 0,
      activeSignedIn: result.activeSignedIn || 0,
      messages: messages || [],
      promoEmails: promoEmails || [],
      provider: result.provider,
      activeVisitors: getActiveVisitorCount(),
    });
  }

  // GET: Fetch orders (Staff sees masked operational view; Driver sees active delivery orders with unmasked address/phone and masked email; Admin sees full details)
  const limit = Math.min(Number(req.query?.limit) || 100, 500);
  const offset = Math.max(Number(req.query?.offset) || 0, 0);

  const [result, usersSummary] = await Promise.all([
    getOrders({ limit, offset }),
    auth.role === "admin" ? getCustomerUsers({ limit: 100 }).catch(() => null) : Promise.resolve(null),
  ]);
  const rawOrders = Array.isArray(result.orders) ? result.orders : [];
  let orders;
  if (auth.role === "admin") {
    orders = rawOrders;
  } else if (auth.role === "manager") {
    orders = rawOrders.filter(
      (o) => !isOrderCompletedForConsole(o) || isOrderWithinWindow(o, MANAGER_COMPLETED_WINDOW_MS, false)
    );
  } else if (auth.role === "driver") {
    orders = rawOrders
      .filter((o) => {
        if (String(o.fulfilment || "").toLowerCase() !== "delivery") return false;
        if (String(o.status || "").toLowerCase() === "completed") {
          return isOrderWithinWindow(o, DRIVER_COMPLETED_WINDOW_MS, true);
        }
        return true;
      })
      .map(sanitizeOrderForDriver);
  } else {
    orders = rawOrders
      .filter((o) => !isOrderCompletedForConsole(o) || isOrderWithinWindow(o, STAFF_COMPLETED_WINDOW_MS, false))
      .map(sanitizeOrderForStaff);
  }

  return res.status(200).json({
    orders,
    count: orders.length,
    limit,
    offset,
    role: auth.role,
    username: auth.username,
    permissions: getPermissionsForRole(auth.role),
    provider: result.provider || "local",
    activeVisitors: auth.role === "admin" ? getActiveVisitorCount() : undefined,
    totalSignedIn: usersSummary ? usersSummary.totalSignedIn : undefined,
    activeSignedIn: usersSummary ? usersSummary.activeSignedIn : undefined,
  });
  } finally {
    releaseRequestSlot();
  }
};

module.exports.CREDENTIAL_REGEX = CREDENTIAL_REGEX;
module.exports.STAFF_ALLOWED_STATUSES = STAFF_ALLOWED_STATUSES;
module.exports.DRIVER_ALLOWED_STATUSES = DRIVER_ALLOWED_STATUSES;
module.exports.authenticateCredentials = authenticateCredentials;
module.exports.issueSessionToken = issueSessionToken;
module.exports.verifySessionToken = verifySessionToken;
module.exports.resolveAuthFromRequest = resolveAuthFromRequest;
module.exports.STAFF_COMPLETED_WINDOW_MS = STAFF_COMPLETED_WINDOW_MS;
module.exports.MANAGER_COMPLETED_WINDOW_MS = MANAGER_COMPLETED_WINDOW_MS;
module.exports.DRIVER_COMPLETED_WINDOW_MS = DRIVER_COMPLETED_WINDOW_MS;
module.exports.buildOrdersCsv = buildOrdersCsv;

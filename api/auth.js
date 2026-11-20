// Customer Username & Login API for Romeo's Pizza Nigeria
// Supports registration, login, logout, profile icon updates, order history, and refund notifications.
// Uses salted crypto.scryptSync password hashing and HMAC-SHA256 signed HttpOnly session cookies.

const crypto = require("crypto");
const {
  createCustomerUser,
  findCustomerByUsername,
  updateCustomerProfile,
  getOrdersByCustomer,
  findRefundsByPhone,
  getMessagesForCustomer,
  recordVisitorHit,
  phoneMatchVariants,
} = require("./db");

const SESSION_COOKIE = "romeos_user_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const AVATAR_ICONS = new Map([
  ["pizza", { id: "pizza", label: "Pizza Lover", emoji: "🍕" }],
  ["crown", { id: "crown", label: "VIP Crown", emoji: "👑" }],
  ["fire", { id: "fire", label: "Hot & Spicy", emoji: "🔥" }],
  ["rocket", { id: "rocket", label: "Express", emoji: "🚀" }],
  ["cool", { id: "cool", label: "Chill", emoji: "😎" }],
  ["star", { id: "star", label: "5-Star Fan", emoji: "🌟" }],
  ["rider", { id: "rider", label: "Delivery", emoji: "🛵" }],
  ["heart", { id: "heart", label: "Sauce Fan", emoji: "❤️" }],
]);

// Simple per-IP rate limiter for auth endpoints (30 requests per minute)
const rateBuckets = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const key = ip || "unknown";
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.start > 60_000) {
    bucket = { start: now, count: 0 };
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (rateBuckets.size > 1000) {
    for (const [k, v] of rateBuckets.entries()) {
      if (now - v.start > 60_000) rateBuckets.delete(k);
    }
  }
  return bucket.count > 30;
}

let ephemeralAuthSecret = null;

function getAuthSecret() {
  const secret = process.env.CUSTOMER_AUTH_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (secret) return secret;
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error("CUSTOMER_AUTH_SECRET or ADMIN_SESSION_SECRET must be configured in production.");
  }
  if (!ephemeralAuthSecret) {
    ephemeralAuthSecret = crypto.randomBytes(32).toString("hex");
  }
  return ephemeralAuthSecret;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(":")) return false;
  const [salt, keyHex] = storedHash.split(":");
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(String(password), salt, 64);
  const storedBuf = Buffer.from(keyHex, "hex");
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function signSessionToken(payload) {
  const data = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", getAuthSecret()).update(data).digest("base64url");
  return `${data}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = crypto.createHmac("sha256", getAuthSecret()).update(data).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (!parsed || !parsed.username || Date.now() > Number(parsed.exp || 0)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers?.cookie || "";
  const out = {};
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      if (k) out[k] = decodeURIComponent(v);
    }
  }
  return out;
}

function resolveCustomerSession(req) {
  const cookies = parseCookies(req);
  if (cookies[SESSION_COOKIE]) {
    const verified = verifySessionToken(cookies[SESSION_COOKIE]);
    if (verified) return verified;
  }
  const authHeader = req.headers?.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return verifySessionToken(authHeader.slice(7).trim());
  }
  return null;
}

function setSessionCookie(req, res, token) {
  const isHttps =
    req.headers?.["x-forwarded-proto"] === "https" ||
    Boolean(process.env.VERCEL);
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (isHttps) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(req, res) {
  const isHttps =
    req.headers?.["x-forwarded-proto"] === "https" ||
    Boolean(process.env.VERCEL);
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (isHttps) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function normalizePhoneNumber(value, countryCode) {
  if (typeof value !== "string") return "";
  const phone = value.trim();
  if (!/^\+?[0-9()\s-]+$/.test(phone)) return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  let internationalNumber = "";
  const cleanCode = typeof countryCode === "string" && /^\+\d{1,4}$/.test(countryCode.trim()) ? countryCode.trim() : "";
  if (phone.startsWith("+")) {
    internationalNumber = `+${digits}`;
  } else if (cleanCode) {
    const localDigits = digits.replace(/^0+/, "");
    internationalNumber = `${cleanCode}${localDigits}`;
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

function sanitizeUser(u) {
  if (!u) return null;
  const iconObj = AVATAR_ICONS.get(u.avatar_icon) || AVATAR_ICONS.get("pizza");
  return {
    username: u.username,
    fullName: u.full_name,
    email: u.email || "",
    phone: u.phone,
    avatarIcon: iconObj.id,
    avatarEmoji: iconObj.emoji,
    avatarLabel: iconObj.label,
    defaultLocation: u.default_location || "",
    defaultAddress: u.default_address || "",
    createdAt: u.created_at,
  };
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (_) {
      return {};
    }
  }
  return req.body;
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(204).end();
  }

  const { getClientIp } = require("./overload-protection");
  const clientIp = getClientIp(req);

  if (req.method === "GET") {
    const session = resolveCustomerSession(req);
    if (!session) {
      return res.status(200).json({
        authenticated: false,
        avatars: Array.from(AVATAR_ICONS.values()),
      });
    }

    const user = await findCustomerByUsername(session.username);
    if (!user) {
      clearSessionCookie(req, res);
      return res.status(200).json({
        authenticated: false,
        avatars: Array.from(AVATAR_ICONS.values()),
      });
    }

    recordVisitorHit(`user:${user.username}`);
    const [orders, refunds, messages] = await Promise.all([
      getOrdersByCustomer(user.username, user.phone),
      findRefundsByPhone(user.phone),
      getMessagesForCustomer(user.username, user.phone),
      updateCustomerProfile(user.username, { lastLoginAt: new Date().toISOString() }),
    ]);

    return res.status(200).json({
      authenticated: true,
      user: sanitizeUser(user),
      orders: orders || [],
      refunds: (refunds || []).map((r) => ({
        token: r.token,
        orderId: r.order_id,
        orderPin: r.order_pin || null,
        amount: Number(r.amount || 0),
        status: r.status || "unclaimed",
        reason: r.reason || "Order Refunded",
        issuedAt: r.issued_at,
        claimedAt: r.claimed_at || null,
      })),
      messages: messages || [],
      avatars: Array.from(AVATAR_ICONS.values()),
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  if (isRateLimited(clientIp)) {
    return res.status(429).json({ error: "Too many authentication attempts. Please wait a minute." });
  }

  const body = parseBody(req);
  const action = String(body.action || "").trim().toLowerCase();

  if (action === "logout") {
    clearSessionCookie(req, res);
    return res.status(200).json({ success: true, authenticated: false });
  }

  if (action === "register") {
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    const fullName = String(body.fullName || body.full_name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = normalizePhoneNumber(String(body.phone || ""), body.countryCode);
    const avatarIcon = AVATAR_ICONS.has(body.avatarIcon) ? body.avatarIcon : "pizza";
    const defaultLocation = String(body.defaultLocation || "").trim();
    const defaultAddress = String(body.defaultAddress || "").trim();

    if (!/^[a-z0-9_.]{3,24}$/.test(username)) {
      return res.status(400).json({
        error: "Username must be 3–24 characters using letters, numbers, underscores, or dots.",
      });
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({
        error: "Password must be at least 8 characters.",
      });
    }
    if (fullName.length < 2) {
      return res.status(400).json({ error: "Enter your full name (at least 2 characters)." });
    }
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ error: "Enter a valid email address (e.g. you@example.com)." });
    }
    if (!phone) {
      return res.status(400).json({ error: "Enter a valid Nigerian phone number (e.g. 08012345678)." });
    }
    if (body.consent !== true) {
      return res.status(400).json({ error: "Please accept the Terms & Privacy Policy to create an account." });
    }

    const passwordHash = hashPassword(password);
    const created = await createCustomerUser({
      username,
      passwordHash,
      fullName,
      email,
      phone,
      avatarIcon,
      defaultLocation,
      defaultAddress,
    });

    if (created.error) {
      return res.status(created.conflict ? 409 : 400).json({ error: created.error });
    }

    const token = signSessionToken({
      username,
      exp: Date.now() + SESSION_TTL_MS,
    });
    setSessionCookie(req, res, token);

    const refunds = await findRefundsByPhone(phone);
    return res.status(201).json({
      success: true,
      authenticated: true,
      token,
      user: sanitizeUser(created.user),
      refunds: refunds || [],
    });
  }

  if (action === "login") {
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required." });
    }

    const user = await findCustomerByUsername(username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    await updateCustomerProfile(username, { lastLoginAt: new Date().toISOString() });
    const token = signSessionToken({
      username: user.username,
      exp: Date.now() + SESSION_TTL_MS,
    });
    setSessionCookie(req, res, token);

    recordVisitorHit(`user:${user.username}`);
    const [orders, refunds] = await Promise.all([
      getOrdersByCustomer(user.username, user.phone),
      findRefundsByPhone(user.phone),
      updateCustomerProfile(user.username, { lastLoginAt: new Date().toISOString() }),
    ]);

    return res.status(200).json({
      success: true,
      authenticated: true,
      token,
      user: sanitizeUser(user),
      orders: orders || [],
      refunds: refunds || [],
    });
  }

  if (action === "update_profile") {
    const session = resolveCustomerSession(req);
    if (!session) {
      return res.status(401).json({ error: "Sign in required to update your profile." });
    }
    const updates = {};
    if (body.avatarIcon && AVATAR_ICONS.has(body.avatarIcon)) {
      updates.avatarIcon = body.avatarIcon;
    }
    if (typeof body.fullName === "string" && body.fullName.trim().length >= 2) {
      updates.fullName = body.fullName.trim();
    }
    if (typeof body.defaultLocation === "string") {
      updates.defaultLocation = body.defaultLocation.trim();
    }
    if (typeof body.defaultAddress === "string") {
      updates.defaultAddress = body.defaultAddress.trim();
    }

    const updated = await updateCustomerProfile(session.username, updates);
    return res.status(200).json({
      success: true,
      user: sanitizeUser(updated.user),
    });
  }

  if (action === "reset_password") {
    return res.status(501).json({
      error: "Self-service password reset is disabled until out-of-band email/SMS verification is enabled. Please contact support.",
    });
  }

  if (action === "change_password") {
    const session = resolveCustomerSession(req);
    if (!session) {
      return res.status(401).json({ error: "Sign in required." });
    }
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password are required." });
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ error: "New password must be at least 8 characters." });
    }
    const user = await findCustomerByUsername(session.username);
    if (!user || !verifyPassword(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }
    const passwordHash = hashPassword(newPassword);
    await updateCustomerProfile(session.username, { passwordHash });
    return res.status(200).json({
      success: true,
      message: "Password updated successfully.",
    });
  }

  return res.status(400).json({ error: "Unsupported action." });
};

module.exports.resolveCustomerSession = resolveCustomerSession;
module.exports.AVATAR_ICONS = Array.from(AVATAR_ICONS.values());

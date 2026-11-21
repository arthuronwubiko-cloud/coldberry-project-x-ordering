/**
 * Distributed Redis Store for Login Sessions, Revocation & Rate Limiting
 *
 * Follows Neon serverless best practices by pairing Lakebase Postgres with Upstash Redis
 * over HTTP REST (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`), while also supporting
 * standard TCP Redis (`REDIS_URL`) and an automatic high-speed in-memory TTL store fallback.
 */

const net = require("net");
const tls = require("tls");

const LOCKOUT_MAX_ATTEMPTS = Number(process.env.LOGIN_MAX_ATTEMPTS || 5);
const LOCKOUT_WINDOW_MS = Number(process.env.LOGIN_LOCKOUT_MS || 15 * 60 * 1000); // 15 minutes

// --- In-Memory TTL Store (Synchronous Fast-Path + Fallback) -----------------
const memoryStore = new Map(); // key -> { value, expiresAt }
const revokedSessions = new Map(); // jti -> expiresAt

function pruneMemoryStore(now = Date.now()) {
  if (memoryStore.size > 2000) {
    for (const [k, entry] of memoryStore.entries()) {
      if (entry.expiresAt && now >= entry.expiresAt) {
        memoryStore.delete(k);
      }
    }
  }
  if (revokedSessions.size > 2000) {
    for (const [jti, exp] of revokedSessions.entries()) {
      if (now >= exp) {
        revokedSessions.delete(jti);
      }
    }
  }
}

function memGet(key, now = Date.now()) {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt && now >= entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function memSet(key, value, ttlMs = 0, now = Date.now()) {
  pruneMemoryStore(now);
  memoryStore.set(key, {
    value,
    expiresAt: ttlMs > 0 ? now + ttlMs : 0,
  });
  return "OK";
}

function memDel(key) {
  const existed = memoryStore.delete(key);
  return existed ? 1 : 0;
}

function memIncrWithTtl(key, ttlMs, now = Date.now()) {
  pruneMemoryStore(now);
  let entry = memoryStore.get(key);
  if (!entry || (entry.expiresAt && now >= entry.expiresAt)) {
    entry = {
      value: 0,
      expiresAt: ttlMs > 0 ? now + ttlMs : 0,
    };
  }
  entry.value = Number(entry.value || 0) + 1;
  memoryStore.set(key, entry);
  const remainingMs = entry.expiresAt ? Math.max(0, entry.expiresAt - now) : ttlMs;
  return { count: entry.value, remainingMs };
}

// --- Upstash Redis REST & TCP Redis Transport Detection ---------------------

function getUpstashConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) {
    return { url: url.replace(/\/+$/, ""), token };
  }
  return null;
}

function getTcpRedisUrl() {
  return process.env.REDIS_URL || null;
}

function getProvider() {
  if (getUpstashConfig()) return "upstash-rest";
  if (getTcpRedisUrl()) return "redis-tcp";
  return "memory";
}

function isRedisConfigured() {
  return Boolean(getUpstashConfig() || getTcpRedisUrl());
}

async function execUpstashPipeline(commands) {
  const cfg = getUpstashConfig();
  if (!cfg) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`${cfg.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function encodeRespCommand(args) {
  let out = `*${args.length}\r\n`;
  for (const arg of args) {
    const str = String(arg);
    out += `$${Buffer.byteLength(str, "utf8")}\r\n${str}\r\n`;
  }
  return out;
}

async function execTcpRedisCommand(args) {
  const rawUrl = getTcpRedisUrl();
  if (!rawUrl) return null;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };
    try {
      const parsed = new URL(rawUrl);
      const isTls = parsed.protocol === "rediss:";
      const port = Number(parsed.port || 6379);
      const host = parsed.hostname || "127.0.0.1";
      const password = parsed.password ? decodeURIComponent(parsed.password) : null;
      const username = parsed.username ? decodeURIComponent(parsed.username) : null;

      const connectOpts = { host, port, timeout: 1200 };
      const socket = isTls ? tls.connect({ ...connectOpts, servername: host }) : net.createConnection(connectOpts);

      let payload = "";
      if (password) {
        payload += username ? encodeRespCommand(["AUTH", username, password]) : encodeRespCommand(["AUTH", password]);
      }
      payload += encodeRespCommand(args);

      let buffer = "";
      socket.setTimeout(1200);
      socket.on("connect", () => {
        socket.write(payload);
      });
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\r\n").filter(Boolean);
        if (lines.length === 0) return;
        const last = lines[lines.length - 1];
        if (last.startsWith("+") || last.startsWith(":")) {
          socket.end();
          finish(last.slice(1));
        } else if (last.startsWith("-")) {
          socket.end();
          finish(null);
        } else if (lines.length >= 2 && lines[lines.length - 2].startsWith("$")) {
          socket.end();
          finish(last);
        }
      });
      socket.on("timeout", () => {
        socket.destroy();
        finish(null);
      });
      socket.on("error", () => {
        socket.destroy();
        finish(null);
      });
    } catch (_) {
      finish(null);
    }
  });
}

// --- Core Key-Value Operations ----------------------------------------------

async function redisSet(key, value, ttlMs = 0) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  memSet(key, serialized, ttlMs);

  if (getUpstashConfig()) {
    const cmd = ttlMs > 0 ? ["SET", key, serialized, "PX", String(ttlMs)] : ["SET", key, serialized];
    await execUpstashPipeline([cmd]);
  } else if (getTcpRedisUrl()) {
    const cmd = ttlMs > 0 ? ["SET", key, serialized, "PX", String(ttlMs)] : ["SET", key, serialized];
    await execTcpRedisCommand(cmd);
  }
  return true;
}

async function redisGet(key) {
  if (getUpstashConfig()) {
    const res = await execUpstashPipeline([["GET", key]]);
    if (Array.isArray(res) && res[0] && res[0].result !== undefined) {
      return res[0].result;
    }
  } else if (getTcpRedisUrl()) {
    const res = await execTcpRedisCommand(["GET", key]);
    if (res !== null) return res;
  }
  return memGet(key);
}

async function redisDel(key) {
  memDel(key);
  if (getUpstashConfig()) {
    await execUpstashPipeline([["DEL", key]]);
  } else if (getTcpRedisUrl()) {
    await execTcpRedisCommand(["DEL", key]);
  }
  return true;
}

// --- Distributed Rate Limiting (Logins & APIs) ------------------------------

async function checkRedisRateLimit(key, maxRequests = 30, windowMs = 60_000) {
  const redisKey = `rl:${key}`;
  const local = memIncrWithTtl(redisKey, windowMs);

  let count = local.count;
  let remainingMs = local.remainingMs;

  if (getUpstashConfig()) {
    const res = await execUpstashPipeline([
      ["INCR", redisKey],
      ["PTTL", redisKey],
    ]);
    if (Array.isArray(res) && res[0]?.result) {
      count = Number(res[0].result);
      const pttl = Number(res[1]?.result ?? -1);
      if (count === 1 || pttl < 0) {
        await execUpstashPipeline([["PEXPIRE", redisKey, String(windowMs)]]);
        remainingMs = windowMs;
      } else {
        remainingMs = pttl;
      }
    }
  } else if (getTcpRedisUrl()) {
    const remoteCount = await execTcpRedisCommand(["INCR", redisKey]);
    if (remoteCount !== null && Number.isFinite(Number(remoteCount))) {
      count = Number(remoteCount);
      if (count === 1) {
        await execTcpRedisCommand(["PEXPIRE", redisKey, String(windowMs)]);
      }
    }
  }

  if (count > maxRequests) {
    const retryAfter = Math.max(1, Math.ceil(remainingMs / 1000));
    return { allowed: false, count, remaining: 0, retryAfter };
  }
  return {
    allowed: true,
    count,
    remaining: Math.max(0, maxRequests - count),
    retryAfter: 0,
  };
}

// --- Failed Login Lockout Protection ----------------------------------------

async function isLoginLockedOut(identifier) {
  const key = `lockout:${String(identifier || "unknown").toLowerCase()}`;
  const raw = await redisGet(key);
  const attempts = Number(raw || 0);
  if (attempts >= LOCKOUT_MAX_ATTEMPTS) {
    const entry = memoryStore.get(key);
    const retryAfter = entry?.expiresAt
      ? Math.max(1, Math.ceil((entry.expiresAt - Date.now()) / 1000))
      : Math.ceil(LOCKOUT_WINDOW_MS / 1000);
    return { locked: true, attempts, retryAfter };
  }
  return { locked: false, attempts, retryAfter: 0 };
}

async function recordFailedLogin(identifier) {
  const key = `lockout:${String(identifier || "unknown").toLowerCase()}`;
  const res = memIncrWithTtl(key, LOCKOUT_WINDOW_MS);
  let count = res.count;

  if (getUpstashConfig()) {
    const pipe = await execUpstashPipeline([
      ["INCR", key],
      ["PEXPIRE", key, String(LOCKOUT_WINDOW_MS)],
    ]);
    if (Array.isArray(pipe) && pipe[0]?.result) {
      count = Number(pipe[0].result);
    }
  } else if (getTcpRedisUrl()) {
    const remoteCount = await execTcpRedisCommand(["INCR", key]);
    if (remoteCount !== null && Number.isFinite(Number(remoteCount))) {
      count = Number(remoteCount);
      if (count === 1) {
        await execTcpRedisCommand(["PEXPIRE", key, String(LOCKOUT_WINDOW_MS)]);
      }
    }
  }

  return {
    attempts: count,
    locked: count >= LOCKOUT_MAX_ATTEMPTS,
    remainingAttempts: Math.max(0, LOCKOUT_MAX_ATTEMPTS - count),
    retryAfter: Math.ceil(LOCKOUT_WINDOW_MS / 1000),
  };
}

async function clearFailedLogins(identifier) {
  const key = `lockout:${String(identifier || "unknown").toLowerCase()}`;
  await redisDel(key);
  return true;
}

// --- Login Session Registry & Instant Token Revocation ----------------------

async function storeSession(sessionId, payload, ttlMs = 7 * 24 * 60 * 60 * 1000) {
  if (!sessionId) return false;
  const key = `sess:${sessionId}`;
  revokedSessions.delete(sessionId);
  await redisSet(key, payload, ttlMs);

  const userKey = payload?.username || payload?.u;
  if (userKey) {
    const indexKey = `user_sessions:${String(userKey).toLowerCase()}`;
    const existingRaw = memGet(indexKey);
    let list = [];
    if (existingRaw) {
      try { list = JSON.parse(existingRaw); } catch (_) { list = []; }
    }
    if (!Array.isArray(list)) list = [];
    if (!list.includes(sessionId)) list.push(sessionId);
    await redisSet(indexKey, list.slice(-20), ttlMs);
  }
  return true;
}

async function getSession(sessionId) {
  if (!sessionId) return null;
  if (isSessionRevokedSync(sessionId)) return null;
  const raw = await redisGet(`sess:${sessionId}`);
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (_) {
    return raw;
  }
}

async function revokeSession(sessionId, ttlMs = 7 * 24 * 60 * 60 * 1000) {
  if (!sessionId) return false;
  revokedSessions.set(sessionId, Date.now() + ttlMs);
  await redisDel(`sess:${sessionId}`);
  await redisSet(`revoked:${sessionId}`, "1", ttlMs);
  return true;
}

async function revokeAllUserSessions(username, ttlMs = 7 * 24 * 60 * 60 * 1000) {
  if (!username) return 0;
  const clean = String(username).toLowerCase();
  const indexKey = `user_sessions:${clean}`;
  const raw = await redisGet(indexKey);
  let count = 0;
  if (raw) {
    try {
      const list = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(list)) {
        for (const jti of list) {
          await revokeSession(jti, ttlMs);
          count++;
        }
      }
    } catch (_) {}
  }
  await redisDel(indexKey);
  return count;
}

function isSessionRevokedSync(sessionId) {
  if (!sessionId) return false;
  const exp = revokedSessions.get(sessionId);
  if (!exp) return false;
  if (Date.now() >= exp) {
    revokedSessions.delete(sessionId);
    return false;
  }
  return true;
}

async function isSessionRevoked(sessionId) {
  if (!sessionId) return false;
  if (isSessionRevokedSync(sessionId)) return true;
  if (isRedisConfigured()) {
    const val = await redisGet(`revoked:${sessionId}`);
    if (val === "1") {
      revokedSessions.set(sessionId, Date.now() + 3600_000);
      return true;
    }
  }
  return false;
}

function clearRedisMemoryStore() {
  memoryStore.clear();
  revokedSessions.clear();
}

async function defaultHandler(req, res) {
  if (res && typeof res.status === "function") {
    const { resolveAuthFromRequest } = require("./admin");
    const auth = resolveAuthFromRequest(req);
    if (!auth || auth.role !== "admin") {
      res.setHeader("Content-Type", "application/json");
      return res.status(401).json({ error: "Unauthorized. Admin authentication required." });
    }
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      status: "ok",
      provider: getProvider(),
      redisConfigured: isRedisConfigured(),
      activeMemoryKeys: memoryStore.size,
      revokedSessionsCount: revokedSessions.size,
    });
  }
}

defaultHandler.getProvider = getProvider;
defaultHandler.isRedisConfigured = isRedisConfigured;
defaultHandler.redisGet = redisGet;
defaultHandler.redisSet = redisSet;
defaultHandler.redisDel = redisDel;
defaultHandler.checkRedisRateLimit = checkRedisRateLimit;
defaultHandler.isLoginLockedOut = isLoginLockedOut;
defaultHandler.recordFailedLogin = recordFailedLogin;
defaultHandler.clearFailedLogins = clearFailedLogins;
defaultHandler.storeSession = storeSession;
defaultHandler.getSession = getSession;
defaultHandler.revokeSession = revokeSession;
defaultHandler.revokeAllUserSessions = revokeAllUserSessions;
defaultHandler.isSessionRevokedSync = isSessionRevokedSync;
defaultHandler.isSessionRevoked = isSessionRevoked;
defaultHandler.clearRedisMemoryStore = clearRedisMemoryStore;
defaultHandler.LOCKOUT_MAX_ATTEMPTS = LOCKOUT_MAX_ATTEMPTS;
defaultHandler.LOCKOUT_WINDOW_MS = LOCKOUT_WINDOW_MS;

module.exports = defaultHandler;

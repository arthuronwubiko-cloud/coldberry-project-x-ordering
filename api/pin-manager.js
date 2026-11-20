// Order Verification PIN Manager for Romeo's Pizza Nigeria
// Generates random 6-digit PINs for orders and enforces a strict 5-day retention
// period before any PIN can be recycled/reused.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PIN_LENGTH = 6;
const MIN_PIN = 100000;
const MAX_PIN = 999999;
const RETENTION_DAYS = 5;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000; // 432,000,000 ms (5 days)

const DEFAULT_STORE_FILE = path.join("/tmp", "romeos-active-order-pins.json");

// In-memory active PIN registry: Map<pinString, timestampMs>
let activePinsMap = new Map();
let isLoaded = false;

function getStoreFilePath() {
  return process.env.PIN_STORE_PATH || DEFAULT_STORE_FILE;
}

function loadStore() {
  if (isLoaded) return;
  isLoaded = true;
  const filePath = getStoreFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const now = Date.now();
        for (const [pin, ts] of Object.entries(parsed)) {
          const timestamp = Number(ts);
          if (
            typeof pin === "string" &&
            /^\d{6}$/.test(pin) &&
            Number.isFinite(timestamp) &&
            now - timestamp < RETENTION_MS
          ) {
            activePinsMap.set(pin, timestamp);
          }
        }
      }
    }
  } catch (err) {
    // If reading fails (e.g. invalid JSON or ephemeral storage), fallback gracefully
    console.warn("[PinManager] Could not load stored PINs:", err.message);
  }
}

function persistStore() {
  const filePath = getStoreFilePath();
  try {
    const obj = {};
    for (const [pin, ts] of activePinsMap.entries()) {
      obj[pin] = ts;
    }
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(obj), { encoding: "utf8", mode: 0o600 });
  } catch (err) {
    // In restricted or serverless environments where write may fail, fail silently
    // in-memory map remains authoritative for the lifecycle of the instance
  }
}

function pruneExpiredPins(currentTime = Date.now()) {
  loadStore();
  let prunedCount = 0;
  for (const [pin, timestamp] of activePinsMap.entries()) {
    if (currentTime - timestamp >= RETENTION_MS) {
      activePinsMap.delete(pin);
      prunedCount += 1;
    }
  }
  if (prunedCount > 0) {
    persistStore();
  }
  return prunedCount;
}

function isPinActive(pin, currentTime = Date.now()) {
  loadStore();
  const str = String(pin).trim();
  if (!/^\d{6}$/.test(str)) return false;
  const timestamp = activePinsMap.get(str);
  if (timestamp === undefined) return false;
  if (currentTime - timestamp >= RETENTION_MS) {
    activePinsMap.delete(str);
    return false;
  }
  return true;
}

function getActivePins(currentTime = Date.now()) {
  pruneExpiredPins(currentTime);
  const result = {};
  for (const [pin, ts] of activePinsMap.entries()) {
    result[pin] = {
      issuedAt: new Date(ts).toISOString(),
      expiresAt: new Date(ts + RETENTION_MS).toISOString(),
      remainingMs: Math.max(0, RETENTION_MS - (currentTime - ts)),
    };
  }
  return result;
}

function getActivePinsCount(currentTime = Date.now()) {
  pruneExpiredPins(currentTime);
  return activePinsMap.size;
}

function generateRandomCandidate() {
  try {
    return String(crypto.randomInt(MIN_PIN, MAX_PIN + 1));
  } catch {
    return String(Math.floor(MIN_PIN + Math.random() * (MAX_PIN - MIN_PIN + 1)));
  }
}

function generateOrderPin(options = {}) {
  loadStore();
  const now = options.now !== undefined ? Number(options.now) : Date.now();
  pruneExpiredPins(now);

  const totalPossible = MAX_PIN - MIN_PIN + 1; // 900,000
  if (activePinsMap.size >= totalPossible) {
    throw new Error("Active PIN pool exhausted. All 6-digit numbers in active 5-day retention.");
  }

  // Attempt random candidate selection (average 1 attempt)
  const maxAttempts = 100;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = generateRandomCandidate();
    if (!isPinActive(candidate, now)) {
      activePinsMap.set(candidate, now);
      persistStore();
      return candidate;
    }
  }

  // Fallback if random collision occurs repeatedly: sequential offset scan
  const startOffset = Math.floor(Math.random() * totalPossible);
  for (let i = 0; i < totalPossible; i++) {
    const candidateNum = MIN_PIN + ((startOffset + i) % totalPossible);
    const candidate = String(candidateNum);
    if (!isPinActive(candidate, now)) {
      activePinsMap.set(candidate, now);
      persistStore();
      return candidate;
    }
  }

  throw new Error("Unable to allocate unique 6-digit PIN.");
}

function registerPin(pin, timestamp = Date.now()) {
  loadStore();
  const str = String(pin).trim();
  if (!/^\d{6}$/.test(str)) {
    throw new Error("PIN must be a 6-digit string.");
  }
  activePinsMap.set(str, Number(timestamp));
  persistStore();
  return str;
}

function releasePin(pin) {
  loadStore();
  const str = String(pin).trim();
  const deleted = activePinsMap.delete(str);
  if (deleted) {
    persistStore();
  }
  return deleted;
}

function clearStore() {
  activePinsMap.clear();
  const filePath = getStoreFilePath();
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {}
}

// Production entry point. When a database is configured the PIN is claimed
// atomically in the database (order_pins table), which is the only way to
// guarantee no reuse within 5 days across serverless instances and restarts.
// Without a database, falls back to the local registry above, which is
// best-effort only (per instance; /tmp is wiped on cold starts).
async function allocateOrderPin(options = {}) {
  const db = options.db || require("./db");
  if (db.isConfigured()) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const candidate = generateRandomCandidate();
      const claimed = await db.allocatePin(candidate);
      if (claimed === true) {
        registerPin(candidate);
        return { pin: candidate, source: "database" };
      }
      if (claimed === null) break; // database can't allocate (e.g. migration not run)
    }
    console.error("[PinManager] Database PIN allocation unavailable — using local best-effort registry.");
  }
  return { pin: generateOrderPin(), source: "local" };
}

async function defaultHandler(req, res) {
  if (res && typeof res.status === "function") {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      status: "ok",
      activePinsCount: getActivePinsCount(),
      retentionDays: RETENTION_DAYS,
    });
  }
}

defaultHandler.PIN_LENGTH = PIN_LENGTH;
defaultHandler.MIN_PIN = MIN_PIN;
defaultHandler.MAX_PIN = MAX_PIN;
defaultHandler.RETENTION_DAYS = RETENTION_DAYS;
defaultHandler.RETENTION_MS = RETENTION_MS;
defaultHandler.generateOrderPin = generateOrderPin;
defaultHandler.allocateOrderPin = allocateOrderPin;
defaultHandler.isPinActive = isPinActive;
defaultHandler.pruneExpiredPins = pruneExpiredPins;
defaultHandler.getActivePins = getActivePins;
defaultHandler.getActivePinsCount = getActivePinsCount;
defaultHandler.registerPin = registerPin;
defaultHandler.releasePin = releasePin;
defaultHandler.clearStore = clearStore;

module.exports = defaultHandler;

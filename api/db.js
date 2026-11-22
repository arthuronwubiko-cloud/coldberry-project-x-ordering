// Database integration for Romeo's Pizza order storage.
// Supports:
// 1. Supabase (via SUPABASE_URL and SUPABASE_KEY / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY)
// 2. Neon Postgres (via DATABASE_URL)
//
// MS Access equivalent: a queryable relational database where orders can be viewed
// like a spreadsheet table in the Supabase Table Editor.
//
// Supabase schema changes (order_pin column, order_pins table, allocate_order_pin RPC)
// live in migrations/001_order_pin_and_tracking.sql and must be run once in the
// Supabase SQL editor. Neon tables are created/upgraded automatically.

const fs = require("fs");
const path = require("path");

// Load .env.local if running outside dev-server / Vercel
try {
  const envLocalPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envLocalPath)) {
    const lines = fs.readFileSync(envLocalPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
} catch (_) {}

const PIN_RETENTION_INTERVAL = "5 days";
const CANCELLATION_WINDOW_MS = 12 * 60 * 1000; // 12 minutes
const ORDER_STATUSES = ["pending", "confirmed", "preparing", "out_for_delivery", "ready", "completed", "cancelled"];
const LOCAL_ORDERS_FILE = path.join(require("os").tmpdir(), "romeos-orders-store.json");
const MAX_LOCAL_ORDERS = 500;

// Fail-safe circuit breaker to keep site speed high if database slows down under load
let executeWithDbCircuitBreaker = null;
try {
  executeWithDbCircuitBreaker = require("./overload-protection").executeWithDbCircuitBreaker;
} catch (_) {
  executeWithDbCircuitBreaker = (op) => op();
}

// --- Local persistent order store (for local/offline/fail-safe usage) -----

function readLocalOrdersFile() {
  try {
    if (!fs.existsSync(LOCAL_ORDERS_FILE)) return [];
    const raw = fs.readFileSync(LOCAL_ORDERS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeLocalOrdersFile(orders) {
  if ((process.env.VERCEL || process.env.NODE_ENV === "production") && isConfigured()) return;
  try {
    const cutoff = Date.now() - 5 * 24 * 60 * 60 * 1000;
    const pruned = orders
      .filter((o) => {
        const ts = Date.parse(o.created_at || o.timestamp);
        return !Number.isFinite(ts) || ts >= cutoff;
      })
      .slice(0, MAX_LOCAL_ORDERS);
    fs.writeFileSync(LOCAL_ORDERS_FILE, JSON.stringify(pruned), { encoding: "utf8", mode: 0o600 });
  } catch (_) {}
}

function normalizeLocalOrderRecord(order) {
  if (!order) return null;
  return {
    order_id: order.order_id || order.orderId,
    order_pin: order.order_pin || order.orderPin || null,
    created_at: order.created_at || order.timestamp || new Date().toISOString(),
    customer_name: order.customer_name || order.customerName || "Customer",
    customer_phone: order.customer_phone || order.customerPhone || "",
    customer_email: order.customer_email || order.customerEmail || null,
    fulfilment: order.fulfilment || "Delivery",
    location: order.location || "",
    address: order.address || null,
    items: order.items || "",
    notes: order.notes || null,
    status: (order.status || "pending").toLowerCase(),
    subtotal: Number(order.subtotal ?? order.sub_total ?? 0),
    service_fee: Number(order.service_fee ?? order.serviceFee ?? 800),
    delivery_fee: Number(order.delivery_fee ?? order.deliveryFee ?? 0),
    grand_total: Number(order.grand_total ?? order.grandTotal ?? 0),
    payment_status: (order.payment_status || order.paymentStatus || "pending").toLowerCase(),
    customer_username: order.customer_username || order.customerUsername || null,
  };
}

function saveLocalOrder(order) {
  const rec = normalizeLocalOrderRecord(order);
  if (!rec || !rec.order_id) return null;
  const list = readLocalOrdersFile();
  const idx = list.findIndex((x) => x.order_id === rec.order_id);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...rec };
  } else {
    list.unshift(rec);
  }
  writeLocalOrdersFile(list);
  return rec;
}

function getLocalOrders({ limit = 100, offset = 0 } = {}) {
  const list = readLocalOrdersFile().sort(
    (a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0)
  );
  return list.slice(offset, offset + limit);
}

function findLocalOrder(phone, pin) {
  const cutoff = Date.now() - 5 * 24 * 60 * 60 * 1000;
  const list = readLocalOrdersFile();
  return (
    list.find(
      (o) =>
        o.order_pin === pin &&
        o.customer_phone === phone &&
        (Date.parse(o.created_at) || Date.now()) >= cutoff
    ) || null
  );
}

function updateLocalOrderStatus(orderId, status, paymentStatus, actor) {
  const list = readLocalOrdersFile();
  const idx = list.findIndex((o) => o.order_id === orderId);
  if (idx < 0) return false;
  if (status) list[idx].status = status;
  if (paymentStatus) list[idx].payment_status = paymentStatus;
  const actorName = actor && actor.username ? String(actor.username) : null;
  const nowIso = new Date().toISOString();
  if (status === "ready" && actorName) {
    list[idx].ready_confirmed_by = actorName;
    list[idx].ready_confirmed_at = nowIso;
  }
  if (status === "completed" && actorName) {
    list[idx].completed_by = actorName;
    list[idx].completed_at = nowIso;
  }
  writeLocalOrdersFile(list);
  return true;
}

function deleteLocalOrder(orderId) {
  const list = readLocalOrdersFile();
  const next = list.filter((o) => o.order_id !== orderId);
  if (next.length === list.length) return false;
  writeLocalOrdersFile(next);
  return true;
}

const DEFAULT_SUPABASE_URL = "";

function getSupabaseConfig() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_PROJECT_URL ||
    DEFAULT_SUPABASE_URL;
  const candidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_KEY,
  ];
  const key = candidates.find((k) => k && typeof k === "string" && !k.startsWith("[SENSITIVE"));

  if (url && key) {
    return {
      url: url.replace(/\/+$/, ""),
      key,
    };
  }
  return null;
}

function isNeonConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

function isConfigured() {
  return Boolean(getSupabaseConfig() || isNeonConfigured());
}

function supabaseHeaders(supabase, extra = {}) {
  return {
    apikey: supabase.key,
    Authorization: `Bearer ${supabase.key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

// --- Neon helpers ----------------------------------------------------------

let neonSqlPromise = null;
let neonSchemaPromise = null;

async function getNeonSql() {
  if (!neonSqlPromise) {
    neonSqlPromise = import("@neondatabase/serverless").then(({ neon }) => neon(process.env.DATABASE_URL));
  }
  return neonSqlPromise;
}

// Creates tables on first use and upgrades older `orders` tables that predate order_pin.
async function ensureNeonSchema() {
  if (!neonSchemaPromise) {
    neonSchemaPromise = (async () => {
      const sql = await getNeonSql();
      await sql`
        CREATE TABLE IF NOT EXISTS orders (
          id            SERIAL PRIMARY KEY,
          order_id      TEXT UNIQUE NOT NULL,
          order_pin     TEXT,
          created_at    TIMESTAMPTZ DEFAULT NOW(),
          customer_name TEXT NOT NULL,
          customer_phone TEXT NOT NULL,
          customer_email TEXT,
          fulfilment    TEXT NOT NULL,
          location      TEXT NOT NULL,
          address       TEXT,
          items         TEXT NOT NULL,
          notes         TEXT,
          status        TEXT DEFAULT 'pending'
        )
      `;
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_pin TEXT`;
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'`;
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC`;
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_fee NUMERIC`;
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC`;
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS grand_total NUMERIC`;
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending'`;
      await sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_username TEXT`;
      await sql`CREATE INDEX IF NOT EXISTS orders_pin_phone_idx ON orders (order_pin, customer_phone)`;
      await sql`CREATE INDEX IF NOT EXISTS orders_customer_user_idx ON orders (customer_username)`;
      await sql`
        CREATE TABLE IF NOT EXISTS order_pins (
          pin       TEXT PRIMARY KEY,
          issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS customer_feedback (
          id SERIAL PRIMARY KEY,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          rating INT NOT NULL,
          customer_name TEXT,
          order_pin TEXT,
          tags TEXT,
          comments TEXT,
          source TEXT DEFAULT 'web_bubble',
          feedback_type TEXT DEFAULT 'feedback'
        )
      `;
      await sql`ALTER TABLE customer_feedback ADD COLUMN IF NOT EXISTS feedback_type TEXT DEFAULT 'feedback'`;
      await sql`
        CREATE TABLE IF NOT EXISTS refund_tokens (
          token VARCHAR(15) UNIQUE PRIMARY KEY,
          order_id VARCHAR(100),
          order_pin TEXT,
          customer_name VARCHAR(120),
          customer_phone VARCHAR(50),
          amount NUMERIC,
          reason TEXT,
          issued_by VARCHAR(50),
          issued_at TIMESTAMPTZ DEFAULT NOW(),
          status VARCHAR(20) DEFAULT 'unclaimed',
          claimed_at TIMESTAMPTZ
        )
      `;
      await sql`ALTER TABLE refund_tokens ADD COLUMN IF NOT EXISTS order_pin TEXT`;
      await sql`CREATE INDEX IF NOT EXISTS refund_tokens_status_idx ON refund_tokens (status)`;
      await sql`CREATE INDEX IF NOT EXISTS refund_tokens_phone_pin_idx ON refund_tokens (customer_phone, order_pin)`;
      await sql`
        CREATE TABLE IF NOT EXISTS customer_users (
          id               SERIAL PRIMARY KEY,
          username         TEXT UNIQUE NOT NULL,
          password_hash    TEXT NOT NULL,
          full_name        TEXT NOT NULL,
          email            TEXT,
          phone            TEXT NOT NULL,
          avatar_icon      TEXT DEFAULT 'pizza',
          default_location TEXT,
          default_address  TEXT,
          created_at       TIMESTAMPTZ DEFAULT NOW(),
          last_login_at    TIMESTAMPTZ
        )
      `;
      await sql`ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS email TEXT`;
      await sql`CREATE INDEX IF NOT EXISTS customer_users_username_idx ON customer_users (username)`;
      await sql`CREATE INDEX IF NOT EXISTS customer_users_email_idx ON customer_users (email)`;
      await sql`
        CREATE TABLE IF NOT EXISTS customer_messages (
          id                 SERIAL PRIMARY KEY,
          recipient_username TEXT DEFAULT 'ALL',
          recipient_phone    TEXT,
          sender             TEXT DEFAULT 'admin',
          title              TEXT,
          body               TEXT NOT NULL,
          created_at         TIMESTAMPTZ DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS customer_messages_recipient_idx ON customer_messages (recipient_username, created_at DESC)`;
      await sql`
        CREATE TABLE IF NOT EXISTS promotional_emails (
          id              SERIAL PRIMARY KEY,
          sender          TEXT DEFAULT 'admin',
          subject         TEXT NOT NULL,
          body            TEXT NOT NULL,
          cta_text        TEXT,
          cta_url         TEXT,
          recipient_mode  TEXT DEFAULT 'ALL',
          recipient_count INTEGER DEFAULT 0,
          sent_count      INTEGER DEFAULT 0,
          failed_count    INTEGER DEFAULT 0,
          provider        TEXT DEFAULT 'preview_log',
          recipients      JSONB DEFAULT '[]'::jsonb,
          created_at      TIMESTAMPTZ DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS promotional_emails_created_idx ON promotional_emails (created_at DESC)`;
      await sql`
        CREATE TABLE IF NOT EXISTS console_accounts (
          id            SERIAL PRIMARY KEY,
          username      TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role          TEXT NOT NULL,
          full_name     TEXT,
          created_by    TEXT NOT NULL DEFAULT 'admin',
          is_active     BOOLEAN NOT NULL DEFAULT TRUE,
          created_at    TIMESTAMPTZ DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS console_accounts_username_idx ON console_accounts (LOWER(username))`;
      return sql;
    })().catch((err) => {
      neonSchemaPromise = null; // allow a retry on the next request
      throw err;
    });
  }
  return neonSchemaPromise;
}

// --- Orders ----------------------------------------------------------------

async function _rawInsertOrder(order) {
  if (!isConfigured()) {
    console.warn("[DB] Database not configured — skipping database insert.");
    return { skipped: true };
  }

  const supabase = getSupabaseConfig();
  if (supabase) {
    const payload = {
      order_id: order.orderId,
      order_pin: order.orderPin || null,
      customer_name: order.customerName,
      customer_phone: order.customerPhone,
      customer_email: order.customerEmail || null,
      fulfilment: order.fulfilment,
      location: order.location,
      address: order.address || null,
      items: order.items,
      notes: order.notes || null,
      status: order.status || "pending",
      subtotal: order.subtotal || 0,
      service_fee: order.serviceFee !== undefined ? order.serviceFee : 800,
      delivery_fee: order.deliveryFee || 0,
      grand_total: order.grandTotal || 0,
      payment_status: order.paymentStatus || "pending",
    };

    const post = (body) =>
      fetch(`${supabase.url}/rest/v1/orders`, {
        method: "POST",
        headers: supabaseHeaders(supabase, { Prefer: "resolution=ignore-duplicates,return=representation" }),
        body: JSON.stringify(body),
      });

    try {
      let res = await post(payload);

      // Older Supabase tables without the order_pin column: save the order anyway
      // (an order must never be lost) and flag the missing migration.
      if (!res.ok) {
        const errorText = await res.text();
        if (/order_pin/i.test(errorText)) {
          console.error(
            "[DB Supabase] orders.order_pin column missing — run migrations/001_order_pin_and_tracking.sql. Saving order without PIN."
          );
          const { order_pin, ...withoutPin } = payload;
          res = await post(withoutPin);
          if (!res.ok) {
            const retryText = await res.text();
            console.error("[DB Supabase] Insert failed:", res.status, retryText);
            return { error: retryText };
          }
        } else {
          console.error("[DB Supabase] Insert failed:", res.status, errorText);
          return { error: errorText };
        }
      }

      const data = await res.json();
      // Ensure order is also stored in Neon Postgres for PIN tracking sync
      if (isNeonConfigured()) {
        try {
          const sql = await ensureNeonSchema();
          await sql`
            INSERT INTO orders (
              order_id, order_pin, customer_name, customer_phone, customer_email,
              fulfilment, location, address, items, notes, subtotal, service_fee, delivery_fee, grand_total, payment_status, customer_username
            ) VALUES (
              ${order.orderId},
              ${order.orderPin || null},
              ${order.customerName},
              ${order.customerPhone},
              ${order.customerEmail || null},
              ${order.fulfilment},
              ${order.location},
              ${order.address || null},
              ${order.items},
              ${order.notes || null},
              ${order.subtotal || 0},
              ${order.serviceFee !== undefined ? order.serviceFee : 800},
              ${order.deliveryFee || 0},
              ${order.grandTotal || 0},
              ${order.paymentStatus || "pending"},
              ${order.customerUsername || null}
            )
            ON CONFLICT (order_id) DO NOTHING
          `;
        } catch (_) {}
      }
      return { inserted: true, record: data[0] || payload, provider: "supabase" };
    } catch (err) {
      console.error("[DB Supabase] Error inserting order:", err);
      return { error: err.message };
    }
  }

  // Neon Postgres fallback
  try {
    const sql = await ensureNeonSchema();
    const result = await sql`
      INSERT INTO orders (
        order_id, order_pin, customer_name, customer_phone, customer_email,
        fulfilment, location, address, items, notes, subtotal, service_fee, delivery_fee, grand_total, payment_status, customer_username
      ) VALUES (
        ${order.orderId},
        ${order.orderPin || null},
        ${order.customerName},
        ${order.customerPhone},
        ${order.customerEmail || null},
        ${order.fulfilment},
        ${order.location},
        ${order.address || null},
        ${order.items},
        ${order.notes || null},
        ${order.subtotal || 0},
        ${order.serviceFee !== undefined ? order.serviceFee : 800},
        ${order.deliveryFee || 0},
        ${order.grandTotal || 0},
        ${order.paymentStatus || "pending"},
        ${order.customerUsername || null}
      )
      ON CONFLICT (order_id) DO NOTHING
      RETURNING id, order_id, created_at
    `;

    return { inserted: true, record: result[0], provider: "neon" };
  } catch (err) {
    console.error("[DB Neon] Error inserting order:", err);
    return { error: err.message };
  }
}

async function insertOrder(order) {
  saveLocalOrder(order);
  return executeWithDbCircuitBreaker(
    () => _rawInsertOrder(order),
    (err) => {
      console.warn("[DB Circuit Breaker] Bypassing order insert under load/failure:", err.message);
      return { skipped: true, circuitBreaker: true, error: err.message };
    },
    2000
  );
}

// --- Order PINs ------------------------------------------------------------

async function _rawAllocatePin(pin) {
  if (!/^\d{6}$/.test(String(pin))) return false;
  if (!isConfigured()) return null;

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      const res = await fetch(`${supabase.url}/rest/v1/rpc/allocate_order_pin`, {
        method: "POST",
        headers: supabaseHeaders(supabase),
        body: JSON.stringify({ p_pin: String(pin) }),
      });
      if (!res.ok) {
        console.error(
          "[DB Supabase] allocate_order_pin unavailable (run migrations/001_order_pin_and_tracking.sql with a service-role key):",
          res.status,
          await res.text()
        );
        return null;
      }
      return (await res.json()) === true;
    } catch (err) {
      console.error("[DB Supabase] Error allocating PIN:", err);
      return null;
    }
  }

  try {
    const sql = await ensureNeonSchema();
    const rows = await sql`
      INSERT INTO order_pins (pin, issued_at) VALUES (${String(pin)}, NOW())
      ON CONFLICT (pin) DO UPDATE SET issued_at = NOW()
        WHERE order_pins.issued_at < NOW() - ${PIN_RETENTION_INTERVAL}::interval
      RETURNING pin
    `;
    return rows.length > 0;
  } catch (err) {
    console.error("[DB Neon] Error allocating PIN:", err);
    return null;
  }
}

async function allocatePin(pin) {
  return executeWithDbCircuitBreaker(
    () => _rawAllocatePin(pin),
    () => null, // on circuit trip or timeout, return null to immediately engage memory PIN allocator
    1800
  );
}

// --- Tracking --------------------------------------------------------------

async function _rawFindOrderForTracking(phone, pin) {
  if (!isConfigured()) return { skipped: true };
  const since = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const fields = "order_id,order_pin,status,created_at,fulfilment,location,items";

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      const query = new URLSearchParams({
        select: fields,
        order_pin: `eq.${pin}`,
        customer_phone: `eq.${phone}`,
        created_at: `gte.${since}`,
        order: "created_at.desc",
        limit: "1",
      });
      const res = await fetch(`${supabase.url}/rest/v1/orders?${query}`, {
        headers: supabaseHeaders(supabase),
      });
      if (!res.ok) {
        const errorText = await res.text();
        console.warn("[DB Supabase] Tracking lookup warning, falling back to Neon:", res.status, errorText);
      } else {
        const rows = await res.json();
        return { order: rows[0] || null };
      }
    } catch (err) {
      console.warn("[DB Supabase] Error looking up order, falling back to Neon:", err.message);
    }
  }

  try {
    const sql = await ensureNeonSchema();
    const rows = await sql`
      SELECT order_id, order_pin, status, created_at, fulfilment, location, items
      FROM orders
      WHERE order_pin = ${pin} AND customer_phone = ${phone} AND created_at >= ${since}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return { order: rows[0] || null };
  } catch (err) {
    console.error("[DB Neon] Error looking up order:", err);
    return { error: err.message };
  }
}

async function findOrderForTracking(phone, pin) {
  const dbRes = await executeWithDbCircuitBreaker(
    () => _rawFindOrderForTracking(phone, pin),
    (err) => ({ skipped: true, circuitBreaker: true, error: err.message }),
    2000
  );
  if (dbRes && dbRes.order) return dbRes;
  const local = findLocalOrder(phone, pin);
  return local ? { order: local, provider: "local" } : dbRes;
}

async function updateOrderStatus(orderId, status, paymentStatus, actor) {
  if (status && !ORDER_STATUSES.includes(status)) return { error: "Invalid status." };
  const validPaymentStatuses = ["pending", "paid", "received", "unpaid"];
  if (paymentStatus && !validPaymentStatuses.includes(String(paymentStatus).toLowerCase())) {
    return { error: "Invalid payment status." };
  }
  const normPayment = paymentStatus
    ? (String(paymentStatus).toLowerCase() === "received" ? "paid" : String(paymentStatus).toLowerCase())
    : null;
  const localUpdated = updateLocalOrderStatus(orderId, status, normPayment, actor);

  if (!isConfigured()) return { updated: localUpdated, localOnly: true };

  const patchFields = {};
  const actorName = actor && actor.username ? String(actor.username) : null;
  const nowIso = new Date().toISOString();
  if (status) patchFields.status = status;
  if (normPayment) patchFields.payment_status = normPayment;
  if (status === "ready" && actorName) {
    patchFields.ready_confirmed_by = actorName;
    patchFields.ready_confirmed_at = nowIso;
  }
  if (status === "completed" && actorName) {
    patchFields.completed_by = actorName;
    patchFields.completed_at = nowIso;
  }

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      const res = await fetch(`${supabase.url}/rest/v1/orders?order_id=eq.${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: supabaseHeaders(supabase, { Prefer: "return=representation" }),
        body: JSON.stringify(patchFields),
      });
      if (res.ok) {
        const rows = await res.json();
        if (isNeonConfigured()) {
          try {
            const sql = await ensureNeonSchema();
            if (status && normPayment) {
              await sql`UPDATE orders SET status = ${status}, payment_status = ${normPayment} WHERE order_id = ${orderId}`;
            } else if (status) {
              await sql`UPDATE orders SET status = ${status} WHERE order_id = ${orderId}`;
              if (status === "ready" && actorName) await sql`UPDATE orders SET ready_confirmed_by = ${actorName}, ready_confirmed_at = ${nowIso} WHERE order_id = ${orderId}`;
              if (status === "completed" && actorName) await sql`UPDATE orders SET completed_by = ${actorName}, completed_at = ${nowIso} WHERE order_id = ${orderId}`;
            } else if (normPayment) {
              await sql`UPDATE orders SET payment_status = ${normPayment} WHERE order_id = ${orderId}`;
            }
          } catch (_) {}
        }
        return { updated: rows.length > 0 || localUpdated, provider: "supabase" };
      }
    } catch (_) {}
  }

  try {
    const sql = await ensureNeonSchema();
    if (status && normPayment) {
      const rows = await sql`UPDATE orders SET status = ${status}, payment_status = ${normPayment} WHERE order_id = ${orderId} RETURNING order_id`;
      return { updated: rows.length > 0 || localUpdated, provider: "neon" };
    } else if (status) {
      const rows = await sql`UPDATE orders SET status = ${status} WHERE order_id = ${orderId} RETURNING order_id`;
      if (status === "ready" && actorName) await sql`UPDATE orders SET ready_confirmed_by = ${actorName}, ready_confirmed_at = ${nowIso} WHERE order_id = ${orderId}`;
      if (status === "completed" && actorName) await sql`UPDATE orders SET completed_by = ${actorName}, completed_at = ${nowIso} WHERE order_id = ${orderId}`;
      return { updated: rows.length > 0 || localUpdated, provider: "neon" };
    } else if (normPayment) {
      const rows = await sql`UPDATE orders SET payment_status = ${normPayment} WHERE order_id = ${orderId} RETURNING order_id`;
      return { updated: rows.length > 0 || localUpdated, provider: "neon" };
    }
    return { updated: localUpdated, provider: "local" };
  } catch (_) {
    return { updated: localUpdated, provider: "local-fallback" };
  }
}

async function deleteOrder(orderId) {
  if (!orderId) return { error: "orderId is required." };
  const localDeleted = deleteLocalOrder(orderId);

  if (!isConfigured()) return { deleted: localDeleted, localOnly: true };

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      const res = await fetch(`${supabase.url}/rest/v1/orders?order_id=eq.${encodeURIComponent(orderId)}`, {
        method: "DELETE",
        headers: supabaseHeaders(supabase, { Prefer: "return=representation" }),
      });
      if (res.ok) {
        const rows = await res.json();
        return { deleted: rows.length > 0 || localDeleted, provider: "supabase" };
      }
    } catch (_) {}
  }

  try {
    const sql = await ensureNeonSchema();
    const rows = await sql`DELETE FROM orders WHERE order_id = ${orderId} RETURNING order_id`;
    return { deleted: rows.length > 0 || localDeleted, provider: "neon" };
  } catch (_) {
    return { deleted: localDeleted, provider: "local-fallback" };
  }
}

async function findOrderById(orderId) {
  if (!orderId) return null;
  const cleanId = String(orderId).trim();

  // 1. Check local order store first
  const localList = readLocalOrdersFile();
  const foundLocal = localList.find((o) => (o.order_id || o.orderId) === cleanId);
  if (foundLocal) return foundLocal;

  // 2. Check Supabase
  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      const res = await fetch(`${supabase.url}/rest/v1/orders?order_id=eq.${encodeURIComponent(cleanId)}&limit=1`, {
        headers: supabaseHeaders(supabase),
      });
      if (res.ok) {
        const rows = await res.json();
        if (rows && rows.length > 0) return rows[0];
      }
    } catch (_) {}
  }

  // 3. Check Neon Postgres
  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`SELECT * FROM orders WHERE order_id = ${cleanId} LIMIT 1`;
      if (rows && rows.length > 0) return rows[0];
    } catch (_) {}
  }

  return null;
}

async function getOrders({ limit = 100, offset = 0 } = {}) {
  if (!isConfigured()) {
    return { skipped: true, orders: getLocalOrders({ limit, offset }), provider: "local" };
  }

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      const url = `${supabase.url}/rest/v1/orders?select=*&order=created_at.desc&limit=${limit}&offset=${offset}`;
      const res = await fetch(url, {
        method: "GET",
        headers: {
          apikey: supabase.key,
          Authorization: `Bearer ${supabase.key}`,
          "Range-Unit": "items",
          Range: `${offset}-${offset + limit - 1}`,
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("[DB Supabase] Fetch failed:", res.status, errorText);
        return { orders: getLocalOrders({ limit, offset }), error: errorText, provider: "local-fallback" };
      }

      const rows = await res.json();
      const local = getLocalOrders({ limit, offset });
      const seen = new Set((Array.isArray(rows) ? rows : []).map((o) => o.order_id || o.orderId));
      const combined = [...(Array.isArray(rows) ? rows : [])];
      for (const loc of local) {
        if (!seen.has(loc.order_id || loc.orderId)) {
          combined.unshift(loc);
        }
      }
      return { orders: combined.slice(0, limit), provider: "supabase" };
    } catch (err) {
      console.error("[DB Supabase] Error fetching orders:", err);
      return { orders: getLocalOrders({ limit, offset }), error: err.message, provider: "local-fallback" };
    }
  }

  // Neon fallback
  try {
    const sql = await ensureNeonSchema();
    const rows = await sql`
      SELECT * FROM orders
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return { orders: rows, provider: "neon" };
  } catch (err) {
    console.error("[DB Neon] Error fetching orders:", err);
    return { orders: getLocalOrders({ limit, offset }), error: err.message, provider: "local-fallback" };
  }
}

// --- Customer Feedback (Neon Postgres + Supabase Dual-DB) -----------------

const LOCAL_FEEDBACK_FILE = fs.existsSync("/tmp") ? "/tmp/romeos-feedback-store.json" : path.join(require("os").tmpdir(), "romeos-feedback-store.json");

const SEED_ICE_CREAM_FEEDBACK = [
  {
    id: "seed-fb-1",
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    rating: 5,
    customer_name: "Amina Bello",
    order_pin: "819204",
    tags: "🍦 Rich & Creamy, 🧇 Crispy Waffle Bowl",
    comments: "The artisanal rolled Madagascar vanilla and berry swirls were packed in thermal insulated bags and stayed perfectly frozen! Best dessert treat in Abuja.",
    source: "web_bubble",
    feedback_type: "feedback"
  },
  {
    id: "seed-fb-2",
    created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
    rating: 5,
    customer_name: "Chinedu Eke",
    order_pin: "394821",
    tags: "🍧 Perfect 2-in-1 Tub, 😋 Authentic Flavours",
    comments: "Ordered the Champion 2-in-1 split tub with Belgian Chocolate and Pistachio Crunch. Creamy texture and generous portions!",
    source: "web_bubble",
    feedback_type: "feedback"
  },
  {
    id: "seed-fb-3",
    created_at: new Date(Date.now() - 3600000 * 14).toISOString(),
    rating: 5,
    customer_name: "Zainab Bakare",
    order_pin: "602184",
    tags: "⚡ Fast Cold-Bag Delivery, 🛵 Friendly Courier",
    comments: "Delivered in under 25 minutes. Courier was super polite and the waffle bowls were still completely crunchy and chilled.",
    source: "web_bubble",
    feedback_type: "feedback"
  },
  {
    id: "seed-fb-4",
    created_at: new Date(Date.now() - 3600000 * 26).toISOString(),
    rating: 4,
    customer_name: "Tunde Adeyemi",
    order_pin: "481920",
    tags: "🍓 Fresh Berry Swirls, 🍦 Rich & Creamy",
    comments: "Really rich and velvety texture. Love the fresh strawberry drizzle on top of the waffle cones.",
    source: "web_bubble",
    feedback_type: "feedback"
  },
  {
    id: "seed-fb-5",
    created_at: new Date(Date.now() - 3600000 * 38).toISOString(),
    rating: 5,
    customer_name: "Ngozi Kalu",
    order_pin: "772910",
    tags: "😋 Authentic Flavours, 🧇 Crispy Waffle Bowl",
    comments: "Caramel biscoff rolled sundaes are pure heaven. We will definitely be ordering again for our family treat night!",
    source: "web_bubble",
    feedback_type: "feedback"
  }
];

function readLocalFeedbackFile() {
  try {
    if (!fs.existsSync(LOCAL_FEEDBACK_FILE)) {
      writeLocalFeedbackFile(SEED_ICE_CREAM_FEEDBACK);
      return [...SEED_ICE_CREAM_FEEDBACK];
    }
    const raw = fs.readFileSync(LOCAL_FEEDBACK_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      writeLocalFeedbackFile(SEED_ICE_CREAM_FEEDBACK);
      return [...SEED_ICE_CREAM_FEEDBACK];
    }
    return parsed;
  } catch (_) {
    return [...SEED_ICE_CREAM_FEEDBACK];
  }
}

function writeLocalFeedbackFile(list) {
  try {
    const data = JSON.stringify(list.slice(0, 300));
    fs.writeFileSync(LOCAL_FEEDBACK_FILE, data, { encoding: "utf8", mode: 0o600 });
    const coldberryStore = "/tmp/coldberry-feedback-store.json";
    if (LOCAL_FEEDBACK_FILE !== coldberryStore) {
      fs.writeFileSync(coldberryStore, data, { encoding: "utf8", mode: 0o600 });
    }
  } catch (_) {}
}

async function insertFeedback(feedback) {
  const rawType = String(feedback.feedback_type || feedback.feedbackType || feedback.type || "feedback").trim().toLowerCase();
  const feedbackType = rawType === "complaint" ? "complaint" : "feedback";
  const record = {
    id: feedback.id || String(Date.now()),
    created_at: new Date().toISOString(),
    rating: Math.max(1, Math.min(5, Number(feedback.rating) || 5)),
    customer_name: String(feedback.customer_name || feedback.name || "Anonymous").slice(0, 100),
    order_pin: String(feedback.order_pin || feedback.pin || "").slice(0, 10),
    tags: (Array.isArray(feedback.tags) ? feedback.tags.slice(0, 10).map((t) => String(t).trim().slice(0, 40)).filter(Boolean).join(", ") : String(feedback.tags || "")).slice(0, 300),
    comments: String(feedback.comments || feedback.comment || feedback.message || "").slice(0, 1000),
    source: String(feedback.source || "web_bubble").slice(0, 50),
    feedback_type: feedbackType,
  };

  // Local fallback write
  const localList = readLocalFeedbackFile();
  localList.unshift(record);
  writeLocalFeedbackFile(localList);

  let neonSaved = false;
  let supabaseSaved = false;

  // 1. Neon Postgres write
  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      await sql`
        INSERT INTO customer_feedback (
          created_at, rating, customer_name, order_pin, tags, comments, source, feedback_type
        ) VALUES (
          ${record.created_at},
          ${record.rating},
          ${record.customer_name},
          ${record.order_pin || null},
          ${record.tags || null},
          ${record.comments || null},
          ${record.source},
          ${record.feedback_type}
        )
      `;
      neonSaved = true;
    } catch (err) {
      console.warn("[Feedback] Neon insert warning:", err.message);
    }
  }

  // 2. Supabase write (dual-database sync)
  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      const res = await fetch(`${supabase.url}/rest/v1/customer_feedback`, {
        method: "POST",
        headers: supabaseHeaders(supabase, { Prefer: "return=representation" }),
        body: JSON.stringify(record),
      });
      if (res.ok) {
        supabaseSaved = true;
      } else {
        const errText = await res.text();
        console.warn("[Feedback] Supabase insert warning:", res.status, errText);
      }
    } catch (err) {
      console.warn("[Feedback] Supabase insert error:", err.message);
    }
  }

  return {
    success: true,
    record,
    neon: neonSaved,
    supabase: supabaseSaved,
    local: true,
  };
}

async function getFeedback({ limit = 50, offset = 0 } = {}) {
  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`
        SELECT * FROM customer_feedback
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      if (rows && rows.length > 0) {
        return { feedback: rows, provider: "neon" };
      }
    } catch (err) {
      console.warn("[Feedback] Neon get error:", err.message);
    }
  }

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      const res = await fetch(`${supabase.url}/rest/v1/customer_feedback?select=*&order=created_at.desc&limit=${limit}&offset=${offset}`, {
        method: "GET",
        headers: supabaseHeaders(supabase),
      });
      if (res.ok) {
        const rows = await res.json();
        return { feedback: rows, provider: "supabase" };
      }
    } catch (err) {
      console.warn("[Feedback] Supabase get error:", err.message);
    }
  }

  const local = readLocalFeedbackFile();
  return { feedback: local.slice(offset, offset + limit), provider: "local" };
}

async function deleteFeedback({ id, createdAt } = {}) {
  const numId = id !== undefined && id !== null && String(id).trim() !== "" ? Number(id) : NaN;
  const cleanCreatedAt = String(createdAt || "").trim();
  if (!Number.isFinite(numId) && !cleanCreatedAt) {
    return { error: "feedbackId or createdAt is required." };
  }

  let deleted = false;
  const local = readLocalFeedbackFile();
  const filtered = local.filter((item) => {
    if (Number.isFinite(numId) && item.id !== undefined && Number(item.id) === numId) return false;
    if (cleanCreatedAt && item.created_at === cleanCreatedAt) return false;
    return true;
  });
  if (filtered.length !== local.length) {
    writeLocalFeedbackFile(filtered);
    deleted = true;
  }

  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      if (Number.isFinite(numId) && numId > 0) {
        const rows = await sql`DELETE FROM customer_feedback WHERE id = ${numId} RETURNING id`;
        if (rows && rows.length > 0) deleted = true;
      } else if (cleanCreatedAt) {
        const rows = await sql`DELETE FROM customer_feedback WHERE created_at = ${cleanCreatedAt} RETURNING id`;
        if (rows && rows.length > 0) deleted = true;
      }
    } catch (err) {
      console.warn("[Feedback] Neon delete error:", err.message);
    }
  }

  const supabase = getSupabaseConfig();
  if (supabase && Number.isFinite(numId) && numId > 0) {
    try {
      const res = await fetch(`${supabase.url}/rest/v1/customer_feedback?id=eq.${encodeURIComponent(numId)}`, {
        method: "DELETE",
        headers: supabaseHeaders(supabase),
      });
      if (res.ok) deleted = true;
    } catch (_) {}
  }

  return { deleted: true, found: deleted };
}

// --- Refund Tokens (15-Char Alphanumeric Dual-DB Sync + Local Store) --------

const LOCAL_REFUNDS_FILE = path.join(require("os").tmpdir(), "romeos-refund-tokens.json");

function readLocalRefundsFile() {
  try {
    if (!fs.existsSync(LOCAL_REFUNDS_FILE)) return [];
    const raw = fs.readFileSync(LOCAL_REFUNDS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeLocalRefundsFile(list) {
  try {
    fs.writeFileSync(LOCAL_REFUNDS_FILE, JSON.stringify(list.slice(0, 500)), { encoding: "utf8", mode: 0o600 });
  } catch (_) {}
}

async function saveRefundToken(refundRecord) {
  if (!refundRecord || !refundRecord.token) return { error: "Token is required." };
  const token = String(refundRecord.token).trim().toUpperCase();
  if (!/^[A-Z0-9]{15}$/.test(token)) {
    return { error: "Refund token must be exactly 15 uppercase alphanumeric characters." };
  }

  const record = {
    token,
    order_id: String(refundRecord.order_id || refundRecord.orderId || "").slice(0, 100),
    order_pin: refundRecord.order_pin || refundRecord.orderPin ? String(refundRecord.order_pin || refundRecord.orderPin).slice(0, 12) : null,
    customer_name: String(refundRecord.customer_name || refundRecord.customerName || "Customer").slice(0, 120),
    customer_phone: String(refundRecord.customer_phone || refundRecord.customerPhone || "").slice(0, 50),
    amount: Number(refundRecord.amount ?? refundRecord.refundedAmount ?? 0),
    reason: String(refundRecord.reason || "Order Cancellation / Deletion").slice(0, 500),
    issued_by: String(refundRecord.issued_by || refundRecord.issuedBy || "admin").slice(0, 50),
    issued_at: refundRecord.issued_at || refundRecord.issuedAt || new Date().toISOString(),
    status: (refundRecord.status || "unclaimed").toLowerCase(),
    claimed_at: refundRecord.claimed_at || refundRecord.claimedAt || null,
  };

  // 1. Local fallback write
  const list = readLocalRefundsFile();
  const idx = list.findIndex((r) => r.token === token);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...record };
  } else {
    list.unshift(record);
  }
  writeLocalRefundsFile(list);

  let neonSaved = false;
  let supabaseSaved = false;

  // 2. Neon Postgres dual-write sync
  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      await sql`
        INSERT INTO refund_tokens (
          token, order_id, order_pin, customer_name, customer_phone, amount, reason, issued_by, issued_at, status, claimed_at
        ) VALUES (
          ${record.token},
          ${record.order_id},
          ${record.order_pin},
          ${record.customer_name},
          ${record.customer_phone},
          ${record.amount},
          ${record.reason},
          ${record.issued_by},
          ${record.issued_at},
          ${record.status},
          ${record.claimed_at}
        )
        ON CONFLICT (token) DO UPDATE SET
          status = EXCLUDED.status,
          claimed_at = EXCLUDED.claimed_at,
          order_pin = COALESCE(EXCLUDED.order_pin, refund_tokens.order_pin)
      `;
      neonSaved = true;
    } catch (err) {
      console.warn("[RefundTokens] Neon insert warning:", err.message);
    }
  }

  // 3. Supabase dual-write sync
  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      const res = await fetch(`${supabase.url}/rest/v1/refund_tokens`, {
        method: "POST",
        headers: supabaseHeaders(supabase, { Prefer: "resolution=merge-duplicates" }),
        body: JSON.stringify(record),
      });
      if (res.ok) {
        supabaseSaved = true;
      } else {
        const errText = await res.text();
        console.warn("[RefundTokens] Supabase insert warning:", res.status, errText);
      }
    } catch (err) {
      console.warn("[RefundTokens] Supabase insert error:", err.message);
    }
  }

  return {
    success: true,
    record,
    neon: neonSaved,
    supabase: supabaseSaved,
    local: true,
  };
}

async function getRefundTokens({ limit = 50, offset = 0, status = null } = {}) {
  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      let rows;
      if (status) {
        rows = await sql`
          SELECT * FROM refund_tokens
          WHERE status = ${status}
          ORDER BY issued_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      } else {
        rows = await sql`
          SELECT * FROM refund_tokens
          ORDER BY issued_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `;
      }
      if (rows && rows.length > 0) {
        return { tokens: rows, count: rows.length, provider: "neon" };
      }
    } catch (err) {
      console.warn("[RefundTokens] Neon fetch warning:", err.message);
    }
  }

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      let url = `${supabase.url}/rest/v1/refund_tokens?select=*&order=issued_at.desc&limit=${limit}&offset=${offset}`;
      if (status) url += `&status=eq.${encodeURIComponent(status)}`;
      const res = await fetch(url, {
        method: "GET",
        headers: supabaseHeaders(supabase),
      });
      if (res.ok) {
        const rows = await res.json();
        return { tokens: rows, count: rows.length, provider: "supabase" };
      }
    } catch (err) {
      console.warn("[RefundTokens] Supabase fetch warning:", err.message);
    }
  }

  const list = readLocalRefundsFile();
  const filtered = status ? list.filter((r) => r.status === status) : list;
  return { tokens: filtered.slice(offset, offset + limit), count: filtered.length, provider: "local" };
}

async function findRefundToken(token) {
  if (!token) return null;
  const cleanToken = String(token).trim().toUpperCase();

  // Check local store
  const localList = readLocalRefundsFile();
  const foundLocal = localList.find((r) => r.token === cleanToken);

  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`SELECT * FROM refund_tokens WHERE token = ${cleanToken} LIMIT 1`;
      if (rows && rows.length > 0) return rows[0];
    } catch (_) {}
  }

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      const res = await fetch(`${supabase.url}/rest/v1/refund_tokens?token=eq.${encodeURIComponent(cleanToken)}&limit=1`, {
        headers: supabaseHeaders(supabase),
      });
      if (res.ok) {
        const rows = await res.json();
        if (rows && rows.length > 0) return rows[0];
      }
    } catch (_) {}
  }

  return foundLocal || null;
}

async function claimRefundToken(token, claimedBy = "staff") {
  if (!token) return { error: "Token is required." };
  const cleanToken = String(token).trim().toUpperCase();
  const rec = await findRefundToken(cleanToken);
  if (!rec) return { error: "Refund token not found." };
  if (rec.status === "claimed") {
    return { error: "Refund token has already been claimed / redeemed.", record: rec, alreadyClaimed: true };
  }

  const claimedAt = new Date().toISOString();
  rec.status = "claimed";
  rec.claimed_at = claimedAt;
  rec.claimed_by = claimedBy;

  // Local update
  const localList = readLocalRefundsFile();
  const idx = localList.findIndex((r) => r.token === cleanToken);
  if (idx >= 0) {
    localList[idx].status = "claimed";
    localList[idx].claimed_at = claimedAt;
    localList[idx].claimed_by = claimedBy;
    writeLocalRefundsFile(localList);
  }

  // Neon update
  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      await sql`
        UPDATE refund_tokens
        SET status = 'claimed', claimed_at = ${claimedAt}
        WHERE token = ${cleanToken}
      `;
    } catch (_) {}
  }

  // Supabase update
  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      await fetch(`${supabase.url}/rest/v1/refund_tokens?token=eq.${encodeURIComponent(cleanToken)}`, {
        method: "PATCH",
        headers: supabaseHeaders(supabase),
        body: JSON.stringify({ status: "claimed", claimed_at: claimedAt }),
      });
    } catch (_) {}
  }

  return { success: true, token: cleanToken, record: rec };
}

async function deleteRefundToken(token) {
  const cleanToken = String(token || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{15}$/.test(cleanToken)) {
    return { error: "Valid 15-character refund token is required." };
  }

  const existing = await findRefundToken(cleanToken);
  if (!existing) {
    return { error: "Refund token not found." };
  }
  if (String(existing.status || "").toLowerCase() !== "claimed") {
    return { error: "Only used (claimed) refund tokens can be deleted." };
  }

  const list = readLocalRefundsFile().filter((r) => r.token !== cleanToken);
  writeLocalRefundsFile(list);

  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      await sql`DELETE FROM refund_tokens WHERE token = ${cleanToken} AND status = 'claimed'`;
    } catch (_) {}
  }

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      await fetch(`${supabase.url}/rest/v1/refund_tokens?token=eq.${encodeURIComponent(cleanToken)}&status=eq.claimed`, {
        method: "DELETE",
        headers: supabaseHeaders(supabase),
      });
    } catch (_) {}
  }

  return { deleted: true, token: cleanToken };
}

async function deleteClaimedRefundTokens() {
  const localBefore = readLocalRefundsFile();
  const claimedLocalCount = localBefore.filter((r) => String(r.status || "").toLowerCase() === "claimed").length;
  writeLocalRefundsFile(localBefore.filter((r) => String(r.status || "").toLowerCase() !== "claimed"));

  let deletedCount = claimedLocalCount;
  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`DELETE FROM refund_tokens WHERE status = 'claimed' RETURNING token`;
      if (Array.isArray(rows)) deletedCount = rows.length;
    } catch (_) {}
  }

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      await fetch(`${supabase.url}/rest/v1/refund_tokens?status=eq.claimed`, {
        method: "DELETE",
        headers: supabaseHeaders(supabase),
      });
    } catch (_) {}
  }

  return { deleted: true, deletedCount };
}

function phoneMatchVariants(phone) {
  const raw = String(phone || "").trim();
  const digits = raw.replace(/\D/g, "");
  const out = new Set();
  if (raw) out.add(raw);
  if (digits.startsWith("234") && digits.length >= 13) {
    out.add(`+${digits}`);
    out.add(`0${digits.slice(3)}`);
  } else if (digits.startsWith("0") && digits.length === 11) {
    out.add(digits);
    out.add(`+234${digits.slice(1)}`);
  }
  return Array.from(out);
}

async function findRefundByTracking(phone, pin) {
  const cleanPin = String(pin || "").trim();
  const variants = phoneMatchVariants(phone);
  if (!cleanPin || variants.length === 0) return null;

  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`
        SELECT * FROM refund_tokens
        WHERE order_pin = ${cleanPin}
          AND customer_phone = ANY(${variants})
        ORDER BY issued_at DESC
        LIMIT 1
      `;
      if (rows && rows[0]) return rows[0];
    } catch (_) {}
  }

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      const inList = variants.map((v) => `"${v}"`).join(",");
      const res = await fetch(
        `${supabase.url}/rest/v1/refund_tokens?order_pin=eq.${encodeURIComponent(cleanPin)}&customer_phone=in.(${encodeURIComponent(inList)})&order=issued_at.desc&limit=1`,
        { headers: supabaseHeaders(supabase) }
      );
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows[0]) return rows[0];
      }
    } catch (_) {}
  }

  const local = readLocalRefundsFile();
  return local.find((r) => r.order_pin === cleanPin && variants.includes(r.customer_phone)) || null;
}

async function findRefundsByPhone(phone) {
  const variants = phoneMatchVariants(phone);
  if (variants.length === 0) return [];

  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`
        SELECT * FROM refund_tokens
        WHERE customer_phone = ANY(${variants})
        ORDER BY issued_at DESC
        LIMIT 25
      `;
      if (Array.isArray(rows)) return rows;
    } catch (_) {}
  }

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      const inList = variants.map((v) => `"${v}"`).join(",");
      const res = await fetch(
        `${supabase.url}/rest/v1/refund_tokens?customer_phone=in.(${encodeURIComponent(inList)})&order=issued_at.desc&limit=25`,
        { headers: supabaseHeaders(supabase) }
      );
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows)) return rows;
      }
    } catch (_) {}
  }

  const local = readLocalRefundsFile();
  return local.filter((r) => variants.includes(r.customer_phone));
}

// --- Main Site Customer Users (Neon + Supabase + Local Fallback) -------------

const LOCAL_USERS_FILE = path.join(require("os").tmpdir(), "romeos-customer-users.json");

function readLocalUsersFile() {
  try {
    if (!fs.existsSync(LOCAL_USERS_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(LOCAL_USERS_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeLocalUsersFile(users) {
  if ((process.env.VERCEL || process.env.NODE_ENV === "production") && isConfigured()) return;
  try {
    fs.writeFileSync(LOCAL_USERS_FILE, JSON.stringify(users.slice(0, 500), null, 2), { encoding: "utf8", mode: 0o600 });
  } catch (_) {}
}

async function findCustomerByUsername(username) {
  const clean = String(username || "").trim().toLowerCase();
  if (!clean) return null;

  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`SELECT * FROM customer_users WHERE username = ${clean} LIMIT 1`;
      if (rows && rows[0]) return rows[0];
    } catch (_) {}
  }

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      const res = await fetch(
        `${supabase.url}/rest/v1/customer_users?username=eq.${encodeURIComponent(clean)}&limit=1`,
        { headers: supabaseHeaders(supabase) }
      );
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows[0]) return rows[0];
      }
    } catch (_) {}
  }

  return readLocalUsersFile().find((u) => u.username === clean) || null;
}

async function findCustomerByEmail(email) {
  const clean = String(email || "").trim().toLowerCase();
  if (!clean) return null;

  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`SELECT * FROM customer_users WHERE LOWER(email) = ${clean} LIMIT 1`;
      if (rows && rows[0]) return rows[0];
    } catch (_) {}
  }

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      const res = await fetch(
        `${supabase.url}/rest/v1/customer_users?email=eq.${encodeURIComponent(clean)}&limit=1`,
        { headers: supabaseHeaders(supabase) }
      );
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows[0]) return rows[0];
      }
    } catch (_) {}
  }

  const local = readLocalUsersFile();
  return local.find((u) => u.email && String(u.email).toLowerCase() === clean) || null;
}

async function createCustomerUser(user) {
  const cleanUsername = String(user.username || "").trim().toLowerCase();
  const cleanEmail = String(user.email || "").trim().toLowerCase();
  const existing = await findCustomerByUsername(cleanUsername);
  if (existing) return { error: "Username is already taken.", conflict: true };
  if (cleanEmail) {
    const existingEmail = await findCustomerByEmail(cleanEmail);
    if (existingEmail) return { error: "An account with this email already exists.", conflict: true };
  }

  const record = {
    username: cleanUsername,
    password_hash: user.passwordHash,
    full_name: String(user.fullName || "").trim().slice(0, 120),
    email: cleanEmail ? cleanEmail.slice(0, 254) : null,
    phone: String(user.phone || "").trim().slice(0, 40),
    avatar_icon: String(user.avatarIcon || "pizza").slice(0, 30),
    default_location: user.defaultLocation ? String(user.defaultLocation).slice(0, 120) : null,
    default_address: user.defaultAddress ? String(user.defaultAddress).slice(0, 300) : null,
    created_at: new Date().toISOString(),
    last_login_at: new Date().toISOString(),
  };

  const local = readLocalUsersFile();
  local.unshift(record);
  writeLocalUsersFile(local);

  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`
        INSERT INTO customer_users (
          username, password_hash, full_name, email, phone, avatar_icon, default_location, default_address, created_at, last_login_at
        ) VALUES (
          ${record.username}, ${record.password_hash}, ${record.full_name}, ${record.email}, ${record.phone},
          ${record.avatar_icon}, ${record.default_location}, ${record.default_address},
          ${record.created_at}, ${record.last_login_at}
        )
        RETURNING *
      `;
      if (rows && rows[0]) {
        Object.assign(record, rows[0]);
      }
    } catch (err) {
      if (err && err.code === "23505") {
        return { error: "Username is already taken.", conflict: true };
      }
      console.warn("[CustomerUsers] Neon insert warning:", err.message);
    }
  }

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      await fetch(`${supabase.url}/rest/v1/customer_users`, {
        method: "POST",
        headers: supabaseHeaders(supabase, { Prefer: "resolution=ignore-duplicates" }),
        body: JSON.stringify(record),
      });
    } catch (_) {}
  }

  return { success: true, user: record };
}

async function updateCustomerProfile(username, updates = {}) {
  const clean = String(username || "").trim().toLowerCase();
  if (!clean) return { error: "Username required." };

  const local = readLocalUsersFile();
  const idx = local.findIndex((u) => u.username === clean);
  if (idx >= 0) {
    if (updates.avatarIcon) local[idx].avatar_icon = String(updates.avatarIcon).slice(0, 30);
    if (updates.fullName) local[idx].full_name = String(updates.fullName).slice(0, 120);
    if (updates.defaultLocation !== undefined) local[idx].default_location = updates.defaultLocation || null;
    if (updates.defaultAddress !== undefined) local[idx].default_address = updates.defaultAddress || null;
    if (updates.lastLoginAt) local[idx].last_login_at = updates.lastLoginAt;
    if (updates.passwordHash) local[idx].password_hash = String(updates.passwordHash);
    writeLocalUsersFile(local);
  }

  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      await sql`
        UPDATE customer_users SET
          avatar_icon = COALESCE(${updates.avatarIcon || null}, avatar_icon),
          full_name = COALESCE(${updates.fullName || null}, full_name),
          default_location = COALESCE(${updates.defaultLocation !== undefined ? updates.defaultLocation : null}, default_location),
          default_address = COALESCE(${updates.defaultAddress !== undefined ? updates.defaultAddress : null}, default_address),
          last_login_at = COALESCE(${updates.lastLoginAt || null}, last_login_at),
          password_hash = COALESCE(${updates.passwordHash || null}, password_hash)
        WHERE username = ${clean}
      `;
    } catch (_) {}
  }

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      const patch = {};
      if (updates.avatarIcon) patch.avatar_icon = updates.avatarIcon;
      if (updates.fullName) patch.full_name = updates.fullName;
      if (updates.defaultLocation !== undefined) patch.default_location = updates.defaultLocation;
      if (updates.defaultAddress !== undefined) patch.default_address = updates.defaultAddress;
      if (updates.lastLoginAt) patch.last_login_at = updates.lastLoginAt;
      if (updates.passwordHash) patch.password_hash = updates.passwordHash;
      if (Object.keys(patch).length > 0) {
        await fetch(`${supabase.url}/rest/v1/customer_users?username=eq.${encodeURIComponent(clean)}`, {
          method: "PATCH",
          headers: supabaseHeaders(supabase),
          body: JSON.stringify(patch),
        });
      }
    } catch (_) {}
  }

  return { success: true, user: await findCustomerByUsername(clean) };
}

async function getOrdersByCustomer(username, phone) {
  const cleanUser = String(username || "").trim().toLowerCase();
  const variants = phoneMatchVariants(phone);

  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`
        SELECT order_id, order_pin, created_at, customer_name, customer_phone, fulfilment, location, items, status, grand_total, payment_status
        FROM orders
        WHERE (customer_username = ${cleanUser} OR customer_phone = ANY(${variants}))
        ORDER BY created_at DESC
        LIMIT 20
      `;
      if (Array.isArray(rows)) return rows;
    } catch (_) {}
  }

  const local = getLocalOrders({ limit: 100 });
  return local.filter(
    (o) =>
      (cleanUser && o.customer_username === cleanUser) ||
      variants.includes(o.customer_phone)
  ).slice(0, 20);
}

async function getCustomerUsers({ limit = 100, activeMinutes = 10 } = {}) {
  const cutoffMs = Date.now() - activeMinutes * 60 * 1000;
  const decorate = (u) => {
    const lastMs = Date.parse(u.last_login_at || u.created_at || 0) || 0;
    return {
      username: u.username,
      fullName: u.full_name,
      email: u.email || "",
      phone: u.phone,
      avatarIcon: u.avatar_icon || "pizza",
      defaultLocation: u.default_location || "",
      defaultAddress: u.default_address || "",
      createdAt: u.created_at,
      lastActiveAt: u.last_login_at || u.created_at,
      isActive: lastMs >= cutoffMs,
    };
  };

  let rows = null;
  let provider = "local";

  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      rows = await sql`
        SELECT username, full_name, email, phone, avatar_icon, default_location, default_address, created_at, last_login_at
        FROM customer_users
        ORDER BY COALESCE(last_login_at, created_at) DESC
        LIMIT ${limit}
      `;
      provider = "neon";
    } catch (_) {}
  }

  if (!Array.isArray(rows)) {
    const supabase = getSupabaseConfig();
    if (supabase) {
      try {
        const res = await fetch(
          `${supabase.url}/rest/v1/customer_users?select=username,full_name,email,phone,avatar_icon,default_location,default_address,created_at,last_login_at&order=last_login_at.desc.nullslast&limit=${limit}`,
          { headers: supabaseHeaders(supabase) }
        );
        if (res.ok) {
          rows = await res.json();
          provider = "supabase";
        }
      } catch (_) {}
    }
  }

  if (!Array.isArray(rows)) {
    rows = readLocalUsersFile().slice(0, limit);
  }

  const users = rows.map(decorate);
  const activeSignedIn = users.filter((u) => u.isActive).length;
  return {
    users,
    totalSignedIn: users.length,
    activeSignedIn,
    provider,
  };
}

async function deleteCustomerUser(username) {
  const clean = String(username || "").trim().toLowerCase();
  if (!clean) return { error: "Username is required." };

  const existing = await findCustomerByUsername(clean);
  if (!existing) {
    return { error: "Customer account not found." };
  }

  const local = readLocalUsersFile().filter((u) => u.username !== clean);
  writeLocalUsersFile(local);

  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      await sql`DELETE FROM customer_users WHERE username = ${clean}`;
    } catch (_) {}
  }

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      await fetch(`${supabase.url}/rest/v1/customer_users?username=eq.${encodeURIComponent(clean)}`, {
        method: "DELETE",
        headers: supabaseHeaders(supabase),
      });
    } catch (_) {}
  }

  return { deleted: true, username: clean };
}

// --- Admin-to-Customer Broadcast & Direct Messages ---------------------------

const LOCAL_MESSAGES_FILE = path.join(require("os").tmpdir(), "romeos-customer-messages.json");

function readLocalMessagesFile() {
  try {
    if (!fs.existsSync(LOCAL_MESSAGES_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(LOCAL_MESSAGES_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeLocalMessagesFile(list) {
  try {
    fs.writeFileSync(LOCAL_MESSAGES_FILE, JSON.stringify(list.slice(0, 300), null, 2), { encoding: "utf8", mode: 0o600 });
  } catch (_) {}
}

async function saveCustomerMessage({ recipientUsername = "ALL", recipientPhone = null, sender = "admin", title = "", body = "" }) {
  const cleanBody = String(body || "").trim().slice(0, 1000);
  if (!cleanBody) return { error: "Message text is required." };
  const targetUser = String(recipientUsername || "ALL").trim();
  const cleanTarget = targetUser.toUpperCase() === "ALL" ? "ALL" : targetUser.toLowerCase();

  const record = {
    id: String(Date.now()),
    recipient_username: cleanTarget,
    recipient_phone: recipientPhone ? String(recipientPhone).trim().slice(0, 40) : null,
    sender: String(sender || "admin").slice(0, 50),
    title: String(title || (cleanTarget === "ALL" ? "Announcement from Romeo's Pizza" : "Direct Message from Romeo's Pizza")).slice(0, 150),
    body: cleanBody,
    created_at: new Date().toISOString(),
  };

  const local = readLocalMessagesFile();
  local.unshift(record);
  writeLocalMessagesFile(local);

  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`
        INSERT INTO customer_messages (recipient_username, recipient_phone, sender, title, body, created_at)
        VALUES (${record.recipient_username}, ${record.recipient_phone}, ${record.sender}, ${record.title}, ${record.body}, ${record.created_at})
        RETURNING *
      `;
      if (rows && rows[0]) Object.assign(record, rows[0]);
    } catch (err) {
      console.warn("[CustomerMessages] Neon insert warning:", err.message);
    }
  }

  const supabase = getSupabaseConfig();
  if (supabase) {
    try {
      await fetch(`${supabase.url}/rest/v1/customer_messages`, {
        method: "POST",
        headers: supabaseHeaders(supabase),
        body: JSON.stringify({
          recipient_username: record.recipient_username,
          recipient_phone: record.recipient_phone,
          sender: record.sender,
          title: record.title,
          body: record.body,
          created_at: record.created_at,
        }),
      });
    } catch (_) {}
  }

  return { success: true, message: record };
}

async function getMessagesForCustomer(username, phone) {
  const cleanUser = String(username || "").trim().toLowerCase();
  const variants = phoneMatchVariants(phone);

  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`
        SELECT id, recipient_username, sender, title, body, created_at
        FROM customer_messages
        WHERE recipient_username = 'ALL'
           OR recipient_username = ${cleanUser}
           OR recipient_phone = ANY(${variants})
        ORDER BY created_at DESC
        LIMIT 20
      `;
      if (Array.isArray(rows)) return rows;
    } catch (_) {}
  }

  return readLocalMessagesFile()
    .filter(
      (m) =>
        m.recipient_username === "ALL" ||
        (cleanUser && m.recipient_username === cleanUser) ||
        (m.recipient_phone && variants.includes(m.recipient_phone))
    )
    .slice(0, 20);
}

async function getAllCustomerMessages({ limit = 50 } = {}) {
  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`
        SELECT id, recipient_username, recipient_phone, sender, title, body, created_at
        FROM customer_messages
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      if (Array.isArray(rows)) return rows;
    } catch (_) {}
  }
  return readLocalMessagesFile().slice(0, limit);
}

// --- Active Visitors / Live Activity Stat Tracker ---------------------------

const VISITOR_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const LOCAL_VISITORS_FILE = path.join(require("os").tmpdir(), "romeos-active-visitors.json");

function recordVisitorHit(identifier) {
  try {
    const now = Date.now();
    const id = String(identifier || "guest-" + Math.random().toString(36).slice(2, 8)).slice(0, 100);
    let store = {};
    if (fs.existsSync(LOCAL_VISITORS_FILE)) {
      try {
        store = JSON.parse(fs.readFileSync(LOCAL_VISITORS_FILE, "utf8")) || {};
      } catch (_) {
        store = {};
      }
    }
    store[id] = now;
    const cutoff = now - VISITOR_EXPIRY_MS;
    for (const key of Object.keys(store)) {
      if (store[key] < cutoff) delete store[key];
    }
    fs.writeFileSync(LOCAL_VISITORS_FILE, JSON.stringify(store), { encoding: "utf8", mode: 0o600 });
    return Object.keys(store).length;
  } catch (_) {
    return 1;
  }
}

function getActiveVisitorCount() {
  try {
    const now = Date.now();
    const cutoff = now - VISITOR_EXPIRY_MS;
    if (!fs.existsSync(LOCAL_VISITORS_FILE)) {
      recordVisitorHit("console-admin");
      return 1;
    }
    const store = JSON.parse(fs.readFileSync(LOCAL_VISITORS_FILE, "utf8")) || {};
    let count = 0;
    for (const key of Object.keys(store)) {
      if (store[key] >= cutoff) count++;
    }
    return Math.max(count, 1);
  } catch (_) {
    return 1;
  }
}

async function defaultHandler(req, res) {
  try {
    const { resolveAuthFromRequest } = require("./admin");
    const auth = resolveAuthFromRequest(req);
    if (!auth || auth.role !== "admin") {
      return res && typeof res.status === "function" ? res.status(401).json({ error: "Admin authentication required." }) : null;
    }
  } catch (_) {
    return res && typeof res.status === "function" ? res.status(401).json({ error: "Admin authentication required." }) : null;
  }
  if (res && typeof res.status === "function") {
    const supabase = getSupabaseConfig();
    const neon = isNeonConfigured();
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({
      status: "ok",
      provider: supabase ? "supabase" : (neon ? "neon" : "local"),
      supabaseConfigured: Boolean(supabase),
      neonConfigured: Boolean(neon),
    });
  }
}

const LOCAL_PROMO_EMAILS_FILE = "/tmp/romeos-promo-emails-store.json";

function readLocalPromoEmailsFile() {
  try {
    if (fs.existsSync(LOCAL_PROMO_EMAILS_FILE)) {
      const data = JSON.parse(fs.readFileSync(LOCAL_PROMO_EMAILS_FILE, "utf8"));
      if (Array.isArray(data)) return data;
    }
  } catch (_) {}
  return [];
}

function writeLocalPromoEmailsFile(list) {
  try {
    fs.writeFileSync(LOCAL_PROMO_EMAILS_FILE, JSON.stringify(list.slice(0, 100), null, 2), { encoding: "utf8", mode: 0o600 });
  } catch (_) {}
}

async function savePromotionalEmail(entry = {}) {
  const record = {
    sender: String(entry.sender || "admin").slice(0, 40),
    subject: String(entry.subject || "").trim().slice(0, 160),
    body: String(entry.body || "").trim().slice(0, 5000),
    cta_text: entry.ctaText ? String(entry.ctaText).trim().slice(0, 60) : null,
    cta_url: entry.ctaUrl ? String(entry.ctaUrl).trim().slice(0, 300) : null,
    recipient_mode: String(entry.recipientMode || "ALL").slice(0, 30),
    recipient_count: Number(entry.recipientCount || 0),
    sent_count: Number(entry.sentCount || 0),
    failed_count: Number(entry.failedCount || 0),
    provider: String(entry.provider || "preview_log").slice(0, 40),
    recipients: Array.isArray(entry.recipients) ? entry.recipients.slice(0, 500) : [],
    created_at: new Date().toISOString(),
  };

  const local = readLocalPromoEmailsFile();
  local.unshift(record);
  writeLocalPromoEmailsFile(local);

  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`
        INSERT INTO promotional_emails (
          sender, subject, body, cta_text, cta_url, recipient_mode,
          recipient_count, sent_count, failed_count, provider, recipients, created_at
        ) VALUES (
          ${record.sender}, ${record.subject}, ${record.body}, ${record.cta_text}, ${record.cta_url},
          ${record.recipient_mode}, ${record.recipient_count}, ${record.sent_count}, ${record.failed_count},
          ${record.provider}, ${JSON.stringify(record.recipients)}::jsonb, ${record.created_at}
        )
        RETURNING *
      `;
      if (rows && rows[0]) Object.assign(record, rows[0]);
    } catch (err) {
      console.warn("[PromoEmails] Neon insert warning:", err.message);
    }
  }

  return { success: true, campaign: record };
}

async function getPromotionalEmails({ limit = 25 } = {}) {
  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`
        SELECT id, sender, subject, body, cta_text, cta_url, recipient_mode,
               recipient_count, sent_count, failed_count, provider, recipients, created_at
        FROM promotional_emails
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      if (Array.isArray(rows)) return rows;
    } catch (_) {}
  }
  return readLocalPromoEmailsFile().slice(0, limit);
}


const CONSOLE_ACCOUNTS_LOCAL_FILE = path.join(require("os").tmpdir(), "romeos-console-accounts.json");
let memoryConsoleAccounts = [];

function readLocalConsoleAccounts() {
  try {
    if (fs.existsSync(CONSOLE_ACCOUNTS_LOCAL_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONSOLE_ACCOUNTS_LOCAL_FILE, "utf8"));
      if (Array.isArray(parsed)) {
        memoryConsoleAccounts = parsed;
        return parsed;
      }
    }
  } catch (_) {}
  return memoryConsoleAccounts;
}

function writeLocalConsoleAccounts(list) {
  memoryConsoleAccounts = Array.isArray(list) ? list : [];
  try {
    fs.writeFileSync(CONSOLE_ACCOUNTS_LOCAL_FILE, JSON.stringify(memoryConsoleAccounts, null, 2), "utf8");
  } catch (_) {}
}

async function createConsoleAccount({ username, passwordHash, role, fullName = "", createdBy = "admin" }) {
  const cleanUser = String(username || "").trim();
  const cleanRole = String(role || "").trim().toLowerCase();
  const cleanName = String(fullName || "").trim();
  const cleanCreator = String(createdBy || "admin").trim();
  const nowIso = new Date().toISOString();

  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`
        INSERT INTO console_accounts (username, password_hash, role, full_name, created_by, is_active)
        VALUES (${cleanUser}, ${passwordHash}, ${cleanRole}, ${cleanName}, ${cleanCreator}, TRUE)
        RETURNING id, username, role, full_name, created_by, is_active, created_at
      `;
      if (rows && rows[0]) return { ok: true, account: rows[0], provider: "neon" };
    } catch (err) {
      if (err && (err.code === "23505" || String(err.message || "").toLowerCase().includes("duplicate"))) {
        return { ok: false, duplicate: true, error: "An account with this username already exists." };
      }
      console.warn("[DB] Neon createConsoleAccount failed, using fallback:", err.message);
    }
  }

  const list = readLocalConsoleAccounts();
  if (list.some((a) => String(a.username || "").toLowerCase() === cleanUser.toLowerCase())) {
    return { ok: false, duplicate: true, error: "An account with this username already exists." };
  }
  const rec = {
    id: Date.now(),
    username: cleanUser,
    password_hash: passwordHash,
    role: cleanRole,
    full_name: cleanName,
    created_by: cleanCreator,
    is_active: true,
    created_at: nowIso,
  };
  list.unshift(rec);
  writeLocalConsoleAccounts(list);
  return {
    ok: true,
    account: {
      id: rec.id,
      username: rec.username,
      role: rec.role,
      full_name: rec.full_name,
      created_by: rec.created_by,
      is_active: rec.is_active,
      created_at: rec.created_at,
    },
    provider: "local",
  };
}

async function findConsoleAccountByUsername(username) {
  const cleanUser = String(username || "").trim();
  if (!cleanUser) return null;
  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`
        SELECT id, username, password_hash, role, full_name, created_by, is_active, created_at
        FROM console_accounts
        WHERE LOWER(username) = LOWER(${cleanUser})
        LIMIT 1
      `;
      if (rows && rows[0]) return rows[0];
    } catch (err) {
      console.warn("[DB] Neon findConsoleAccountByUsername failed:", err.message);
    }
  }
  const list = readLocalConsoleAccounts();
  return list.find((a) => String(a.username || "").toLowerCase() === cleanUser.toLowerCase()) || null;
}

async function getConsoleAccounts() {
  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`
        SELECT id, username, role, full_name, created_by, is_active, created_at
        FROM console_accounts
        ORDER BY created_at DESC
        LIMIT 200
      `;
      if (Array.isArray(rows)) return rows;
    } catch (err) {
      console.warn("[DB] Neon getConsoleAccounts failed:", err.message);
    }
  }
  return readLocalConsoleAccounts().map((a) => ({
    id: a.id,
    username: a.username,
    role: a.role,
    full_name: a.full_name || "",
    created_by: a.created_by || "admin",
    is_active: a.is_active !== false,
    created_at: a.created_at,
  }));
}

async function setConsoleAccountActive(username, isActive) {
  const cleanUser = String(username || "").trim();
  const activeFlag = Boolean(isActive);
  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`
        UPDATE console_accounts
        SET is_active = ${activeFlag}
        WHERE LOWER(username) = LOWER(${cleanUser})
        RETURNING id, username, role, full_name, created_by, is_active, created_at
      `;
      if (rows && rows[0]) return { ok: true, account: rows[0] };
    } catch (err) {
      console.warn("[DB] Neon setConsoleAccountActive failed:", err.message);
    }
  }
  const list = readLocalConsoleAccounts();
  const item = list.find((a) => String(a.username || "").toLowerCase() === cleanUser.toLowerCase());
  if (!item) return { ok: false, error: "Account not found." };
  item.is_active = activeFlag;
  writeLocalConsoleAccounts(list);
  return {
    ok: true,
    account: {
      id: item.id,
      username: item.username,
      role: item.role,
      full_name: item.full_name || "",
      created_by: item.created_by || "admin",
      is_active: item.is_active,
      created_at: item.created_at,
    },
  };
}

async function deleteConsoleAccount(username) {
  const cleanUser = String(username || "").trim();
  if (isNeonConfigured()) {
    try {
      const sql = await ensureNeonSchema();
      const rows = await sql`
        DELETE FROM console_accounts
        WHERE LOWER(username) = LOWER(${cleanUser})
        RETURNING username
      `;
      if (rows && rows[0]) return { ok: true, deleted: rows[0].username };
    } catch (err) {
      console.warn("[DB] Neon deleteConsoleAccount failed:", err.message);
    }
  }
  const list = readLocalConsoleAccounts();
  const next = list.filter((a) => String(a.username || "").toLowerCase() !== cleanUser.toLowerCase());
  if (next.length === list.length) return { ok: false, error: "Account not found." };
  writeLocalConsoleAccounts(next);
  return { ok: true, deleted: cleanUser };
}

defaultHandler.insertOrder = insertOrder;
defaultHandler.getOrders = getOrders;
defaultHandler.allocatePin = allocatePin;
defaultHandler.findOrderForTracking = findOrderForTracking;
defaultHandler.updateOrderStatus = updateOrderStatus;
defaultHandler.deleteOrder = deleteOrder;
defaultHandler.saveLocalOrder = saveLocalOrder;
defaultHandler.getLocalOrders = getLocalOrders;
defaultHandler.findLocalOrder = findLocalOrder;
defaultHandler.updateLocalOrderStatus = updateLocalOrderStatus;
defaultHandler.deleteLocalOrder = deleteLocalOrder;
defaultHandler.findOrderById = findOrderById;
defaultHandler.saveRefundToken = saveRefundToken;
defaultHandler.getRefundTokens = getRefundTokens;
defaultHandler.findRefundToken = findRefundToken;
defaultHandler.findRefundByTracking = findRefundByTracking;
defaultHandler.findRefundsByPhone = findRefundsByPhone;
defaultHandler.claimRefundToken = claimRefundToken;
defaultHandler.deleteRefundToken = deleteRefundToken;
defaultHandler.deleteClaimedRefundTokens = deleteClaimedRefundTokens;
defaultHandler.createCustomerUser = createCustomerUser;
defaultHandler.findCustomerByUsername = findCustomerByUsername;
defaultHandler.updateCustomerProfile = updateCustomerProfile;
defaultHandler.getCustomerUsers = getCustomerUsers;
defaultHandler.deleteCustomerUser = deleteCustomerUser;
defaultHandler.saveCustomerMessage = saveCustomerMessage;
defaultHandler.getMessagesForCustomer = getMessagesForCustomer;
defaultHandler.getAllCustomerMessages = getAllCustomerMessages;
defaultHandler.savePromotionalEmail = savePromotionalEmail;
defaultHandler.getPromotionalEmails = getPromotionalEmails;
defaultHandler.getOrdersByCustomer = getOrdersByCustomer;
defaultHandler.recordVisitorHit = recordVisitorHit;
defaultHandler.getActiveVisitorCount = getActiveVisitorCount;
defaultHandler.insertFeedback = insertFeedback;
defaultHandler.getFeedback = getFeedback;
defaultHandler.deleteFeedback = deleteFeedback;
defaultHandler.ensureNeonSchema = ensureNeonSchema;
defaultHandler.isConfigured = isConfigured;
defaultHandler.phoneMatchVariants = phoneMatchVariants;
defaultHandler.createConsoleAccount = createConsoleAccount;
defaultHandler.findConsoleAccountByUsername = findConsoleAccountByUsername;
defaultHandler.getConsoleAccounts = getConsoleAccounts;
defaultHandler.setConsoleAccountActive = setConsoleAccountActive;
defaultHandler.deleteConsoleAccount = deleteConsoleAccount;
defaultHandler.ORDER_STATUSES = ORDER_STATUSES;
defaultHandler.CANCELLATION_WINDOW_MS = CANCELLATION_WINDOW_MS;

module.exports = defaultHandler;

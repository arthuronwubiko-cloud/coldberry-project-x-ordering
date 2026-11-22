"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const REPO_NAME = path.basename(ROOT_DIR);
const IS_CB = /coldberry/i.test(REPO_NAME);

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
  console.log(`\n=== Security Hardening Verification (${REPO_NAME}) ===`);
  const ordersHandler = require(path.join(ROOT_DIR, "api/orders.js"));
  const adminHandler = require(path.join(ROOT_DIR, "api/admin.js"));
  const authHandler = require(path.join(ROOT_DIR, "api/auth.js"));
  const dbHandler = require(path.join(ROOT_DIR, "api/db.js"));
  const pinHandler = require(path.join(ROOT_DIR, "api/pin-manager.js"));
  const ovHandler = require(path.join(ROOT_DIR, "api/overload-protection.js"));
  const { issueSessionToken } = adminHandler;

  const staffToken = issueSessionToken("StaffSec", "staff");
  const driverToken = issueSessionToken("DriverSec", "driver");

  await check("C-02: Unauthenticated loyalty balance returns 0/unauthed and blocks guest loyalty redemption (401)", async () => {
    const rBal = createMockRes();
    await ordersHandler({ method: "GET", query: { action: "loyalty_balance", phone: "08098765432" }, headers: {} }, rBal);
    assert.strictEqual(rBal.statusCode, 200);
    assert.strictEqual(rBal.body?.authenticated, false);
    assert.strictEqual(rBal.body?.points, 0);

    const rGuest = createMockRes();
    await ordersHandler({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        consent: true,
        customer: { name: "Guest", phone: "08098765432" },
        fulfilment: "Pickup",
        location: "Garki, Abuja",
        loyaltyRewardId: "shawarma_50",
        items: [{ name: "Chicken Wings (6 pcs)", quantity: 1 }],
      },
    }, rGuest);
    assert.strictEqual(rGuest.statusCode, 401);
    return `unauthedBal=0, guestRedeem=401`;
  });

  await check("C-05: Driver console HTML contains ZERO hardcoded credentials or demo helper", () => {
    for (const rel of ["driver.html", "driver-console/index.html"]) {
      const h = fs.readFileSync(path.join(ROOT_DIR, rel), "utf8");
      assert.ok(!h.includes("Rdr72Kp45Lw19Q"), `${rel} still has hardcoded driver password`);
      assert.ok(!h.includes("Quick Credential Helper"), `${rel} still has Quick Credential Helper`);
    }
    return `driver.html & driver-console clean`;
  });

  await check("C-07: Coldberry standalone console vercel.json routes to Coldberry origin (no cross-brand misrouting)", () => {
    if (!IS_CB) return "N/A (Romeo's repo)";
    for (const rel of ["admin-console/vercel.json", "driver-console/vercel.json"]) {
      const raw = fs.readFileSync(path.join(ROOT_DIR, rel), "utf8");
      assert.ok(!raw.includes("romeos-project-x-ordering"), `${rel} still misroutes to Romeo's`);
      assert.ok(raw.includes("coldberry-project-x-ordering"), `${rel} missing Coldberry destination`);
    }
    return `Coldberry console rewrites verified`;
  });

  await check("H-01: Raw X-Auth-* and Basic auth headers rejected on GET /api/admin (401)", async () => {
    const rX = createMockRes();
    await adminHandler({
      method: "GET",
      headers: { "x-auth-username": "RomeosAdmin890", "x-auth-password": process.env.ADMIN_PASSWORD || "Adm94Kx72Qp81Z" },
      query: {},
    }, rX);
    assert.strictEqual(rX.statusCode, 401);
    const basic = Buffer.from("RomeosAdmin890:Adm94Kx72Qp81Z").toString("base64");
    const rB = createMockRes();
    await adminHandler({ method: "GET", headers: { authorization: `Basic ${basic}` }, query: {} }, rB);
    assert.strictEqual(rB.statusCode, 401);
    return `X-Auth=401, Basic=401`;
  });

  await check("H-03: Staff and Driver roles blocked (403) from mutating paymentStatus", async () => {
    for (const tok of [staffToken, driverToken]) {
      const r = createMockRes();
      await adminHandler({
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${tok}` },
        body: { orderId: "ORD-TEST-1", paymentStatus: "paid" },
      }, r);
      assert.strictEqual(r.statusCode, 403);
    }
    return `staff=403, driver=403`;
  });

  await check("H-06 & H-09: track.html strips phone from feedback & admin.html fixes escapeHtml/vouchers tab", () => {
    const tr = fs.readFileSync(path.join(ROOT_DIR, "track.html"), "utf8");
    assert.ok(!tr.includes('phoneInput.value.trim() + ")"'), "track.html still embeds phone in customer_name");
    for (const rel of ["admin.html", "admin-console/index.html"]) {
      const adm = fs.readFileSync(path.join(ROOT_DIR, rel), "utf8");
      assert.ok(!adm.includes("escapeHtml("), `${rel} still calls undefined escapeHtml(`);
      assert.ok(adm.includes("tabBtnVouchers"), `${rel} missing tabBtnVouchers unhide`);
    }
    return `track.html & admin.html verified`;
  });

  await check("M-01 & M-02 & L-01: Internal telemetry requires admin auth (401), security headers present, malformed cookie safe", async () => {
    for (const fn of [dbHandler, pinHandler, ovHandler]) {
      const r = createMockRes();
      await fn({ method: "GET", headers: {}, query: {} }, r);
      assert.strictEqual(r.statusCode, 401);
    }
    const vj = fs.readFileSync(path.join(ROOT_DIR, "vercel.json"), "utf8");
    assert.ok(vj.includes("Strict-Transport-Security") && vj.includes("X-Frame-Options") && vj.includes("nosniff"));

    const rBadCookie = createMockRes();
    await authHandler({ method: "GET", headers: { cookie: "romeos_user_session=%E0%A4%A" }, query: {} }, rBadCookie);
    assert.strictEqual(rBadCookie.statusCode, 200);
    return `telemetry=401x3, headers=ok, malformedCookie=200`;
  });

  console.log(`\nSecurity Audit Summary (${REPO_NAME}): ${passed}/${passed + failed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
})();

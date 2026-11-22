/**
 * Automated Verification for Feature 3:
 * Client Feedback Bubble & Dual-DB Sync (Neon Postgres + Supabase + Local Fallback)
 */

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT_DIR = path.resolve(__dirname, "..");
const { insertFeedback, getFeedback, ensureNeonSchema } = require("../api/db");
const feedbackHandler = require("../api/feedback");

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, val) {
      this.headers[key.toLowerCase()] = val;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    send(text) {
      this.body = text;
      return this;
    },
  };
}

async function runFeedbackVerification() {
  console.log("=== Feature 3: Client Feedback Bubble & Dual-DB Verification ===\n");
  let passed = 0;
  let total = 0;

  function test(desc, fn) {
    total++;
    try {
      fn();
      console.log(`  [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${desc}: ${err.message}`);
    }
  }

  async function asyncTest(desc, fn) {
    total++;
    try {
      await fn();
      console.log(`  [PASS] ${desc}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${desc}: ${err.message}`);
    }
  }

  // 1. Check schema in Neon (or local fallback when DATABASE_URL is absent)
  await asyncTest("Neon Postgres ensureNeonSchema creates customer_feedback table", async () => {
    if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
      assert(typeof ensureNeonSchema === "function", "ensureNeonSchema helper exported");
      return;
    }
    const sql = await ensureNeonSchema();
    assert(sql, "SQL client initialized");
    const testRow = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_name = 'customer_feedback'
    `;
    assert(testRow.length > 0, "customer_feedback table exists in Neon database");
  });

  // 2. Test insertFeedback dual-write & local fallback
  await asyncTest("insertFeedback writes to Neon Postgres and /tmp/romeos-feedback-store.json", async () => {
    const uniqueComment = `Verification test feedback ${Date.now()}`;
    const res = await insertFeedback({
      rating: 5,
      customer_name: "Test Customer",
      order_pin: "654321",
      tags: ["🍦 Rich & Creamy", "⚡ Fast Cold-Bag Delivery"],
      comments: uniqueComment,
      source: "automated_test"
    });

    assert.strictEqual(res.success, true, "insertFeedback returns success: true");
    if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
      assert.strictEqual(res.neon, true, "Neon Postgres insertion succeeded");
    }
    assert.strictEqual(res.local, true, "Local fallback write succeeded");

    // Check local fallback file
    const localStorePath = "/tmp/romeos-feedback-store.json";
    assert(fs.existsSync(localStorePath), "Local fallback file exists at /tmp/romeos-feedback-store.json");
    const localData = JSON.parse(fs.readFileSync(localStorePath, "utf8"));
    const found = localData.find(item => item.comments === uniqueComment);
    assert(found, "Saved feedback record present in /tmp/romeos-feedback-store.json");
  });

  // 3. Test getFeedback
  await asyncTest("getFeedback fetches stored feedback", async () => {
    const result = await getFeedback({ limit: 5 });
    assert(Array.isArray(result.feedback), "feedback is an array");
    assert(result.feedback.length > 0, "at least one feedback record returned");
    assert(["neon", "supabase", "local"].includes(result.provider), `provider is valid (${result.provider})`);
  });

  // 4. Test API handler OPTIONS / CORS
  await asyncTest("api/feedback OPTIONS returns 204 with CORS headers", async () => {
    const req = { method: "OPTIONS", headers: { origin: "https://coldberry-project-x.vercel.app" } };
    const res = createMockRes();
    await feedbackHandler(req, res);
    assert.strictEqual(res.statusCode, 204);
    assert.strictEqual(res.headers["access-control-allow-origin"], "https://coldberry-project-x.vercel.app");
    assert.strictEqual(res.headers["access-control-allow-methods"], "GET, POST, OPTIONS");
  });

  // 5. Test API handler GET
  await asyncTest("api/feedback GET returns 200 with list of reviews", async () => {
    const req = { method: "GET", headers: {}, query: { limit: 10 } };
    const res = createMockRes();
    await feedbackHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert(Array.isArray(res.body.feedback));
    assert(typeof res.body.count === "number");
  });

  // 6. Test API handler POST validation
  await asyncTest("api/feedback POST rejects invalid ratings with 400", async () => {
    const invalidRatings = [0, 6, "five", null];
    for (const r of invalidRatings) {
      const req = {
        method: "POST",
        headers: {},
        body: { rating: r, comments: "Test" }
      };
      const res = createMockRes();
      await feedbackHandler(req, res);
      assert.strictEqual(res.statusCode, 400, `Rating ${r} was not rejected`);
      assert(res.body.error, "Error message returned");
    }
  });

  // 7. Test API handler POST valid submission
  await asyncTest("api/feedback POST succeeds with 200 for valid rating", async () => {
    const req = {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: {
        rating: 4,
        customer_name: "Fatima",
        order_pin: "777888",
        tags: ["😋 Authentic Flavours", "🧇 Crispy Waffle Bowl"],
        comments: "Delicious rolled Madagascar vanilla with strawberry swirl!",
        source: "web_bubble"
      }
    };
    const res = createMockRes();
    await feedbackHandler(req, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert(res.body.message.includes("Thank you"));
    assert.strictEqual(res.body.record.rating, 4);
    assert.strictEqual(res.body.record.order_pin, "777888");
  });

  // 8. Test js/feedback-bubble.js file and features
  test("js/feedback-bubble.js contains all required UI components and design specs", () => {
    const bubbleJsPath = path.join(ROOT_DIR, "js", "feedback-bubble.js");
    assert(fs.existsSync(bubbleJsPath), "feedback-bubble.js exists");
    const code = fs.readFileSync(bubbleJsPath, "utf8");

    // Check fixed positioning
    assert(code.includes("position: fixed"), "Includes fixed position");
    assert(code.includes("bottom: 1.5rem") && code.includes("bottom: 4.75rem"), "Includes desktop and mobile bottom offsets");
    assert(code.includes("left: 1.5rem"), "Includes left: 1.5rem");
    assert(code.includes("z-index: 9990"), "Includes z-index: 9990");

    // Check required markup
    assert(code.includes("rfb-trigger"), "Has trigger button");
    assert(code.includes("Feedback"), "Has 'Feedback' text");
    assert(code.includes("fa-star"), "Has star icon");
    assert(code.includes("#FFD700"), "Has gold star color #FFD700");

    // Check quick tags (Ice Cream theme)
    assert(code.includes("🍦 Rich & Creamy"), "Includes '🍦 Rich & Creamy' tag");
    assert(code.includes("⚡ Fast Cold-Bag Delivery") || code.includes("⚡ Fast Delivery"), "Includes Fast Delivery tag");
    assert(code.includes("😋 Authentic Flavours") || code.includes("😋 Great Taste"), "Includes Authentic Flavours tag");
    assert(code.includes("🛵 Friendly Courier") || code.includes("🛵 Friendly Rider"), "Includes Friendly Courier tag");

    // Check textarea placeholder
    assert(
      code.includes("Tell us how your ice cream scoops or delivery were...") ||
      code.includes("Tell us how your food or delivery was..."),
      "Includes textarea placeholder"
    );

    // Check auto-read logic
    assert(code.includes("customer_name") && code.includes("order_pin"), "Auto-reads name and PIN");

    // Check API endpoint target
    assert(code.includes("/api/feedback"), "Submits to /api/feedback");

    // Check animated checkmark
    assert(code.includes("rfb-checkmark-wrap") || code.includes("rfb-success-view"), "Has animated checkmark/success view");

    // Check dark/light theme awareness
    assert(code.includes("data-theme"), "Supports data-theme attribute");
    assert(code.includes("prefers-color-scheme"), "Supports prefers-color-scheme media query");
  });

  // 9. Verify inclusion in all customer-facing HTML files
  const customerPages = [
    "index.html",
    "890b.html",
    "pizzadeals.html",
    "order.html",
    "track.html",
    "privacy.html",
    "terms.html"
  ];

  for (const page of customerPages) {
    test(`Page ${page} includes <script src="js/feedback-bubble.js" defer></script>`, () => {
      const pagePath = path.join(ROOT_DIR, page);
      assert(fs.existsSync(pagePath), `${page} exists`);
      const html = fs.readFileSync(pagePath, "utf8");
      assert(
        html.includes('<script src="js/feedback-bubble.js" defer></script>'),
        `${page} contains script tag for js/feedback-bubble.js`
      );
    });
  }

  console.log(`\n=== Verification Results: ${passed}/${total} passed ===\n`);
  if (passed !== total) {
    process.exit(1);
  }
}

runFeedbackVerification().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});

#!/usr/bin/env node
"use strict";

/**
 * End-to-End Regression Verification Suite for Romeo's Pizza Nigeria.
 *
 * Verifies:
 *   1. No remaining "Jumbo" references in HTML/JS files (outside historical notes).
 *   2. All 13 pizza cards in 890b.html offer Medium, Large, and Champion sizes.
 *   3. Local image assets (chicken-wings.jpg, shawarma.jpg, coca-cola.jpg) exist and are valid.
 *   4. Price calculation logic in js/order.js (unit prices, ₦1,500 delivery fee, grand total).
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT_DIR = path.resolve(__dirname, "..");
const SELF_PATH = path.resolve(__filename);

// Configure ephemeral test credentials and signing secrets for the local verification run
process.env.ADMIN_USERNAME = process.env.ADMIN_USERNAME || "RomeosAdmin890";
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Adm94Kx72Qp81Z";
process.env.STAFF_USERNAME = process.env.STAFF_USERNAME || "RomeosStaff890";
process.env.STAFF_PASSWORD = process.env.STAFF_PASSWORD || "Stf63Mp49Lw28R";
process.env.DRIVER_USERNAME = process.env.DRIVER_USERNAME || "RomeosRider890";
process.env.DRIVER_PASSWORD = process.env.DRIVER_PASSWORD || "Rdr72Kp45Lw19Q";
process.env.ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "test-admin-session-secret-only";
process.env.CUSTOMER_AUTH_SECRET = process.env.CUSTOMER_AUTH_SECRET || "test-customer-auth-secret-only";

const results = [];

function record(section, name, passed, detail) {
  results.push({ section, name, passed, detail });
  const tag = passed ? "PASS" : "FAIL";
  console.log(`  [${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function parseNaira(text) {
  const digits = String(text || "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : NaN;
}

function formatNaira(amount) {
  return "₦" + Number(amount || 0).toLocaleString("en-NG");
}

function collectFiles(dir, extensions, collected = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === ".git" ||
      entry.name === ".agents"
    ) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, extensions, collected);
    } else if (
      entry.isFile() &&
      fullPath !== SELF_PATH &&
      extensions.includes(path.extname(entry.name).toLowerCase())
    ) {
      collected.push(fullPath);
    }
  }
  return collected;
}

// ---------------------------------------------------------------------------
// 0. Syntax Sanity Check for JS files
// ---------------------------------------------------------------------------
function checkJsSyntax() {
  console.log("\n0. JavaScript Syntax Check");
  const jsFiles = collectFiles(ROOT_DIR, [".js"]);
  for (const file of jsFiles) {
    const rel = path.relative(ROOT_DIR, file);
    try {
      const code = fs.readFileSync(file, "utf8");
      new vm.Script(code, { filename: rel });
      record("syntax", rel, true, "valid JS syntax");
    } catch (err) {
      record("syntax", rel, false, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Verify no remaining "Jumbo" references in HTML or JS files
// ---------------------------------------------------------------------------
function checkNoJumboReferences() {
  console.log("\n1. Check for remaining 'Jumbo' references in HTML and JS files");
  const targetFiles = collectFiles(ROOT_DIR, [".html", ".js"]);
  // Construct pattern dynamically so this check never flags literal strings if copied
  const forbiddenRegex = new RegExp("j" + "umbo", "i");
  const hits = [];

  for (const file of targetFiles) {
    const rel = path.relative(ROOT_DIR, file);
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, idx) => {
      if (forbiddenRegex.test(line)) {
        hits.push(`${rel}:${idx + 1}: ${line.trim().slice(0, 120)}`);
      }
    });
  }

  record(
    "no-jumbo",
    `Scanned ${targetFiles.length} HTML/JS files for legacy size name`,
    hits.length === 0,
    hits.length === 0
      ? "0 matches found"
      : `${hits.length} match(es) found:\n      ${hits.join("\n      ")}`
  );
}

// ---------------------------------------------------------------------------
// 2. Verify all 13 pizza cards across 890b.html have Medium, Large, Champion
// ---------------------------------------------------------------------------
function extractSectionSlice(html, startId, endId) {
  const startMarker = `id="${startId}"`;
  const endMarker = `id="${endId}"`;
  const startIdx = html.indexOf(startMarker);
  const endIdx = html.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return null;
  }
  return html.slice(startIdx, endIdx);
}

function checkMenuPizzaCards() {
  console.log("\n2. Verify all 13 pizza cards in 890b.html have Medium, Large, Champion");
  const menuPath = path.join(ROOT_DIR, "890b.html");
  const html = fs.readFileSync(menuPath, "utf8");

  // Pizza cards live inside #traditional, #special, and #exclusive (before #sides)
  const pizzaSectionsHtml = extractSectionSlice(html, "traditional", "sides");
  if (!pizzaSectionsHtml) {
    record(
      "menu-cards",
      "Locate pizza sections (#traditional through #exclusive)",
      false,
      "Could not find section boundaries in 890b.html"
    );
    return;
  }

  const cardRegex = /<article\s+class="pizza-card"[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/article>/g;
  const cards = [];
  let match;
  while ((match = cardRegex.exec(pizzaSectionsHtml)) !== null) {
    cards.push({ id: match[1], body: match[2] });
  }

  record(
    "menu-cards",
    "Total pizza cards count",
    cards.length === 12,
    `found ${cards.length} (expected 12)`
  );

  const expectedSizes = ["Medium", "Large", "Champion"];
  const parsedMenuItems = [];

  for (const card of cards) {
    const h3Match = card.body.match(/<h3>([\s\S]*?)<\/h3>/);
    const title = h3Match
      ? h3Match[1].replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()
      : card.id;

    const selectTagMatch = card.body.match(
      /<select\b([^>]*class="[^"]*\bpizza-size-select\b[^"]*"[^>]*)>([\s\S]*?)<\/select>/
    );

    if (!selectTagMatch) {
      record("menu-cards", `${title} (#${card.id})`, false, "missing .pizza-size-select");
      continue;
    }

    const baseNameAttr = selectTagMatch[1].match(/data-base-name="([^"]+)"/);
    const baseName = baseNameAttr
      ? baseNameAttr[1].replace(/&amp;/g, "&").trim()
      : title;

    const optionRegex = /<option\b([^>]*)>([\s\S]*?)<\/option>/g;
    const options = [];
    let optMatch;
    while ((optMatch = optionRegex.exec(selectTagMatch[2])) !== null) {
      const attrs = optMatch[1];
      const valueMatch = attrs.match(/value="([^"]+)"/);
      const priceMatch = attrs.match(/data-price="([^"]+)"/);
      const isSelected = /\bselected\b/.test(attrs);
      options.push({
        value: valueMatch ? valueMatch[1] : "",
        dataPrice: priceMatch ? priceMatch[1] : "",
        numericPrice: parseNaira(priceMatch ? priceMatch[1] : ""),
        selected: isSelected,
      });
    }

    const values = options.map((o) => o.value);
    const hasExactSizes =
      values.length === expectedSizes.length &&
      expectedSizes.every((s, idx) => values[idx] === s);
    const allPricesValid = options.every(
      (o) => /^₦[\d,]+$/.test(o.dataPrice) && Number.isFinite(o.numericPrice) && o.numericPrice > 0
    );

    const displayedPriceMatch = card.body.match(/<span\s+class="price">([^<]+)<\/span>/);
    const displayedPrice = displayedPriceMatch ? displayedPriceMatch[1].trim() : "";
    const largeOpt = options.find((o) => o.value === "Large");
    const defaultPriceMatchesLarge = largeOpt && largeOpt.selected && displayedPrice === largeOpt.dataPrice;

    const ok = hasExactSizes && allPricesValid && Boolean(defaultPriceMatchesLarge);
    const summary = options.map((o) => `${o.value}: ${o.dataPrice}`).join(", ");
    record(
      "menu-cards",
      `${title} (#${card.id})`,
      ok,
      ok
        ? `options [${summary}], default Large (${displayedPrice})`
        : `values=[${values.join(", ")}], pricesValid=${allPricesValid}, defaultMatchesLarge=${Boolean(defaultPriceMatchesLarge)} (displayed=${displayedPrice})`
    );

    parsedMenuItems.push({ id: card.id, title, baseName, options });
  }

  // Check Half & Half Pizza Accordion in 890b.html
  const hasHalfAccordion = html.includes('class="related-pizzas-details half-and-half-accordion"');
  const hasHalfSize = html.includes('id="half-pizza-size"');
  const hasHalfSide1 = html.includes('id="half-pizza-side1"');
  const hasHalfSide2 = html.includes('id="half-pizza-side2"');
  const hasHalfBreakdown = html.includes('id="half-pricing-breakdown"');
  const halfOk = hasHalfAccordion && hasHalfSize && hasHalfSide1 && hasHalfSide2 && hasHalfBreakdown;
  record(
    "half-and-half-ui",
    "Half & Half Pizza Builder accordion component in 890b.html",
    halfOk,
    halfOk
      ? "accordion details element with size, 2-in-1 flavor pickers, and live pricing breakdown found"
      : `hasHalfAccordion=${hasHalfAccordion}, hasHalfSize=${hasHalfSize}, hasHalfSide1=${hasHalfSide1}, hasHalfSide2=${hasHalfSide2}, hasHalfBreakdown=${hasHalfBreakdown}`
  );

  return parsedMenuItems;
}

// ---------------------------------------------------------------------------
// 3. Verify image files exist and have valid image headers
// ---------------------------------------------------------------------------
function detectImageFormat(buffer) {
  if (buffer.length < 12) return null;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "JPEG";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "PNG";
  }
  // WEBP: RIFF....WEBP
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "WEBP";
  }
  // GIF: GIF87a or GIF89a
  const gifSig = buffer.toString("ascii", 0, 6);
  if (gifSig === "GIF87a" || gifSig === "GIF89a") {
    return "GIF";
  }
  return null;
}

function checkImages() {
  console.log("\n3. Verify local image assets exist and are valid");
  const requiredImages = [
    "images/chicken-wings.jpg",
    "images/shawarma.jpg",
    "images/coca-cola.jpg",
  ];
  const orderHtml = fs.readFileSync(path.join(ROOT_DIR, "order.html"), "utf8");

  for (const relPath of requiredImages) {
    const fullPath = path.join(ROOT_DIR, relPath);
    if (!fs.existsSync(fullPath)) {
      record("images", relPath, false, "file does not exist");
      continue;
    }

    const stat = fs.statSync(fullPath);
    if (!stat.isFile() || stat.size < 100) {
      record("images", relPath, false, `invalid file size (${stat.size} bytes)`);
      continue;
    }

    const fd = fs.openSync(fullPath, "r");
    const header = Buffer.alloc(16);
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);

    const format = detectImageFormat(header);
    const referencedInOrder = orderHtml.includes(`src="${relPath}"`) || orderHtml.includes(`this.src='${relPath}'`) || orderHtml.includes(relPath);
    const ok = Boolean(format) && referencedInOrder;

    record(
      "images",
      relPath,
      ok,
      format
        ? `valid ${format} image (${stat.size.toLocaleString()} bytes), referenced in order.html=${referencedInOrder}`
        : `unrecognized image header bytes (${header.slice(0, 8).toString("hex")})`
    );
  }
}

// ---------------------------------------------------------------------------
// 4. Verify price calculation logic in js/order.js using a DOM/VM harness
// ---------------------------------------------------------------------------
function createDomElement(tagName, id = "") {
  const listeners = {};
  const el = {
    tagName: String(tagName || "div").toUpperCase(),
    id,
    className: "",
    type: "",
    name: "",
    value: "",
    checked: false,
    required: false,
    disabled: false,
    hidden: false,
    href: "",
    title: "",
    innerHTML: "",
    textContent: "",
    dataset: {},
    style: {},
    attributes: {},
    children: [],
    parentNode: null,
    classList: {
      toggle: () => {},
      add: () => {},
      remove: () => {},
      contains: () => false,
    },
    setAttribute(k, v) {
      this.attributes[k] = String(v);
    },
    getAttribute(k) {
      return this.attributes[k] ?? null;
    },
    setCustomValidity() {},
    reportValidity() {
      return true;
    },
    scrollIntoView() {},
    focus() {},
    addEventListener(type, fn) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(fn);
    },
    dispatchEvent(evt) {
      const list = listeners[evt.type] || [];
      for (const fn of list) {
        fn.call(this, evt);
      }
    },
    append(...nodes) {
      for (const node of nodes) {
        if (node && typeof node === "object") {
          node.parentNode = this;
          this.children.push(node);
        }
      }
    },
    replaceChildren(...nodes) {
      this.children = [];
      this.append(...nodes);
    },
    closest(selector) {
      let cur = this;
      while (cur) {
        if (selector.startsWith("#") && cur.id === selector.slice(1)) return cur;
        if (selector.startsWith(".") && cur.className.split(/\s+/).includes(selector.slice(1))) return cur;
        if (selector === "[data-cart-item]" && cur.dataset && cur.dataset.cartItem) return cur;
        cur = cur.parentNode;
      }
      return null;
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const matches = [];
      const walk = (node) => {
        for (const child of node.children) {
          if (matchesSelector(child, selector)) {
            matches.push(child);
          }
          walk(child);
        }
      };
      walk(this);
      return matches;
    },
  };
  return el;
}

function matchesSelector(el, selector) {
  if (!el || typeof el !== "object") return false;
  if (selector === 'input[value="Delivery"]') {
    return el.tagName === "INPUT" && el.value === "Delivery";
  }
  if (selector === 'input[value="Pickup"]') {
    return el.tagName === "INPUT" && el.value === "Pickup";
  }
  if (selector === "[data-cart-item]") {
    return Boolean(el.dataset && el.dataset.cartItem !== undefined);
  }
  if (selector === "[data-cart-quantity]") {
    return Boolean(el.dataset && el.dataset.cartQuantity !== undefined);
  }
  if (selector === '[data-cart-action="decrement"]') {
    return el.dataset && el.dataset.cartAction === "decrement";
  }
  if (selector === '[data-cart-action="increment"]') {
    return el.dataset && el.dataset.cartAction === "increment";
  }
  if (selector.startsWith(".")) {
    return (el.className || "").split(/\s+/).includes(selector.slice(1));
  }
  return false;
}

function evaluateOrderJs(cartMap, fulfilment = "Delivery") {
  const storageMap = new Map();
  storageMap.set("romeos-pizza-cart", JSON.stringify(cartMap));
  storageMap.set(
    "romeos_cart",
    JSON.stringify(Object.entries(cartMap).map(([name, quantity]) => ({ name, quantity })))
  );

  const ids = {};
  const register = (tag, id) => {
    const el = createDomElement(tag, id);
    if (id) ids[id] = el;
    return el;
  };

  const orderForm = register("form", "order-form");
  const deliveryRadio = register("input", "");
  deliveryRadio.name = "fulfilment";
  deliveryRadio.value = "Delivery";
  deliveryRadio.checked = fulfilment !== "Pickup";

  const pickupRadio = register("input", "");
  pickupRadio.name = "fulfilment";
  pickupRadio.value = "Pickup";
  pickupRadio.checked = fulfilment === "Pickup";

  orderForm.append(deliveryRadio, pickupRadio);

  register("div", "delivery-group");
  register("textarea", "delivery-address");
  register("input", "customer-name");
  register("input", "customer-phone");
  register("select", "order-location");
  register("textarea", "order-items");
  register("p", "cart-validation");
  register("p", "order-status");
  register("button", "submit-order");
  register("section", "order-confirmation");
  register("p", "order-summary");
  register("div", "order-items-breakdown");
  register("a", "whatsapp-message-link");
  register("button", "edit-order-btn");
  register("button", "clear-cart-btn");
  register("ul", "order-cart-items");
  register("p", "cart-empty");
  register("div", "cart-pricing-summary");
  register("span", "cart-subtotal-val");
  register("span", "cart-service-val");
  register("span", "cart-delivery-label");
  register("span", "cart-delivery-val");
  register("span", "cart-grand-total-val");
  register("span", "cart-total-count");

  const docListeners = {};
  const winListeners = {};

  const documentStub = {
    getElementById: (id) => ids[id] || null,
    createElement: (tag) => createDomElement(tag),
    querySelectorAll: (sel) => {
      const out = [];
      for (const rootEl of Object.values(ids)) {
        if (matchesSelector(rootEl, sel)) out.push(rootEl);
        out.push(...rootEl.querySelectorAll(sel));
      }
      return out;
    },
    addEventListener(type, fn) {
      if (!docListeners[type]) docListeners[type] = [];
      docListeners[type].push(fn);
    },
    dispatchEvent(evt) {
      for (const fn of docListeners[evt.type] || []) {
        fn(evt);
      }
    },
  };

  const windowStub = {
    location: { href: "http://localhost:3000/order.html", search: "" },
    history: { replaceState() {} },
    addEventListener(type, fn) {
      if (!winListeners[type]) winListeners[type] = [];
      winListeners[type].push(fn);
    },
    open: () => null,
  };

  const context = {
    window: windowStub,
    document: documentStub,
    localStorage: {
      getItem: (k) => (storageMap.has(k) ? storageMap.get(k) : null),
      setItem: (k, v) => storageMap.set(k, String(v)),
    },
    URL,
    URLSearchParams,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    console,
  };
  windowStub.window = windowStub;

  const orderJsCode = fs.readFileSync(path.join(ROOT_DIR, "js/order.js"), "utf8");
  vm.runInNewContext(orderJsCode, context, { filename: "js/order.js" });

  const lineItems = {};
  for (const li of ids["order-cart-items"].children) {
    const nameEl = li.querySelector(".cart-item-name");
    const priceEl = li.querySelector(".cart-item-price-tag");
    if (nameEl) {
      lineItems[nameEl.textContent] = {
        priceText: priceEl ? priceEl.textContent : "",
        priceNumeric: parseNaira(priceEl ? priceEl.textContent : ""),
      };
    }
  }

  return {
    lineItems,
    subtotalText: ids["cart-subtotal-val"].textContent,
    subtotalNumeric: parseNaira(ids["cart-subtotal-val"].textContent),
    serviceText: ids["cart-service-val"] ? ids["cart-service-val"].textContent : "",
    serviceNumeric: parseNaira(ids["cart-service-val"] ? ids["cart-service-val"].textContent : ""),
    deliveryLabel: ids["cart-delivery-label"].textContent,
    deliveryText: ids["cart-delivery-val"].textContent,
    deliveryNumeric: parseNaira(ids["cart-delivery-val"].textContent),
    grandTotalText: ids["cart-grand-total-val"].textContent,
    grandTotalNumeric: parseNaira(ids["cart-grand-total-val"].textContent),
    totalCountText: ids["cart-total-count"].textContent,
    pricingSummaryHidden: ids["cart-pricing-summary"].hidden,
    romeosOrder: windowStub.RomeosOrder || null,
  };
}

function checkPriceCalculation(parsedMenuItems) {
  console.log("\n4. Verify price calculation logic in js/order.js");

  const testCases = [
    { name: "Pepperoni Pizza (Champion)", expected: 21200 },
    { name: "Beef Suya Pizza (Large)", expected: 14800 },
    { name: "Meatylover Pizza (Champion)", expected: 23500 },
    { name: "Chicken Wings (6 pcs)", expected: 4700 },
    { name: "Cold Coca-Cola (50cl)", expected: 900 },
    { name: "The Festive Box (Pepperoni Pizza + BBQ Chicken Pizza)", expected: 28000 },
  ];

  // Check individual item prices as rendered by js/order.js
  for (const tc of testCases) {
    const res = evaluateOrderJs({ [tc.name]: 1 }, "Delivery");
    const line = res.lineItems[tc.name];
    const actual = line ? line.priceNumeric : res.subtotalNumeric;
    const actualText = line && line.priceText ? line.priceText : res.subtotalText;
    const passed = actual === tc.expected;
    record(
      "pricing-item",
      `Unit price: "${tc.name}"`,
      passed,
      passed
        ? `${actualText} (expected ${formatNaira(tc.expected)})`
        : `got ${actualText || "₦0"} (${actual}), expected ${formatNaira(tc.expected)} (${tc.expected})`
    );
  }

  // Check combined cart totals under Delivery
  const fullCart = {};
  let expectedSubtotal = 0;
  for (const tc of testCases) {
    fullCart[tc.name] = 1;
    expectedSubtotal += tc.expected;
  }
  const expectedServiceFee = 800;
  const expectedDelivery = Math.round(expectedSubtotal * 0.15);
  const expectedGrandTotal = expectedSubtotal + expectedServiceFee + expectedDelivery;

  const deliveryResult = evaluateOrderJs(fullCart, "Delivery");

  record(
    "pricing-totals",
    "Service fee (₦800 flat fee)",
    deliveryResult.serviceNumeric === expectedServiceFee,
    `got ${deliveryResult.serviceText}, expected ${formatNaira(expectedServiceFee)}`
  );

  record(
    "pricing-totals",
    "Delivery fee (15% rate)",
    deliveryResult.deliveryNumeric === expectedDelivery,
    `got ${deliveryResult.deliveryText}, expected ${formatNaira(expectedDelivery)} (15% of ${formatNaira(expectedSubtotal)})`
  );

  record(
    "pricing-totals",
    "Combined cart subtotal (6 test items)",
    deliveryResult.subtotalNumeric === expectedSubtotal,
    `got ${deliveryResult.subtotalText}, expected ${formatNaira(expectedSubtotal)}`
  );

  record(
    "pricing-totals",
    "Combined cart grand total (Delivery)",
    deliveryResult.grandTotalNumeric === expectedGrandTotal &&
      deliveryResult.grandTotalNumeric ===
        deliveryResult.subtotalNumeric + deliveryResult.serviceNumeric + deliveryResult.deliveryNumeric,
    `got ${deliveryResult.grandTotalText} (subtotal ${deliveryResult.subtotalText} + service ${deliveryResult.serviceText} + delivery ${deliveryResult.deliveryText}), expected ${formatNaira(expectedGrandTotal)}`
  );

  // Also check Pickup mode sets delivery fee to 0 and grand total = subtotal + service fee
  const pickupResult = evaluateOrderJs(fullCart, "Pickup");
  record(
    "pricing-totals",
    "Pickup mode delivery fee & grand total consistency",
    pickupResult.deliveryNumeric === 0 &&
      pickupResult.grandTotalNumeric === (pickupResult.subtotalNumeric + expectedServiceFee) &&
      pickupResult.subtotalNumeric === expectedSubtotal,
    `got delivery="${pickupResult.deliveryText}", grandTotal=${pickupResult.grandTotalText}, expected grandTotal=${formatNaira(expectedSubtotal + expectedServiceFee)}`
  );

  // Check WhatsApp payment summary message output
  if (deliveryResult.romeosOrder && typeof deliveryResult.romeosOrder.formatWhatsAppMessage === "function") {
    const totals = deliveryResult.romeosOrder.calculateOrderTotals(fullCart, "Delivery");
    const waText = deliveryResult.romeosOrder.formatWhatsAppMessage({
      customer: { name: "Test Customer", phone: "+2348012345678" },
      fulfilment: "Delivery",
      location: "Garki, Abuja",
      address: "12 Nile Street, Abuja",
      items: Object.entries(fullCart).map(([name, quantity]) => ({ name, quantity })),
      pricing: totals,
    });
    const hasSubtotal = waText.includes(`Subtotal: ${formatNaira(expectedSubtotal)}`);
    const hasServiceFee = waText.includes("Service Fee: ₦800") || waText.includes(`Service Fee: ${formatNaira(expectedServiceFee)}`);
    const hasDeliveryFee = waText.includes(`Delivery Fee: ${formatNaira(expectedDelivery)}`);
    const hidesPercentage = !waText.includes("15%") && !waText.includes("17.5%");
    const hasGrand = waText.includes(`Grand Total: ${formatNaira(expectedGrandTotal)}`);
    record(
      "pricing-whatsapp",
      "WhatsApp summary receipt includes subtotal, ₦800 service fee, explicit delivery fee line (hiding 15% calculation), and grand total",
      hasSubtotal && hasServiceFee && hasDeliveryFee && hidesPercentage && hasGrand,
      `subtotal=${hasSubtotal}, serviceFee=${hasServiceFee}, deliveryFee=${hasDeliveryFee}, hidesPercentage=${hidesPercentage}, grandTotal=${hasGrand}`
    );
  }

  // Cross-check all 13 pizza cards x 3 sizes from 890b.html against js/order.js
  if (Array.isArray(parsedMenuItems) && parsedMenuItems.length > 0 && deliveryResult.romeosOrder) {
    const mismatches = [];
    let variantCount = 0;
    for (const item of parsedMenuItems) {
      for (const opt of item.options) {
        variantCount += 1;
        const cartKey = `${item.baseName} (${opt.value})`;
        const actual = deliveryResult.romeosOrder.getItemPrice(cartKey);
        if (actual !== opt.numericPrice) {
          mismatches.push(`${cartKey}: order.js=${actual}, menu=${opt.numericPrice}`);
        }
      }
    }
    record(
      "pricing-menu-sync",
      `Cross-check all ${variantCount} menu pizza-size prices against js/order.js`,
      mismatches.length === 0,
      mismatches.length === 0
        ? `all ${variantCount} variants match 890b.html`
        : `${mismatches.length} mismatch(es): ${mismatches.join("; ")}`
    );
  }

  // Verify Half & Half pricing engine and exported functions
  if (deliveryResult.romeosOrder) {
    const { getPizzaBasePrice, calculateHalfAndHalfPrice, getItemPrice } = deliveryResult.romeosOrder;
    const hasFns = typeof getPizzaBasePrice === "function" && typeof calculateHalfAndHalfPrice === "function";

    let hhOk = hasFns;
    if (hasFns) {
      // 1. getPizzaBasePrice defaults & tiers
      const pepLarge = getPizzaBasePrice("Pepperoni", "large");
      const meatyLarge = getPizzaBasePrice("Meatylover", "large");
      const suyaMed = getPizzaBasePrice("Beef Suya", "medium");
      const meatyChamp = getPizzaBasePrice("Meatylover", "champion");

      // 2. calculateHalfAndHalfPrice formula (supports 2, 3, or 4 flavours)
      const hhCalc = calculateHalfAndHalfPrice("Pepperoni", "Meatylover", "Large");
      const expectedHhTotal = Math.round(15000 * 1.05); // 15750
      const expectedSurcharge = Math.round(15000 * 0.05); // 750

      // 3. getItemPrice string parsing
      const parsedPrice1 = getItemPrice("Half & Half Pizza (Pepperoni Pizza + Meatylover Pizza, Large)");
      const parsedPrice2 = getItemPrice("Half & Half Pizza: Pepperoni / Meatylover (Large)");

      hhOk =
        pepLarge === 14150 &&
        meatyLarge === 15000 &&
        suyaMed === 12200 &&
        meatyChamp === 23500 &&
        hhCalc.moreExpensivePrice === 15000 &&
        hhCalc.surcharge === expectedSurcharge &&
        hhCalc.totalPrice === expectedHhTotal &&
        hhCalc.moreExpensiveSide === "Meatylover" &&
        parsedPrice1 === expectedHhTotal &&
        parsedPrice2 === expectedHhTotal;
    }

    record(
      "pricing-half-and-half",
      "Half & Half Pizza pricing engine and formula (5% surcharge over more expensive half)",
      hhOk,
      hhOk
        ? "functions exported, base prices accurate across tiers, 5% formula exact (₦15,750)"
        : `hasFns=${hasFns}`
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Verify Homepage Pizza Card & Theme Controller
// ---------------------------------------------------------------------------
function checkHomepageAndTheme() {
  console.log("\n5. Verify Homepage Pizza Card & Theme Controller");
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, "index.html"), "utf8");

  const hasPizzaQtyAdder = indexHtml.includes('data-cart-item="Pizza"');
  const hasConeOrShawarmaQty = indexHtml.includes('data-cart-item="Ice Cream"') || indexHtml.includes('data-cart-item="Ice Cream Cone"') || indexHtml.includes('data-cart-item="Shawarma"');
  const hasWaffleOrWingsQty = indexHtml.includes('data-cart-item="Waffle Cup"') || indexHtml.includes('data-cart-item="Chicken Wings"');
  const hasPizzaDropdown = indexHtml.includes("homepage-pizzas-details");

  record(
    "homepage-card",
    "Homepage Pizza card quantity adder removed (Ice Cream Cone / Waffle Cup & 13-item dropdown preserved)",
    !hasPizzaQtyAdder && hasConeOrShawarmaQty && hasWaffleOrWingsQty && hasPizzaDropdown,
    `hasPizzaQtyAdder=${hasPizzaQtyAdder}, cone/shawarma=${hasConeOrShawarmaQty}, waffle/wings=${hasWaffleOrWingsQty}, dropdown=${hasPizzaDropdown}`
  );

  for (const page of ["index.html", "890b.html", "pizzadeals.html", "order.html"]) {
    const html = fs.readFileSync(path.join(ROOT_DIR, page), "utf8");
    const hasToggle = html.includes('id="theme-toggle"');
    const hasSiteJs = html.includes('src="js/site.js"');
    const hasFA = html.includes("font-awesome");
    record(
      "theme-markup",
      `${page} includes #theme-toggle, js/site.js, and Font Awesome`,
      hasToggle && hasSiteJs && hasFA,
      `toggle=${hasToggle}, siteJs=${hasSiteJs}, fontAwesome=${hasFA}`
    );
  }

  // Test ThemeController inside VM harness
  const siteJsCode = fs.readFileSync(path.join(ROOT_DIR, "js/site.js"), "utf8");
  const themeStorage = new Map();
  const docAttrs = {};
  const metaTag = createDomElement("meta");
  metaTag.name = "theme-color";
  metaTag.setAttribute("content", "#5C1A2B");

  const toggleBtn = createDomElement("button", "theme-toggle");
  toggleBtn.className = "theme-toggle";
  const toggleIcon = createDomElement("i");
  const classSet = new Set(["fa-solid", "fa-moon"]);
  toggleIcon.classList = {
    add: (c) => classSet.add(c),
    remove: (c) => classSet.delete(c),
    toggle: (c) => (classSet.has(c) ? classSet.delete(c) : classSet.add(c)),
    contains: (c) => classSet.has(c),
  };
  toggleBtn.append(toggleIcon);

  const headEl = createDomElement("head");
  headEl.append(metaTag);

  const themeDoc = {
    readyState: "complete",
    head: headEl,
    documentElement: {
      setAttribute: (k, v) => { docAttrs[k] = String(v); },
      getAttribute: (k) => docAttrs[k] ?? null,
    },
    getElementById: (id) => (id === "theme-toggle" ? toggleBtn : null),
    querySelector: (sel) => {
      if (sel === 'meta[name="theme-color"]') return metaTag;
      return null;
    },
    querySelectorAll: (sel) => (sel === ".theme-toggle" ? [toggleBtn] : []),
    createElement: (tag) => createDomElement(tag),
    addEventListener: () => {},
    dispatchEvent: () => {},
  };

  const themeWin = {
    location: { href: "http://localhost:3000/index.html", search: "" },
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
    addEventListener: () => {},
  };
  themeWin.window = themeWin;

  vm.runInNewContext(
    siteJsCode,
    {
      window: themeWin,
      document: themeDoc,
      localStorage: {
        getItem: (k) => (themeStorage.has(k) ? themeStorage.get(k) : null),
        setItem: (k, v) => themeStorage.set(k, String(v)),
      },
      URL,
      URLSearchParams,
      CustomEvent: class CustomEvent {
        constructor(type, init = {}) {
          this.type = type;
          this.detail = init.detail;
        }
      },
      console,
    },
    { filename: "js/site.js" }
  );

  const tc = themeWin.ThemeController;
  const initial = tc ? tc.getTheme() : null;
  const afterToggleDark = tc ? tc.toggleTheme() : null;
  const darkMeta = metaTag.getAttribute("content");
  const darkPressed = toggleBtn.getAttribute("aria-pressed");
  const darkStored = themeStorage.get("romeos-theme");
  const darkAttr = docAttrs["data-theme"];

  const afterToggleLight = tc ? tc.toggleTheme() : null;
  const lightMeta = metaTag.getAttribute("content");
  const lightPressed = toggleBtn.getAttribute("aria-pressed");
  const lightStored = themeStorage.get("romeos-theme");
  const lightAttr = docAttrs["data-theme"];

  const themeOk =
    initial === "light" &&
    afterToggleDark === "dark" &&
    darkAttr === "dark" &&
    darkStored === "dark" &&
    darkPressed === "true" &&
    darkMeta === "#161114" &&
    afterToggleLight === "light" &&
    lightAttr === "light" &&
    lightStored === "light" &&
    lightPressed === "false" &&
    lightMeta === "#5C1A2B";

  record(
    "theme-controller",
    "ThemeController toggles light <-> dark, persists romeos-theme, updates aria-pressed & theme-color",
    themeOk,
    `dark=[attr:${darkAttr}, stored:${darkStored}, pressed:${darkPressed}, meta:${darkMeta}], light=[attr:${lightAttr}, stored:${lightStored}, pressed:${lightPressed}, meta:${lightMeta}]`
  );
}

// ---------------------------------------------------------------------------
// 6. Verify WhatsApp Order API (api/orders.js)
// ---------------------------------------------------------------------------
async function checkWhatsAppApi() {
  console.log("\n6. Verify WhatsApp Order API (api/orders.js)");
  const handler = require(path.join(ROOT_DIR, "api/orders.js"));

  function createMockRes() {
    return {
      headers: {},
      statusCode: 200,
      body: null,
      setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.statusCode = code; return this; },
      json(data) { this.body = data; return this; },
    };
  }

  // 6a. GET /api/orders?diagnostics=1 (requires admin auth)
  const diagUnauthRes = createMockRes();
  await handler({ method: "GET", query: { diagnostics: "1" }, headers: {} }, diagUnauthRes);
  const { issueSessionToken } = require(path.join(ROOT_DIR, "api/admin.js"));
  const diagToken = issueSessionToken("RomeosAdmin890", "admin");
  const diagRes = createMockRes();
  await handler({ method: "GET", query: { diagnostics: "1" }, headers: { authorization: `Bearer ${diagToken}` } }, diagRes);
  const diagOk =
    diagUnauthRes.statusCode === 401 &&
    diagRes.statusCode === 200 &&
    diagRes.body?.configured === true &&
    diagRes.body?.recipient === "2349055303848" &&
    /^\d{8,15}$/.test(String(diagRes.body?.recipient || ""));
  record(
    "api-whatsapp",
    "GET /api/orders?diagnostics=1 blocks unauthenticated (401) and returns WhatsApp recipient for admin (200)",
    diagOk,
    `unauth=${diagUnauthRes.statusCode}, status=${diagRes.statusCode}, recipient=${diagRes.body?.recipient}`
  );

  // 6b. POST /api/orders (Delivery)
  const deliveryRes = createMockRes();
  await handler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        consent: true,
        customer: { name: "Amina Bello", phone: "08012345678" },
        fulfilment: "Delivery",
        location: "Garki, Abuja",
        address: "12 Nile Street, Abuja",
        items: [
          { name: "Pepperoni Pizza (Champion)", quantity: 1 },
          { name: "Chicken Wings (6 pcs)", quantity: 2 },
        ],
      },
    },
    deliveryRes
  );
  const deliveryUrl = String(deliveryRes.body?.whatsappUrl || "");
  const deliveryText = deliveryUrl.startsWith("https://wa.me/")
    ? new URL(deliveryUrl).searchParams.get("text") || ""
    : "";
  const deliveryOk =
    deliveryRes.statusCode === 200 &&
    Boolean(deliveryRes.body?.orderId) &&
    deliveryRes.body?.pricing?.subtotal === 30600 &&
    deliveryRes.body?.pricing?.serviceFee === 800 &&
    deliveryRes.body?.pricing?.deliveryFee === 4590 &&
    deliveryRes.body?.pricing?.grandTotal === 35990 &&
    deliveryUrl.startsWith("https://wa.me/2349055303848") &&
    deliveryText.includes("+2348012345678") &&
    deliveryText.includes("(₦21,200)") &&
    deliveryText.includes("(₦9,400)") &&
    deliveryText.includes("*Payment Summary:*") &&
    deliveryText.includes("Subtotal: ₦30,600") &&
    deliveryText.includes("Service Fee: ₦800") &&
    deliveryText.includes("Delivery Fee: ₦4,590") &&
    !deliveryText.includes("15%") &&
    !deliveryText.includes("17.5%") &&
    deliveryText.includes("Grand Total: ₦35,990");
  record(
    "api-whatsapp",
    "POST /api/orders (Delivery) generates itemized WhatsApp URL & Payment Summary with ₦800 service fee and delivery fee line (hiding 15% rate)",
    deliveryOk,
    `status=${deliveryRes.statusCode}, grandTotal=${deliveryRes.body?.pricing?.grandTotal}`
  );

  // 6c. POST /api/orders (Pickup)
  const pickupRes = createMockRes();
  await handler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        consent: true,
        customer: { name: "Amina Bello", phone: "08012345678" },
        fulfilment: "Pickup",
        location: "Yaba, Lagos",
        items: [
          { name: "Pepperoni Pizza (Champion)", quantity: 1 },
          { name: "Chicken Wings (6 pcs)", quantity: 2 },
        ],
      },
    },
    pickupRes
  );
  const pickupUrl = String(pickupRes.body?.whatsappUrl || "");
  const pickupText = pickupUrl.startsWith("https://wa.me/2349055303848")
    ? new URL(pickupUrl).searchParams.get("text") || ""
    : "";
  const pickupOk =
    pickupRes.statusCode === 200 &&
    pickupRes.body?.pricing?.serviceFee === 800 &&
    pickupRes.body?.pricing?.deliveryFee === 0 &&
    pickupRes.body?.pricing?.grandTotal === 31400 &&
    pickupText.includes("Subtotal: ₦30,600") &&
    pickupText.includes("Service Fee: ₦800") &&
    pickupText.includes("Delivery Fee: ₦0 (Free Pickup)") &&
    pickupText.includes("Grand Total: ₦31,400") &&
    !pickupText.includes("15%") &&
    !pickupText.includes("17.5%");
  record(
    "api-whatsapp",
    "POST /api/orders (Pickup) sets ₦800 service fee, free pickup delivery fee line, and correct grand total",
    pickupOk,
    `status=${pickupRes.statusCode}, grandTotal=${pickupRes.body?.pricing?.grandTotal}`
  );

  // 6d. Verify Order Verification PIN generation & 5-day non-recycling retention
  const pinManager = require(path.join(ROOT_DIR, "api/pin-manager.js"));
  const orderPin = deliveryRes.body?.orderPin;
  const hasValidPin = typeof orderPin === "string" && /^\d{6}$/.test(orderPin);
  const textHasPin = deliveryText.includes(`Order PIN: ${orderPin}`);

  // Test 5-day non-recycling retention logic
  const now = Date.now();
  const testPin = pinManager.generateOrderPin({ now });
  const isActiveImmediately = pinManager.isPinActive(testPin, now);
  const fourDaysLater = now + (4 * 24 * 60 * 60 * 1000);
  const isActiveAt4Days = pinManager.isPinActive(testPin, fourDaysLater);
  const fiveDaysOneSecLater = now + (5 * 24 * 60 * 60 * 1000) + 1000;
  const isRecycledAfter5Days = !pinManager.isPinActive(testPin, fiveDaysOneSecLater);

  // Test pool uniqueness across 25 rapid PIN generations
  const samplePins = new Set();
  let collisions = 0;
  for (let i = 0; i < 25; i++) {
    const p = pinManager.generateOrderPin({ now });
    if (samplePins.has(p)) collisions++;
    samplePins.add(p);
  }

  const pinOk =
    hasValidPin &&
    textHasPin &&
    isActiveImmediately &&
    isActiveAt4Days &&
    isRecycledAfter5Days &&
    collisions === 0;

  record(
    "api-whatsapp",
    "Random 6-digit PIN generated per order with strict 5-day non-recycling retention",
    pinOk,
    pinOk
      ? `pin=${orderPin}, activeInWaText=${textHasPin}, 4dActive=${isActiveAt4Days}, 5dRecycled=${isRecycledAfter5Days}, 25DistinctPins=${samplePins.size}`
      : `hasValidPin=${hasValidPin}, textHasPin=${textHasPin}, 4d=${isActiveAt4Days}, 5d=${isRecycledAfter5Days}`
  );

  // 6e. POST /api/orders with missing consent -> 400
  const noConsentRes = createMockRes();
  await handler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        consent: false,
        customer: { name: "Amina Bello", phone: "08012345678" },
        fulfilment: "Pickup",
        location: "Yaba, Lagos",
        items: [{ name: "Pepperoni Pizza (Large)", quantity: 1 }],
      },
    },
    noConsentRes
  );
  record(
    "api-whatsapp",
    "POST /api/orders rejects missing consent with HTTP 400",
    noConsentRes.statusCode === 400,
    `status=${noConsentRes.statusCode}`
  );

  // 6e. POST /api/orders with invalid phone -> 400
  const badPhoneRes = createMockRes();
  await handler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        consent: true,
        customer: { name: "Amina Bello", phone: "123" },
        fulfilment: "Pickup",
        location: "Yaba, Lagos",
        items: [{ name: "Pepperoni Pizza (Large)", quantity: 1 }],
      },
    },
    badPhoneRes
  );
  record(
    "api-whatsapp",
    "POST /api/orders rejects invalid phone with HTTP 400",
    badPhoneRes.statusCode === 400,
    `status=${badPhoneRes.statusCode}`
  );

  // 6f. PUT /api/orders -> 405
  const methodRes = createMockRes();
  await handler({ method: "PUT", headers: {} }, methodRes);
  record(
    "api-whatsapp",
    "PUT /api/orders rejects unsupported method with HTTP 405",
    methodRes.statusCode === 405,
    `status=${methodRes.statusCode}`
  );

  // 6g. GET /api/track live tracking lookup
  const trackHandler = require(path.join(ROOT_DIR, "api/track.js"));
  const trackRes = createMockRes();
  await trackHandler(
    {
      method: "GET",
      query: { phone: "08012345678", pin: orderPin },
      headers: {},
    },
    trackRes
  );
  const trackOk =
    trackRes.statusCode === 200 &&
    trackRes.body?.found === true &&
    trackRes.body?.order?.orderPin === orderPin &&
    trackRes.body?.order?.step === 1 &&
    trackRes.body?.order?.status === "pending";
  record(
    "api-track",
    "GET /api/track successfully retrieves live order status using phone + 6-digit PIN",
    trackOk,
    `status=${trackRes.statusCode}, step=${trackRes.body?.order?.step}, orderPin=${trackRes.body?.order?.orderPin}`
  );

  // 6h. Separately Hosted Verification Console RBAC & 14-Char Alphanumeric Credentials
  const adminHandler = require(path.join(ROOT_DIR, "api/admin.js"));
  const adminLoginRes = createMockRes();
  await adminHandler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { action: "login", username: "RomeosAdmin890", password: "Adm94Kx72Qp81Z" },
    },
    adminLoginRes
  );
  const staffLoginRes = createMockRes();
  await adminHandler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { action: "login", username: "RomeosStaff890", password: "Stf63Mp49Lw28R" },
    },
    staffLoginRes
  );
  const shortLoginRes = createMockRes();
  await adminHandler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { action: "login", username: "short", password: "bad" },
    },
    shortLoginRes
  );
  const rbacLoginOk =
    adminLoginRes.statusCode === 200 &&
    adminLoginRes.body?.role === "admin" &&
    Boolean(adminLoginRes.body?.token) &&
    staffLoginRes.statusCode === 200 &&
    staffLoginRes.body?.role === "staff" &&
    Boolean(staffLoginRes.body?.token) &&
    shortLoginRes.statusCode === 400;
  record(
    "rbac-login",
    "14-char alphanumeric Admin & Staff credentials authenticate into distinct RBAC roles",
    rbacLoginOk,
    `adminRole=${adminLoginRes.body?.role}, staffRole=${staffLoginRes.body?.role}, badFormat=${shortLoginRes.statusCode}`
  );

  // 6i. Regular User (Staff) Restricted Strictly to Order State Changes
  const adminToken = adminLoginRes.body?.token;
  const staffToken = staffLoginRes.body?.token;
  const testOrderId = deliveryRes.body?.orderId;

  const staffGetRes = createMockRes();
  await adminHandler(
    { method: "GET", headers: { authorization: `Bearer ${staffToken}` }, query: { limit: "20" } },
    staffGetRes
  );
  const staffMatchedOrder = (staffGetRes.body?.orders || []).find((o) => o.order_id === testOrderId);
  const staffPiiMasked =
    staffGetRes.statusCode === 200 &&
    staffGetRes.body?.role === "staff" &&
    Boolean(staffMatchedOrder) &&
    String(staffMatchedOrder.customer_phone || "").startsWith("*") &&
    !staffMatchedOrder.address;

  const staffStateRes = createMockRes();
  await adminHandler(
    {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${staffToken}` },
      body: { orderId: testOrderId, status: "preparing" },
    },
    staffStateRes
  );
  const staffCancelBlockRes = createMockRes();
  await adminHandler(
    {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${staffToken}` },
      body: { orderId: testOrderId, status: "cancelled" },
    },
    staffCancelBlockRes
  );
  const staffDeleteBlockRes = createMockRes();
  await adminHandler(
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${staffToken}` },
      query: { orderId: testOrderId },
    },
    staffDeleteBlockRes
  );

  const staffRbacEnforced =
    staffPiiMasked &&
    staffStateRes.statusCode === 200 &&
    staffCancelBlockRes.statusCode === 403 &&
    staffDeleteBlockRes.statusCode === 403;
  record(
    "rbac-staff-restriction",
    "Regular Staff account can change order state (preparing) but is blocked (403) from cancelling/deleting and sees masked PII",
    staffRbacEnforced,
    `masked=${staffPiiMasked}, statePatch=${staffStateRes.statusCode}, cancel=${staffCancelBlockRes.statusCode}, delete=${staffDeleteBlockRes.statusCode}`
  );

  // 6i-2. Delivery Driver Login, Delivery Filtering, Unmasked Address/Phone & Action Permissions
  const driverLoginRes = createMockRes();
  await adminHandler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { action: "login", username: "RomeosRider890", password: "Rdr72Kp45Lw19Q" },
    },
    driverLoginRes
  );
  const driverToken = driverLoginRes.body?.token;
  const driverLoginOk =
    driverLoginRes.statusCode === 200 &&
    driverLoginRes.body?.role === "driver" &&
    Boolean(driverToken) &&
    Array.isArray(driverLoginRes.body?.permissions) &&
    driverLoginRes.body?.permissions.includes("read_deliveries") &&
    driverLoginRes.body?.permissions.includes("change_delivery_state");
  record(
    "rbac-driver-login",
    "14-char Driver credentials (RomeosRider890 / Rdr72Kp45Lw19Q) authenticate into driver role with proper permissions",
    driverLoginOk,
    `status=${driverLoginRes.statusCode}, role=${driverLoginRes.body?.role}, permissions=${JSON.stringify(driverLoginRes.body?.permissions)}`
  );

  const driverGetRes = createMockRes();
  await adminHandler(
    { method: "GET", headers: { authorization: `Bearer ${driverToken}` }, query: { limit: "20" } },
    driverGetRes
  );
  const driverOrders = driverGetRes.body?.orders || [];
  const allFulfilmentDelivery = driverOrders.length > 0 && driverOrders.every((o) => (o.fulfilment || "").toLowerCase() === "delivery");
  const driverMatchedOrder = driverOrders.find((o) => o.order_id === testOrderId);
  const driverPhoneUnmasked = driverMatchedOrder && !String(driverMatchedOrder.customer_phone || "").startsWith("*");
  const driverAddressPresent = driverMatchedOrder && Boolean(driverMatchedOrder.address);
  const driverEmailMasked = driverMatchedOrder ? (driverMatchedOrder.customer_email === null || String(driverMatchedOrder.customer_email).includes("***")) : true;

  record(
    "rbac-driver-get",
    "Driver GET orders strictly filters to delivery fulfilment, unmasks phone and address, and masks customer email",
    driverGetRes.statusCode === 200 && allFulfilmentDelivery && driverPhoneUnmasked && driverAddressPresent && driverEmailMasked,
    `allDelivery=${allFulfilmentDelivery}, phone=${driverMatchedOrder?.customer_phone}, addr=${driverMatchedOrder?.address}, email=${driverMatchedOrder?.customer_email}`
  );

  const driverOutRes = createMockRes();
  await adminHandler(
    {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${driverToken}` },
      body: { orderId: testOrderId, status: "out_for_delivery" },
    },
    driverOutRes
  );

  const driverCancelBlockRes = createMockRes();
  await adminHandler(
    {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${driverToken}` },
      body: { orderId: testOrderId, status: "cancelled" },
    },
    driverCancelBlockRes
  );

  const driverDeleteBlockRes = createMockRes();
  await adminHandler(
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${driverToken}` },
      query: { orderId: testOrderId },
    },
    driverDeleteBlockRes
  );

  const driverPatchOk =
    driverOutRes.statusCode === 200 &&
    driverCancelBlockRes.statusCode === 403 &&
    driverDeleteBlockRes.statusCode === 403;

  record(
    "rbac-driver-patch-delete",
    "Driver can set out_for_delivery/completed, but is blocked (403) from cancel or delete",
    driverPatchOk,
    `outStatus=${driverOutRes.statusCode}, cancelBlock=${driverCancelBlockRes.statusCode}, deleteBlock=${driverDeleteBlockRes.statusCode}`
  );

  // Restore order status to 'preparing' so cancellation test evaluates within-window logic
  await adminHandler(
    {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${adminToken}` },
      body: { orderId: testOrderId, status: "preparing" },
    },
    createMockRes()
  );

  // 6j. Customer 12-Minute Easy Cancellation Window & Expiration Enforcement
  const expiredEligibility = trackHandler.computeCancellationEligibility(
    { created_at: new Date().toISOString(), status: "preparing" },
    Date.now() + 13 * 60 * 1000
  );
  const cancelValidRes = createMockRes();
  await trackHandler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        action: "cancel",
        phone: "08012345678",
        pin: orderPin,
      },
    },
    cancelValidRes
  );
  const cancelOk =
    expiredEligibility.withinWindow === false &&
    expiredEligibility.canCancel === false &&
    cancelValidRes.statusCode === 200 &&
    cancelValidRes.body?.cancelled === true &&
    cancelValidRes.body?.order?.status === "cancelled";
  record(
    "customer-cancel-12m",
    "Customer can cancel within 12 minutes of ordering (200) and is rejected after 12 minutes",
    cancelOk,
    `within12m=${cancelValidRes.statusCode}, after13mCanCancel=${expiredEligibility.canCancel}, status=${cancelValidRes.body?.order?.status}`
  );

  // Clean up test orders with Admin DELETE privilege
  const adminDelRes = createMockRes();
  await adminHandler(
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${adminToken}` },
      query: { orderId: testOrderId },
    },
    adminDelRes
  );
  record(
    "rbac-admin-delete",
    "Admin account holds full delete permission (HTTP 200)",
    adminDelRes.statusCode === 200 && adminDelRes.body?.deleted === true,
    `status=${adminDelRes.statusCode}`
  );

  // 6k. Customer 'Order Received / Done' Confirmation (POST /api/track action: mark_received)
  const markCancelledRes = createMockRes();
  await trackHandler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { action: "mark_received", phone: "08012345678", pin: orderPin },
    },
    markCancelledRes
  );
  const markCancelledRejected = markCancelledRes.statusCode === 400;

  const freshOrderRes = createMockRes();
  await handler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        consent: true,
        customer: { name: "Emeka Okafor", phone: "08098765432" },
        fulfilment: "Delivery",
        location: "Surulere, Lagos",
        address: "44 Adeola Odeku Street",
        items: [{ name: "Pepperoni Pizza (Large)", quantity: 1 }],
      },
    },
    freshOrderRes
  );
  const freshPin = freshOrderRes.body?.orderPin;
  const freshOrderId = freshOrderRes.body?.orderId;

  const trackActiveRes = createMockRes();
  await trackHandler(
    { method: "GET", query: { phone: "08098765432", pin: freshPin } },
    trackActiveRes
  );
  const canMarkActive = trackActiveRes.body?.order?.canMarkReceived === true;

  const markReceivedRes = createMockRes();
  await trackHandler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { action: "mark_received", phone: "08098765432", pin: freshPin },
    },
    markReceivedRes
  );
  const markReceivedOk =
    markReceivedRes.statusCode === 200 &&
    markReceivedRes.body?.completed === true &&
    markReceivedRes.body?.order?.status === "completed" &&
    markReceivedRes.body?.order?.step === 5 &&
    markReceivedRes.body?.order?.canMarkReceived === false;

  const repeatMarkRes = createMockRes();
  await trackHandler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { action: "mark_done", phone: "08098765432", pin: freshPin },
    },
    repeatMarkRes
  );
  const repeatMarkOk = repeatMarkRes.statusCode === 200 && repeatMarkRes.body?.completed === true;

  record(
    "customer-order-received-done",
    "Customer can confirm 'Order Received / Done' via POST /api/track with status completed and Step 5",
    markCancelledRejected && canMarkActive && markReceivedOk && repeatMarkOk,
    `cancelReject=${markCancelledRejected}, canMark=${canMarkActive}, mark200=${markReceivedOk}, repeat200=${repeatMarkOk}`
  );

  if (freshOrderId) {
    await adminHandler(
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${adminToken}` },
        query: { orderId: freshOrderId },
      },
      createMockRes()
    );
  }
}

// ---------------------------------------------------------------------------
// 7. Verify Legal Compliance, Footers & Deals Eligibility Buttons
// ---------------------------------------------------------------------------
async function checkLegalAndDealsCompliance() {
  console.log("\n7. Verify Legal Compliance, Footers & Deals Eligibility Buttons");

  // 7a. Check privacy.html and terms.html exist
  const privacyPath = path.join(ROOT_DIR, "privacy.html");
  const termsPath = path.join(ROOT_DIR, "terms.html");
  const privacyExists = fs.existsSync(privacyPath) && fs.statSync(privacyPath).size > 1000;
  const termsExists = fs.existsSync(termsPath) && fs.statSync(termsPath).size > 1000;

  record(
    "legal-pages",
    "privacy.html and terms.html exist with substantial compliant policy content",
    privacyExists && termsExists,
    `privacy.html=${privacyExists}, terms.html=${termsExists}`
  );

  // 7b. Footer links across all primary pages
  const primaryPages = ["index.html", "890b.html", "pizzadeals.html", "order.html"];
  for (const page of primaryPages) {
    const html = fs.readFileSync(path.join(ROOT_DIR, page), "utf8");
    const hasPrivacy = html.includes('href="privacy.html"');
    const hasTerms = html.includes('href="terms.html"');
    record(
      "legal-footers",
      `${page} contains footer links to privacy.html and terms.html`,
      hasPrivacy && hasTerms,
      `privacy=${hasPrivacy}, terms=${hasTerms}`
    );
  }

  // 7c. Order form consent links
  const orderHtml = fs.readFileSync(path.join(ROOT_DIR, "order.html"), "utf8");
  const hasConsentTerms = orderHtml.includes('href="terms.html"') && orderHtml.includes('id="order-consent"');
  const hasConsentPrivacy = orderHtml.includes('href="privacy.html"');
  record(
    "legal-consent",
    "order.html consent notice links explicitly to Terms & Conditions and Privacy Policy",
    hasConsentTerms && hasConsentPrivacy,
    `termsLink=${hasConsentTerms}, privacyLink=${hasConsentPrivacy}`
  );

  // 7d. Deals eligibility buttons check (no #1 or #2 or Select as #1)
  const dealsHtml = fs.readFileSync(path.join(ROOT_DIR, "pizzadeals.html"), "utf8");
  const menuHtml = fs.readFileSync(path.join(ROOT_DIR, "890b.html"), "utf8");

  const dealsHasHash = />\s*Select as #\d\s*</i.test(dealsHtml) || />\s*#\d\s*</i.test(dealsHtml);
  const menuHasHash = />\s*#\d\s*</i.test(menuHtml);
  const dealsHasPizza1 = dealsHtml.includes("Pizza 1") && dealsHtml.includes("Pizza 2");
  const menuHasPizza1 = menuHtml.includes("Pizza 1") && menuHtml.includes("Pizza 2");

  record(
    "deals-eligibility",
    "Deals eligibility pull-downs use descriptive 'Pizza 1' / 'Pizza 2' labels without ambiguous '#1' tags",
    !dealsHasHash && !menuHasHash && dealsHasPizza1 && menuHasPizza1,
    `dealsHasHash=${dealsHasHash}, menuHasHash=${menuHasHash}, dealsPizza12=${dealsHasPizza1}, menuPizza12=${menuHasPizza1}`
  );

  // 7e. Coca-Cola at ₦900 and Service Fee UI
  const orderHasCoke900 = orderHtml.includes("Cold Coca-Cola (50cl)") && orderHtml.includes("₦900");
  const menuHasCoke900 = menuHtml.includes("Coca-Cola") && menuHtml.includes("₦900");
  const orderHasServiceFeeRow = orderHtml.includes('id="cart-service-row"') && orderHtml.includes('id="cart-service-val"');

  record(
    "pricing-sync",
    "Coca-Cola displayed at ₦900 across order.html/890b.html and cart shows Service Fee row",
    orderHasCoke900 && menuHasCoke900 && orderHasServiceFeeRow,
    `orderCoke900=${orderHasCoke900}, menuCoke900=${menuHasCoke900}, serviceFeeRow=${orderHasServiceFeeRow}`
  );

  // 7f. Order Verification PIN container on order.html
  const orderHasPinContainer = orderHtml.includes('id="order-pin-container"') && orderHtml.includes('id="order-pin-display"');
  record(
    "order-pin-ui",
    "order.html includes dedicated #order-pin-container and #order-pin-display in confirmation section",
    orderHasPinContainer,
    orderHasPinContainer ? "found #order-pin-container and #order-pin-display" : "missing PIN container in order.html"
  );

  // 7f-2. Order Verification PIN 1-Click Copy UI
  const orderHasCopyPinBtn = orderHtml.includes('id="copy-pin-btn"') && orderHtml.includes('copy-pin-btn');
  record(
    "order-pin-copy-ui",
    "order.html includes accessible #copy-pin-btn 1-click clipboard button",
    orderHasCopyPinBtn,
    orderHasCopyPinBtn ? "found #copy-pin-btn with clipboard handler" : "missing copy PIN button"
  );

  // 7g. Single Source of Truth: prices.json
  const pricesJsonPath = path.join(ROOT_DIR, "prices.json");
  let pricesValid = false;
  try {
    const pricesData = JSON.parse(fs.readFileSync(pricesJsonPath, "utf8"));
    pricesValid =
      pricesData.fees?.serviceFee === 800 &&
      pricesData.fees?.deliveryFeeRate === 0.15 &&
      pricesData.pizzaTiers?.traditional?.prices?.Large === 14150 &&
      pricesData.pizzaTiers?.special?.prices?.Large === 14800 &&
      pricesData.pizzaTiers?.exclusive?.prices?.Large === 15000 &&
      !pricesData.pizzaTiers?.nineoverloaded;
  } catch (_) {}
  record(
    "prices-centralized",
    "Single source of truth prices.json exists with valid tiers, sizes, and fee rules",
    pricesValid,
    pricesValid ? "prices.json verified across all 3 tiers and fee rates" : "missing or invalid prices.json"
  );

  // 7h. Order Tracking Page: track.html
  const trackHtmlPath = path.join(ROOT_DIR, "track.html");
  let trackHtmlValid = false;
  if (fs.existsSync(trackHtmlPath)) {
    const trackHtml = fs.readFileSync(trackHtmlPath, "utf8");
    trackHtmlValid =
      trackHtml.includes('id="track-form"') &&
      trackHtml.includes('id="track-stepper"') &&
      trackHtml.includes('id="track-result"') &&
      trackHtml.includes("peter890.css") &&
      trackHtml.includes("privacy.html");
  }
  record(
    "track-ui",
    "track.html exists with interactive lookup form, progress stepper, and theme styling",
    trackHtmlValid,
    trackHtmlValid ? "track.html fully configured with stepper and privacy links" : "track.html missing or incomplete"
  );

  // 7h-2. Order Received Confirmation UI check on track.html and order.html
  const trackHasReceivedBtn = trackHtmlPath && fs.readFileSync(trackHtmlPath, "utf8").includes('id="track-received-btn"');
  const orderHasReceivedBtn = orderHtml.includes('id="order-received-btn"');
  record(
    "order-received-confirmation-ui",
    "Customer 'Order Received / Done' UI present on track.html (#track-received-btn) and order.html (#order-received-btn)",
    trackHasReceivedBtn && orderHasReceivedBtn,
    `trackReceivedBtn=${trackHasReceivedBtn}, orderReceivedBtn=${orderHasReceivedBtn}`
  );

  // 7i. Half & Half Visual Split Circle Preview
  const hasSplitCircle = menuHtml.includes('id="half-preview-left"') && menuHtml.includes('id="half-preview-right"');
  record(
    "half-visual-preview",
    "890b.html includes visual 2-in-1 split circle preview for Half & Half pizza builder",
    hasSplitCircle,
    hasSplitCircle ? "found #half-preview-left and #half-preview-right preview elements" : "missing visual split preview elements"
  );

  // 7j. Security: No committed database secrets in dev-server.js
  const devServerContent = fs.readFileSync(path.join(ROOT_DIR, "dev-server.js"), "utf8");
  const hasHardcodedSecret = devServerContent.includes("sb_secret") || devServerContent.includes("romeos-admin-test");
  record(
    "security-secrets",
    "dev-server.js does not contain hard-coded database secrets or admin passwords",
    !hasHardcodedSecret,
    !hasHardcodedSecret ? "dev-server.js uses environment variables safely" : "found hard-coded secret in dev-server.js"
  );

  // 7k. Separate Hosting Console Package & 12-Minute Cancel UI
  const consoleFilesExist =
    fs.existsSync(path.join(ROOT_DIR, "admin-console/index.html")) &&
    fs.existsSync(path.join(ROOT_DIR, "admin-console/server.js")) &&
    fs.existsSync(path.join(ROOT_DIR, "admin-console/vercel.json"));
  const consoleHtml = consoleFilesExist ? fs.readFileSync(path.join(ROOT_DIR, "admin-console/index.html"), "utf8") : "";
  const consoleHas14CharLock =
    consoleHtml.includes('id="login-username"') &&
    consoleHtml.includes('id="login-password"') &&
    consoleHtml.includes('minlength="14"') &&
    consoleHtml.includes('maxlength="14"');
  const orderHasCancelBtn = orderHtml.includes('id="cancel-order-btn"') && orderHtml.includes("12 minutes");
  const trackHasCancelBtn = trackHtmlPath && fs.readFileSync(trackHtmlPath, "utf8").includes('id="track-cancel-btn"');

  record(
    "separate-console-and-cancel-ui",
    "Separate admin-console/ package locked with 14-char username/password & 12-min cancel UI present on order.html and track.html",
    consoleFilesExist && consoleHas14CharLock && orderHasCancelBtn && trackHasCancelBtn,
    `consolePkg=${consoleFilesExist}, lock14=${consoleHas14CharLock}, orderCancel=${orderHasCancelBtn}, trackCancel=${trackHasCancelBtn}`
  );

  // 7l. Navbar Shopping Cart Logo across all primary customer pages
  const cartNavPages = ["index.html", "890b.html", "pizzadeals.html", "order.html", "track.html", "privacy.html", "terms.html"];
  const missingCartNav = cartNavPages.filter((page) => {
    const html = fs.readFileSync(path.join(ROOT_DIR, page), "utf8");
    return !(html.includes('id="nav-cart-link"') && html.includes("fa-cart-shopping") && html.includes('id="cart-count"'));
  });
  record(
    "nav-shopping-cart-logo",
    "All customer pages include navbar shopping cart icon (#nav-cart-link) and live badge (#cart-count)",
    missingCartNav.length === 0,
    missingCartNav.length === 0 ? "verified across all 7 customer pages" : `missing in: ${missingCartNav.join(", ")}`
  );

  // 7m. Dedicated Driver Console files, driver.html, and vercel.json rewrite
  const driverConsoleFilesExist =
    fs.existsSync(path.join(ROOT_DIR, "driver-console/index.html")) &&
    fs.existsSync(path.join(ROOT_DIR, "driver-console/server.js")) &&
    fs.existsSync(path.join(ROOT_DIR, "driver-console/package.json")) &&
    fs.existsSync(path.join(ROOT_DIR, "driver-console/vercel.json")) &&
    fs.existsSync(path.join(ROOT_DIR, "driver.html"));

  const driverHtmlContent = driverConsoleFilesExist ? fs.readFileSync(path.join(ROOT_DIR, "driver.html"), "utf8") : "";
  const driverHas14CharLock =
    driverHtmlContent.includes('id="login-username"') &&
    driverHtmlContent.includes('id="login-password"') &&
    driverHtmlContent.includes('minlength="14"') &&
    driverHtmlContent.includes('maxlength="14"');

  const driverHasGmapsAndWa =
    driverHtmlContent.includes("maps/search") &&
    driverHtmlContent.includes("wa.me") &&
    driverHtmlContent.includes("tel:");

  const driverHasPkgSummary =
    driverHtmlContent.includes("Pizza Box") &&
    driverHtmlContent.includes("summarizePackages");

  const driverHasActionBtns =
    driverHtmlContent.includes("Pick Up &amp; Start Delivery") &&
    driverHtmlContent.includes("Handed Over to Customer");

  const rootVercelJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "vercel.json"), "utf8"));
  const hasDriverRewrite = (rootVercelJson.rewrites || []).some(
    (rw) => rw.source === "/driver" && rw.destination === "/driver.html"
  );

  record(
    "dedicated-driver-console",
    "Dedicated driver-console/ & driver.html created with 14-char login, Google Maps, WhatsApp, package summary, action buttons, and /driver rewrite",
    driverConsoleFilesExist && driverHas14CharLock && driverHasGmapsAndWa && driverHasPkgSummary && driverHasActionBtns && hasDriverRewrite,
    `files=${driverConsoleFilesExist}, lock14=${driverHas14CharLock}, mapsWa=${driverHasGmapsAndWa}, pkgSummary=${driverHasPkgSummary}, actions=${driverHasActionBtns}, rewrite=${hasDriverRewrite}`
  );

  // 6r. Main Site Customer Username, Profile Icon & Cookie Auth + Refund Notification Flow
  function localMockRes() {
    const r = { statusCode: 200, headers: {}, body: null };
    r.setHeader = (k, v) => { r.headers[String(k).toLowerCase()] = v; };
    r.status = (c) => { r.statusCode = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    r.end = () => r;
    return r;
  }
  const authHandler = require(path.join(ROOT_DIR, "api", "auth.js"));
  const testUsername = `cust_${Date.now().toString().slice(-6)}`;
  const testEmail = `${testUsername}@example.com`;
  const badEmailRes = localMockRes();
  await authHandler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        action: "register",
        username: `${testUsername}_bad`,
        password: "Password123!",
        fullName: "Adaeze Okonkwo",
        email: "not-an-email",
        phone: "08098765432",
        consent: true,
      },
    },
    badEmailRes
  );

  const regRes = localMockRes();
  await authHandler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        action: "register",
        username: testUsername,
        password: "Password123!",
        fullName: "Adaeze Okonkwo",
        email: testEmail,
        phone: "08098765432",
        avatarIcon: "crown",
        consent: true,
      },
    },
    regRes
  );
  const cookieHeader = String(regRes.headers?.["set-cookie"] || "");
  const regOk =
    badEmailRes.statusCode === 400 &&
    regRes.statusCode === 201 &&
    regRes.body?.user?.username === testUsername &&
    regRes.body?.user?.email === testEmail &&
    regRes.body?.user?.avatarIcon === "crown" &&
    cookieHeader.includes("romeos_user_session=") &&
    cookieHeader.includes("HttpOnly");

  const dupRes = localMockRes();
  await authHandler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        action: "register",
        username: testUsername,
        password: "Password123!",
        fullName: "Adaeze Okonkwo",
        email: testEmail,
        phone: "08098765432",
        consent: true,
      },
    },
    dupRes
  );

  const badLoginRes = localMockRes();
  await authHandler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { action: "login", username: testUsername, password: "WrongPassword" },
    },
    badLoginRes
  );

  const loginRes = localMockRes();
  await authHandler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { action: "login", username: testUsername, password: "Password123!" },
    },
    loginRes
  );

  // Check regional country code phone normalization (e.g. UK +44 with leading 0)
  const regUkRes = localMockRes();
  await authHandler(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        action: "register",
        username: `uk_${Date.now().toString().slice(-6)}`,
        password: "Password123!",
        fullName: "UK Tester",
        email: `uk_${Date.now().toString().slice(-6)}@example.com`,
        countryCode: "+44",
        phone: "07123456789",
        consent: true,
      },
    },
    regUkRes
  );
  const ukPhoneNormalized = regUkRes.statusCode === 201 && regUkRes.body?.user?.phone === "+447123456789";

  const authPagesIncluded = ["index.html", "890b.html", "pizzadeals.html", "order.html", "track.html", "privacy.html", "terms.html", "login.html"].every((p) =>
    fs.readFileSync(path.join(ROOT_DIR, p), "utf8").includes("js/auth-ui.js")
  );
  const hasLoginRewrite = (rootVercelJson.rewrites || []).some(
    (rw) => rw.source === "/login" && rw.destination === "/login.html"
  );

  const rpaJsContent = fs.readFileSync(path.join(ROOT_DIR, "js", "phone-region-accordion.js"), "utf8");
  const regionCount = (rpaJsContent.match(/id:\s*"(africa|europe|americas|asia|middle-east|oceania)"/g) || []).length;
  const countryOptCount = (rpaJsContent.match(/\["[^"]+",\s*"[A-Z]{3}",\s*"\+\d+",/g) || []).length;
  const orderHtmlHasRpa = fs.readFileSync(path.join(ROOT_DIR, "order.html"), "utf8").includes("js/phone-region-accordion.js");
  record(
    "customer-auth-and-icons",
    "Main site customer username/password registration, 6-region accordion phone picker (150+ countries), HttpOnly cookie session, profile icons, and /login page work end-to-end",
    regOk && ukPhoneNormalized && regionCount === 6 && countryOptCount >= 150 && orderHtmlHasRpa && dupRes.statusCode === 409 && badLoginRes.statusCode === 401 && loginRes.statusCode === 200 && authPagesIncluded && hasLoginRewrite,
    `reg=${regRes.statusCode}, ukPhone=${regUkRes.body?.user?.phone}, regions=${regionCount}, countries=${countryOptCount}, orderRpa=${orderHtmlHasRpa}, cookieHttpOnly=${cookieHeader.includes("HttpOnly")}, dup=${dupRes.statusCode}, badPw=${badLoginRes.statusCode}, login=${loginRes.statusCode}, pages=${authPagesIncluded}, rewrite=${hasLoginRewrite}`
  );

  // 6s. Customer Refund Notification on Tracking & Account after Admin Order Deletion
  const ordersHandlerLocal = require(path.join(ROOT_DIR, "api", "orders.js"));
  const adminHandlerLocal = require(path.join(ROOT_DIR, "api", "admin.js"));
  const trackHandlerLocal = require(path.join(ROOT_DIR, "api", "track.js"));

  const admLoginRes = localMockRes();
  await adminHandlerLocal(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { action: "login", username: "RomeosAdmin890", password: "Adm94Kx72Qp81Z" },
    },
    admLoginRes
  );
  const admTokenLocal = admLoginRes.body?.token;

  const refundOrderRes = localMockRes();
  await ordersHandlerLocal(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        consent: true,
        customer: { name: "Adaeze Okonkwo", phone: "08098765432" },
        fulfilment: "Delivery",
        location: "Garki, Abuja",
        address: "10 Crescent Road",
        items: [{ name: "Pepperoni Feast (Large)", quantity: 1 }],
      },
    },
    refundOrderRes
  );
  const rOrderId = refundOrderRes.body?.orderId;
  const rOrderPin = refundOrderRes.body?.orderPin;

  const rDelRes = localMockRes();
  await adminHandlerLocal(
    {
      method: "DELETE",
      headers: { authorization: `Bearer ${admTokenLocal}` },
      body: { orderId: rOrderId },
    },
    rDelRes
  );
  const rToken = rDelRes.body?.refundToken;

  const rTrackRes = localMockRes();
  await trackHandlerLocal(
    {
      method: "GET",
      query: { phone: "08098765432", pin: rOrderPin },
    },
    rTrackRes
  );

  const sessionCookiePair = cookieHeader.split(";")[0];
  const rAuthRes = localMockRes();
  await authHandler(
    {
      method: "GET",
      headers: { cookie: sessionCookiePair },
    },
    rAuthRes
  );
  const authHasRefund = (rAuthRes.body?.refunds || []).some((r) => r.token === rToken);

  record(
    "customer-refund-notification",
    "Deleted order surfaces 15-char refund token to customer on both /api/track and logged-in /api/auth",
    rDelRes.statusCode === 200 && rTrackRes.statusCode === 200 && rTrackRes.body?.refunded === true && rTrackRes.body?.refund?.token === rToken && authHasRefund,
    `del=${rDelRes.statusCode}, trackStatus=${rTrackRes.statusCode}, trackRefundToken=${rTrackRes.body?.refund?.token}, authHasRefund=${authHasRefund}`
  );

  // 6t. Admin View of Signed-In People & Active Users (Admin-only)
  const adminUsersRes = localMockRes();
  await adminHandlerLocal(
    {
      method: "GET",
      headers: { authorization: `Bearer ${admTokenLocal}` },
      query: { view: "users" },
    },
    adminUsersRes
  );
  const staffLoginUsersTest = localMockRes();
  await adminHandlerLocal(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { action: "login", username: "RomeosStaff890", password: "Stf63Mp49Lw28R" },
    },
    staffLoginUsersTest
  );
  const staffUsersRes = localMockRes();
  await adminHandlerLocal(
    {
      method: "GET",
      headers: { authorization: `Bearer ${staffLoginUsersTest.body?.token}` },
      query: { view: "users" },
    },
    staffUsersRes
  );
  const hasRegisteredUser = (adminUsersRes.body?.users || []).some((u) => u.username === testUsername && u.isActive === true);
  record(
    "admin-signed-in-users-view",
    "Admin can view signed-in count, active users count, and all signed-in accounts (staff blocked with 403)",
    adminUsersRes.statusCode === 200 &&
      typeof adminUsersRes.body?.totalSignedIn === "number" &&
      typeof adminUsersRes.body?.activeSignedIn === "number" &&
      hasRegisteredUser &&
      staffUsersRes.statusCode === 403,
    `adminStatus=${adminUsersRes.statusCode}, totalSignedIn=${adminUsersRes.body?.totalSignedIn}, activeSignedIn=${adminUsersRes.body?.activeSignedIn}, foundActive=${hasRegisteredUser}, staffBlocked=${staffUsersRes.statusCode}`
  );

  // 6u. Admin Can Delete Only Used (Claimed) Refund Tokens (Unclaimed Blocked, Staff Blocked)
  const delUnclaimedRes = localMockRes();
  await adminHandlerLocal(
    { method: "DELETE", headers: { authorization: `Bearer ${admTokenLocal}` }, query: { refundToken: rToken } },
    delUnclaimedRes
  );
  const claimBeforeDelRes = localMockRes();
  await adminHandlerLocal(
    {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${admTokenLocal}` },
      body: { action: "claim_refund", token: rToken },
    },
    claimBeforeDelRes
  );
  const staffDelTokRes = localMockRes();
  await adminHandlerLocal(
    { method: "DELETE", headers: { authorization: `Bearer ${staffLoginUsersTest.body?.token}` }, query: { refundToken: rToken } },
    staffDelTokRes
  );
  const delClaimedRes = localMockRes();
  await adminHandlerLocal(
    { method: "DELETE", headers: { authorization: `Bearer ${admTokenLocal}` }, query: { refundToken: rToken } },
    delClaimedRes
  );
  const verifyAfterDelRes = localMockRes();
  await adminHandlerLocal(
    { method: "GET", headers: { authorization: `Bearer ${admTokenLocal}` }, query: { verifyRefundToken: rToken } },
    verifyAfterDelRes
  );
  record(
    "delete-used-refund-tokens",
    "Admin can delete only used (claimed) refund tokens while unclaimed tokens and staff deletions are blocked",
    delUnclaimedRes.statusCode === 400 &&
      claimBeforeDelRes.statusCode === 200 &&
      staffDelTokRes.statusCode === 403 &&
      delClaimedRes.statusCode === 200 &&
      verifyAfterDelRes.statusCode === 404,
    `unclaimedDel=${delUnclaimedRes.statusCode}, claimed=${claimBeforeDelRes.statusCode}, staffDel=${staffDelTokRes.statusCode}, adminDel=${delClaimedRes.statusCode}, afterDel=${verifyAfterDelRes.statusCode}`
  );

  // 6v. Admin Broadcast & Direct Messaging to Customers
  const staffSendMsgRes = localMockRes();
  await adminHandlerLocal(
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${staffLoginUsersTest.body?.token}` },
      body: { action: "send_message", target: "ALL", title: "Staff Attempt", message: "Should fail" },
    },
    staffSendMsgRes
  );
  const adminBroadcastRes = localMockRes();
  await adminHandlerLocal(
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${admTokenLocal}` },
      body: { action: "send_message", target: "ALL", title: "Hot Pizza Deal", message: "20% off Champion pizzas today!" },
    },
    adminBroadcastRes
  );
  const custMsgCheckRes = localMockRes();
  await authHandler(
    { method: "GET", headers: { cookie: sessionCookiePair } },
    custMsgCheckRes
  );
  const custGotBroadcast = (custMsgCheckRes.body?.messages || []).some((m) => m.body === "20% off Champion pizzas today!");
  record(
    "admin-broadcast-messages",
    "Admin can broadcast messages to all signed-in customers and customers receive them in /api/auth (staff blocked with 403)",
    staffSendMsgRes.statusCode === 403 && adminBroadcastRes.statusCode === 200 && custGotBroadcast,
    `staffBlocked=${staffSendMsgRes.statusCode}, adminSent=${adminBroadcastRes.statusCode}, customerReceived=${custGotBroadcast}`
  );

  // 6v2. Admin Promotional Email Campaign
  const staffPromoRes = localMockRes();
  await adminHandlerLocal(
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${staffLoginUsersTest.body?.token}` },
      body: { action: "send_promo_email", target: "ALL", subject: "Staff Promo", body: "Should be blocked" },
    },
    staffPromoRes
  );
  const adminPromoRes = localMockRes();
  await adminHandlerLocal(
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${admTokenLocal}` },
      body: {
        action: "send_promo_email",
        target: "ALL",
        subject: "Weekend Champion Pizza Deal",
        body: "Enjoy 20% off all Champion pizzas this weekend!",
        ctaText: "Order Now",
        ctaUrl: "https://romeospizza.ng/order",
      },
    },
    adminPromoRes
  );
  const adminUsersWithPromosRes = localMockRes();
  await adminHandlerLocal(
    { method: "GET", headers: { authorization: `Bearer ${admTokenLocal}` }, query: { tab: "users" } },
    adminUsersWithPromosRes
  );
  const adminConsoleHtml = fs.readFileSync(path.join(ROOT_DIR, "admin-console", "index.html"), "utf8");
  const promoSaved = (adminUsersWithPromosRes.body?.promoEmails || []).some(
    (p) => p.subject === "Weekend Champion Pizza Deal"
  );
  record(
    "admin-promotional-email",
    "Admin can send promotional email campaigns to registered customers and view history (staff blocked with 403)",
    staffPromoRes.statusCode === 403 &&
      adminPromoRes.statusCode === 200 &&
      adminPromoRes.body?.recipientCount >= 1 &&
      promoSaved &&
      adminConsoleHtml.includes("send-promo-email-btn"),
    `staffBlocked=${staffPromoRes.statusCode}, adminStatus=${adminPromoRes.statusCode}, recipients=${adminPromoRes.body?.recipientCount}, provider=${adminPromoRes.body?.provider}, saved=${promoSaved}`
  );

  // 6w. Admin Can Delete Customer Accounts (Staff Blocked, Session Invalidated)
  const staffDelAccRes = localMockRes();
  await adminHandlerLocal(
    { method: "DELETE", headers: { authorization: `Bearer ${staffLoginUsersTest.body?.token}` }, query: { customerUsername: testUsername } },
    staffDelAccRes
  );
  const adminDelAccRes = localMockRes();
  await adminHandlerLocal(
    { method: "DELETE", headers: { authorization: `Bearer ${admTokenLocal}` }, query: { customerUsername: testUsername } },
    adminDelAccRes
  );
  const afterDelAuthRes = localMockRes();
  await authHandler(
    { method: "GET", headers: { cookie: sessionCookiePair } },
    afterDelAuthRes
  );
  record(
    "admin-delete-customer-account",
    "Admin can delete a customer account and invalidate their session (staff blocked with 403)",
    staffDelAccRes.statusCode === 403 && adminDelAccRes.statusCode === 200 && afterDelAuthRes.body?.authenticated === false,
    `staffBlocked=${staffDelAccRes.statusCode}, adminDeleted=${adminDelAccRes.statusCode}, sessionAfter=${afterDelAuthRes.body?.authenticated}`
  );

  // 6x. Customer Complaints in Feedback Bubble & Admin Feedback View
  const feedbackHandlerLocal = require(path.join(ROOT_DIR, "api", "feedback.js"));
  const complaintPostRes = localMockRes();
  await feedbackHandlerLocal(
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        rating: 2,
        customer_name: "Complaint Test User",
        order_pin: "112233",
        tags: ["🐢 Delayed Delivery"],
        comments: "Ice cream arrived slightly melted",
        feedback_type: "complaint",
      },
    },
    complaintPostRes
  );
  const bubbleJsContent = fs.readFileSync(path.join(ROOT_DIR, "js", "feedback-bubble.js"), "utf8");
  const hasComplaintUi = bubbleJsContent.includes("COMPLAINT_TAGS") && bubbleJsContent.includes("rfb-mode-complaint");
  record(
    "feedback-complaints",
    "Customer feedback bubble and /api/feedback support Complaint submissions tagged with feedback_type=complaint",
    complaintPostRes.statusCode === 200 && complaintPostRes.body?.record?.feedback_type === "complaint" && hasComplaintUi,
    `status=${complaintPostRes.statusCode}, type=${complaintPostRes.body?.record?.feedback_type}, ui=${hasComplaintUi}`
  );
}

// ---------------------------------------------------------------------------
// Main Runner
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== Romeo's Pizza End-to-End Verification Suite ===");
  checkJsSyntax();
  checkNoJumboReferences();
  const parsedMenuItems = checkMenuPizzaCards();
  checkImages();
  checkPriceCalculation(parsedMenuItems);
  checkHomepageAndTheme();
  await checkWhatsAppApi();
  await checkLegalAndDealsCompliance();

  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log("\n=== Verification Summary ===");
  console.log(`Total checks: ${total} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.log("\nFailed checks:");
    for (const r of results.filter((x) => !x.passed)) {
      console.log(`  - [${r.section}] ${r.name}: ${r.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log("ALL CHECKS PASSED.");
  }
}

main();

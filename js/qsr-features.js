(function () {
  "use strict";

  const BRAND = "coldberry"; // "coldberry" | "romeos"
  const IS_CB = BRAND === "coldberry";
  const LOYALTY_NAME = IS_CB ? "BerryPoints" : "RomeoCoins";
  const BRANCH_PHONE = "+2349055303848";
  const FAV_KEY = "cb_rm_favorites";
  const LAST_ORDER_KEY = "cb_rm_last_order";
  const LOYALTY_KEY = "cb_rm_loyalty_points";

  const BRANCH_COORDS = [
    { name: "Garki, Abuja", lat: 9.0331, lon: 7.4913 },
    { name: "Lugbe, Abuja", lat: 8.9833, lon: 7.3667 },
    { name: "Yaba, Lagos", lat: 6.5095, lon: 3.3711 },
    { name: "Surulere, Lagos", lat: 6.4969, lon: 3.3569 },
    { name: "Okota, Lagos", lat: 6.5122, lon: 3.3144 },
    { name: "Festac, Lagos", lat: 6.4664, lon: 3.2835 },
    { name: "Ajao, Lagos", lat: 6.5446, lon: 3.3264 },
  ];

  const HOTSPOTS = {
    Abuja: ["Wuse 2 / Banex", "Jabi Lake Mall", "Maitama", "Gwarinpa 3rd Ave", "Lugbe Airport Rd"],
    Lagos: ["UNILAG Main Gate", "Yaba Tech", "National Stadium Surulere", "Festac 1st Gate", "Ajao Estate Link"],
  };

  const DEFAULT_LOCAL_VOUCHERS = {
    WELCOME10: { code: "WELCOME10", type: "percent", percent: 10, minOrder: 0, isActive: true },
    WEEKEND15: { code: "WEEKEND15", type: "percent", percent: 15, minOrder: 20000, isActive: true },
    FREEDRINK: { code: "FREEDRINK", type: "drink", percent: 0, minOrder: 0, freeItem: "Cold Coca-Cola (50cl)", isActive: true },
  };

  window.__qsrCheckoutState = window.__qsrCheckoutState || {
    voucher: null,
    redeemLoyalty: false,
    availablePoints: 0,
  };

  function readCartRaw() {
    try {
      const legacy = JSON.parse(localStorage.getItem("romeos-pizza-cart") || "{}");
      if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) return legacy;
    } catch (_) {}
    return {};
  }

  function writeCartRaw(map) {
    try {
      localStorage.setItem("romeos-pizza-cart", JSON.stringify(map));
      const arr = Object.entries(map).map(([name, quantity]) => ({ name, quantity }));
      localStorage.setItem("romeos_cart", JSON.stringify(arr));
    } catch (_) {}
    document.dispatchEvent(new CustomEvent("cart:change"));
  }

  function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /* -----------------------------------------------------------------------
   * 1. GPS Nearest-Branch Auto-Select on .fulfilment-strip
   * ----------------------------------------------------------------------- */
  function initGpsNearestBranch() {
    document.querySelectorAll("[data-fulfilment-strip]").forEach((strip) => {
      const wrap = strip.querySelector(".fulfilment-branch-wrap");
      const sel = strip.querySelector("[data-branch-select]");
      if (!wrap || !sel || wrap.querySelector(".fulfilment-gps-btn")) return;

      const gpsBtn = document.createElement("button");
      gpsBtn.type = "button";
      gpsBtn.className = "fulfilment-gps-btn";
      gpsBtn.title = "Find nearest Abuja or Lagos branch using GPS";
      gpsBtn.setAttribute("aria-label", "Use my current location to pick nearest branch");
      gpsBtn.innerHTML = '<i class="fa-solid fa-location-crosshairs" aria-hidden="true"></i>';

      gpsBtn.addEventListener("click", () => {
        if (!navigator.geolocation) {
          gpsBtn.title = "GPS not available on this device";
          return;
        }
        gpsBtn.classList.add("is-locating");
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            gpsBtn.classList.remove("is-locating");
            const { latitude, longitude } = pos.coords;
            let best = BRANCH_COORDS[0];
            let bestDist = Infinity;
            for (const b of BRANCH_COORDS) {
              const d = haversineKm(latitude, longitude, b.lat, b.lon);
              if (d < bestDist) {
                bestDist = d;
                best = b;
              }
            }
            sel.value = best.name;
            sel.dispatchEvent(new Event("change", { bubbles: true }));
            try { localStorage.setItem("cb_rm_location", best.name); } catch (_) {}
            gpsBtn.title = `Nearest branch: ${best.name}`;
          },
          () => {
            gpsBtn.classList.remove("is-locating");
            gpsBtn.title = "Location access declined — choose branch manually";
          },
          { timeout: 6000, maximumAge: 120000 }
        );
      });
      wrap.appendChild(gpsBtn);
    });
  }

  /* -----------------------------------------------------------------------
   * 2. Slide-Over Quick Cart & Smart Pairing Drawer (Non-Checkout Pages)
   * ----------------------------------------------------------------------- */
  function initQuickCartDrawer() {
    if (document.getElementById("order-form")) return; // Checkout page already displays full cart

    const drawer = document.createElement("aside");
    drawer.id = "qsr-cart-drawer";
    drawer.className = "qsr-cart-drawer";
    drawer.setAttribute("aria-label", "Quick Shopping Cart");
    drawer.setAttribute("aria-hidden", "true");
    const upsellName = IS_CB ? "Romeo's Pepperoni Pizza (Medium)" : "Coldberry Delight Tub (Medium)";
    const upsellPrice = IS_CB ? "₦11,200" : "₦12,200";
    drawer.innerHTML = `
      <div class="qsr-drawer-backdrop" data-qsr-close-drawer></div>
      <div class="qsr-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="qsr-drawer-title">
        <div class="qsr-drawer-header">
          <h2 id="qsr-drawer-title">Your Order</h2>
          <button type="button" class="qsr-drawer-close" data-qsr-close-drawer aria-label="Close cart drawer">&times;</button>
        </div>
        <div class="qsr-drawer-body">
          <div id="qsr-drawer-items" class="qsr-drawer-items"></div>
          <div id="qsr-drawer-upsell" class="qsr-drawer-upsell">
            <span class="qsr-upsell-kicker">Complete Your Order</span>
            <div class="qsr-upsell-row">
              <div>
                <strong>Cold Coca-Cola (50cl)</strong>
                <span>₦900</span>
              </div>
              <button type="button" class="qsr-upsell-add" data-qsr-quick-add="Cold Coca-Cola (50cl)">+ Add</button>
            </div>
            <div class="qsr-upsell-row">
              <div>
                <strong>${upsellName}</strong>
                <span>${upsellPrice} · Same Rider</span>
              </div>
              <button type="button" class="qsr-upsell-add" data-qsr-quick-add="${upsellName}">+ Add</button>
            </div>
          </div>
        </div>
        <div class="qsr-drawer-footer">
          <div class="qsr-drawer-subtotal-row">
            <span>Est. Food Subtotal</span>
            <strong id="qsr-drawer-subtotal">₦0</strong>
          </div>
          <p class="qsr-drawer-tip" id="qsr-drawer-tip">Tip: Switch to Pickup or Call To Collect at checkout for ₦0 delivery fee.</p>
          <a href="order.html#cart-heading" class="qsr-drawer-checkout-btn">Proceed to Checkout &rarr;</a>
        </div>
      </div>
    `;
    document.body.appendChild(drawer);

    function renderDrawer() {
      const map = readCartRaw();
      const entries = Object.entries(map).filter(([, q]) => Number(q) > 0);
      const container = document.getElementById("qsr-drawer-items");
      const subEl = document.getElementById("qsr-drawer-subtotal");
      if (!container) return;

      if (entries.length === 0) {
        container.innerHTML = `<div class="qsr-drawer-empty"><p>Your cart is empty.</p><a href="890b.html" class="cart-empty-link">Browse Menu &rarr;</a></div>`;
        if (subEl) subEl.textContent = "₦0";
        return;
      }

      container.innerHTML = entries.map(([name, qty]) => {
        const safe = String(name).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
        return `<div class="qsr-drawer-item">
          <span class="qsr-drawer-item-name">${safe}</span>
          <div class="quantity-control" data-cart-item="${safe}">
            <button type="button" data-cart-action="decrement" aria-label="Remove one ${safe}">−</button>
            <span data-cart-quantity>${qty}</span>
            <button type="button" data-cart-action="increment" aria-label="Add one ${safe}">+</button>
          </div>
        </div>`;
      }).join("");

      const stickyTotal = document.getElementById("sticky-cart-total");
      if (subEl) {
        subEl.textContent = stickyTotal && stickyTotal.textContent ? stickyTotal.textContent : `${entries.reduce((s, [, q]) => s + Number(q), 0)} items`;
      }
    }

    function openDrawer() {
      renderDrawer();
      drawer.classList.add("is-open");
      drawer.setAttribute("aria-hidden", "false");
    }

    function closeDrawer() {
      drawer.classList.remove("is-open");
      drawer.setAttribute("aria-hidden", "true");
    }

    drawer.addEventListener("click", (e) => {
      if (e.target.closest("[data-qsr-close-drawer]")) {
        closeDrawer();
        return;
      }
      const addBtn = e.target.closest("[data-qsr-quick-add]");
      if (addBtn) {
        const item = addBtn.dataset.qsrQuickAdd;
        const map = readCartRaw();
        map[item] = Math.min(10, (map[item] || 0) + 1);
        writeCartRaw(map);
        renderDrawer();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && drawer.classList.contains("is-open")) closeDrawer();
    });
    document.addEventListener("cart:change", () => {
      if (drawer.classList.contains("is-open")) renderDrawer();
    });

    const navCart = document.getElementById("nav-cart-link");
    if (navCart) {
      navCart.addEventListener("click", (e) => {
        e.preventDefault();
        openDrawer();
      });
    }
    document.querySelectorAll(".menu-cart a").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        openDrawer();
      });
    });
  }

  /* -----------------------------------------------------------------------
   * 3. 1-Tap Reorder Last Order (Returning Shoppers) + Menu Favorites (♡)
   * ----------------------------------------------------------------------- */
  function initReorderAndFavorites() {
    // 1-Tap Reorder Pill (only appears if user has a previous saved order — zero clutter on fresh visits!)
    try {
      const rawLast = localStorage.getItem(LAST_ORDER_KEY);
      if (rawLast) {
        const last = JSON.parse(rawLast);
        if (last && Array.isArray(last.items) && last.items.length > 0) {
          const strip = document.querySelector("[data-fulfilment-strip]");
          if (strip && !document.getElementById("qsr-reorder-bar")) {
            const summary = last.items.slice(0, 2).map((i) => `${i.quantity}× ${i.name}`).join(", ") + (last.items.length > 2 ? ` +${last.items.length - 2} more` : "");
            const bar = document.createElement("div");
            bar.id = "qsr-reorder-bar";
            bar.className = "qsr-reorder-bar";
            bar.innerHTML = `
              <div class="qsr-reorder-copy">
                <span class="qsr-reorder-kicker"><i class="fa-solid fa-rotate-right" aria-hidden="true"></i> Easy Reorder</span>
                <span class="qsr-reorder-items">${String(summary).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))}</span>
              </div>
              <button type="button" class="qsr-reorder-btn">Reorder in 1 Tap</button>
            `;
            bar.querySelector(".qsr-reorder-btn").addEventListener("click", (e) => {
              const map = readCartRaw();
              for (const it of last.items) {
                map[it.name] = Math.min(10, (map[it.name] || 0) + Number(it.quantity || 1));
              }
              writeCartRaw(map);
              e.target.textContent = "Added to Cart!";
              setTimeout(() => { window.location.href = "order.html#cart-heading"; }, 550);
            });
            strip.insertAdjacentElement("afterend", bar);
          }
        }
      }
    } catch (_) {}

    // Subtle Favorite Heart Toggle on 890b.html Menu Cards
    const menuCards = document.querySelectorAll(".pizza-card");
    if (menuCards.length > 0) {
      let favs = [];
      try { favs = JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch (_) { favs = []; }
      if (!Array.isArray(favs)) favs = [];
      const favSet = new Set(favs);

      menuCards.forEach((card) => {
        const titleEl = card.querySelector("h3");
        const imgWrap = card.querySelector(".pizza-image-wrap") || card.querySelector(".pizza-image") || card;
        if (!titleEl || card.querySelector(".qsr-fav-btn")) return;
        const name = titleEl.textContent.trim();

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "qsr-fav-btn" + (favSet.has(name) ? " is-fav" : "");
        btn.setAttribute("aria-label", `Save ${name} to favorites`);
        btn.setAttribute("aria-pressed", favSet.has(name) ? "true" : "false");
        btn.innerHTML = `<i class="${favSet.has(name) ? "fa-solid" : "fa-regular"} fa-heart" aria-hidden="true"></i>`;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (favSet.has(name)) {
            favSet.delete(name);
            btn.classList.remove("is-fav");
            btn.setAttribute("aria-pressed", "false");
            btn.innerHTML = '<i class="fa-regular fa-heart" aria-hidden="true"></i>';
          } else {
            favSet.add(name);
            btn.classList.add("is-fav");
            btn.setAttribute("aria-pressed", "true");
            btn.innerHTML = '<i class="fa-solid fa-heart" aria-hidden="true"></i>';
          }
          try { localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(favSet))); } catch (_) {}
        });
        card.style.position = "relative";
        card.appendChild(btn);
      });
    }
  }

  /* -----------------------------------------------------------------------
   * 4. Checkout (order.html): Landmark Hotspots, Scheduled Time,
   *    Admin-Synced Promo Voucher Engine & Loyalty Points Widget
   * ----------------------------------------------------------------------- */
  function initCheckoutEnhancements() {
    const orderForm = document.getElementById("order-form");
    if (!orderForm) return;

    // 4a. Landmark Hotspots inside #delivery-group
    const deliveryGroup = document.getElementById("delivery-group");
    const locSelect = document.getElementById("order-location");
    const addrInput = document.getElementById("delivery-address");
    if (deliveryGroup && addrInput && !document.getElementById("qsr-hotspots-wrap")) {
      const wrap = document.createElement("div");
      wrap.id = "qsr-hotspots-wrap";
      wrap.className = "qsr-hotspots-wrap";
      wrap.innerHTML = `
        <span class="qsr-hotspots-label"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> Quick Landmark Hotspots:</span>
        <div class="qsr-hotspots-chips" id="qsr-hotspots-chips"></div>
        <input type="hidden" id="order-hotspot-input" name="hotspotLandmark" value="" />
      `;
      deliveryGroup.appendChild(wrap);

      function renderHotspots() {
        const val = locSelect ? locSelect.value : "";
        const city = val.includes("Lagos") ? "Lagos" : "Abuja";
        const chipsEl = document.getElementById("qsr-hotspots-chips");
        if (!chipsEl) return;
        chipsEl.innerHTML = HOTSPOTS[city].map((lm) =>
          `<button type="button" class="qsr-hotspot-chip" data-landmark="${lm}">${lm}</button>`
        ).join("");
        chipsEl.querySelectorAll(".qsr-hotspot-chip").forEach((chip) => {
          chip.addEventListener("click", () => {
            const lm = chip.dataset.landmark;
            chipsEl.querySelectorAll(".qsr-hotspot-chip").forEach((c) => c.classList.toggle("is-active", c === chip));
            const hiddenIn = document.getElementById("order-hotspot-input");
            if (hiddenIn) hiddenIn.value = lm;
            if (!addrInput.value.trim()) {
              addrInput.value = `Near ${lm}, ${city}`;
            } else if (!addrInput.value.includes(lm)) {
              addrInput.value = `${addrInput.value.trim()} (Landmark: ${lm})`;
            }
          });
        });
      }
      renderHotspots();
      if (locSelect) locSelect.addEventListener("change", renderHotspots);
    }

    // 4b. Scheduled Order Time Selector right after #delivery-group
    if (deliveryGroup && !document.getElementById("order-scheduled-time")) {
      const schedDiv = document.createElement("div");
      schedDiv.className = "order-field qsr-schedule-field";
      schedDiv.innerHTML = `
        <label for="order-scheduled-time">Order timing</label>
        <select id="order-scheduled-time" name="scheduledTime">
          <option value="ASAP" selected>ASAP — Fastest (~30–35 min)</option>
          <option value="Today · 1:00 PM (Lunch)">Schedule for Today · 1:00 PM (Lunch)</option>
          <option value="Today · 4:00 PM (Afternoon)">Schedule for Today · 4:00 PM (Afternoon)</option>
          <option value="Today · 7:00 PM (Dinner)">Schedule for Today · 7:00 PM (Dinner)</option>
          <option value="Today · 9:00 PM (Late Night)">Schedule for Today · 9:00 PM (Late Night)</option>
        </select>
      `;
      deliveryGroup.insertAdjacentElement("afterend", schedDiv);
    }

    // 4c. Promo Voucher Code & Loyalty Points Modules inside .order-cart (below pricing summary)
    const orderCartSec = document.querySelector(".order-cart");
    const pricingSummary = document.getElementById("cart-pricing-summary");
    if (orderCartSec && pricingSummary && !document.getElementById("qsr-voucher-box")) {
      // Inject dynamic promo & loyalty discount rows inside #cart-pricing-summary right before Grand Total
      const grandRow = pricingSummary.querySelector(".cart-grand-total-row");
      if (grandRow && !document.getElementById("cart-promo-row")) {
        grandRow.insertAdjacentHTML("beforebegin", `
          <div class="cart-pricing-row qsr-discount-row" id="cart-promo-row" hidden>
            <span class="cart-pricing-label" id="cart-promo-label">Promo Voucher</span>
            <span id="cart-promo-val" class="cart-pricing-val">₦0</span>
          </div>
          <div class="cart-pricing-row qsr-discount-row" id="cart-loyalty-row" hidden>
            <span class="cart-pricing-label">${LOYALTY_NAME} (2,500 pts)</span>
            <span id="cart-loyalty-val" class="cart-pricing-val">-₦2,500</span>
          </div>
        `);
        pricingSummary.insertAdjacentHTML("beforeend", `<p id="cart-loyalty-earn-preview" class="qsr-earn-preview" hidden></p>`);
      }

      // Promo Voucher Box
      const voucherBox = document.createElement("div");
      voucherBox.id = "qsr-voucher-box";
      voucherBox.className = "qsr-voucher-box";
      voucherBox.innerHTML = `
        <details class="qsr-voucher-details">
          <summary><i class="fa-solid fa-ticket" aria-hidden="true"></i> Have a promo or drink voucher?</summary>
          <div class="qsr-voucher-row">
            <input type="text" id="qsr-voucher-input" placeholder="e.g. WELCOME10 or FREEDRINK" maxlength="32" aria-label="Promo voucher code" />
            <button type="button" id="qsr-voucher-apply" class="qsr-voucher-btn">Apply</button>
          </div>
          <p id="qsr-voucher-status" class="qsr-voucher-status" hidden></p>
        </details>
      `;
      orderCartSec.appendChild(voucherBox);

      const vInput = document.getElementById("qsr-voucher-input");
      const vBtn = document.getElementById("qsr-voucher-apply");
      const vStatus = document.getElementById("qsr-voucher-status");

      vBtn.addEventListener("click", async () => {
        const code = String(vInput.value || "").trim().toUpperCase();
        if (!code) {
          window.__qsrCheckoutState.voucher = null;
          vStatus.hidden = true;
          document.dispatchEvent(new CustomEvent("qsr:pricing-refresh"));
          return;
        }
        vBtn.disabled = true;
        vBtn.textContent = "Checking...";
        try {
          const map = readCartRaw();
          const sub = window.RomeosOrder?.calculateOrderTotals ? window.RomeosOrder.calculateOrderTotals(map, "Pickup", {}).subtotal : 0;
          let result = null;
          try {
            const resp = await fetch(`/api/orders?action=validate_voucher&code=${encodeURIComponent(code)}&subtotal=${sub}`, { cache: "no-store" });
            if (resp.ok) result = await resp.json();
          } catch (_) {}

          if (!result) {
            result = { valid: false, error: "Unable to verify voucher right now. Please try again." };
          }

          vStatus.hidden = false;
          if (!result.valid || !result.voucher) {
            window.__qsrCheckoutState.voucher = null;
            vStatus.className = "qsr-voucher-status is-error";
            vStatus.textContent = result.error || "Invalid voucher code.";
          } else {
            window.__qsrCheckoutState.voucher = result.voucher;
            vStatus.className = "qsr-voucher-status is-success";
            vStatus.textContent = result.voucher.type === "drink"
              ? `${result.voucher.code} applied! Complimentary ${result.voucher.freeItem || "Cold Coca-Cola (50cl)"} included (exempt from fee scaling).`
              : `${result.voucher.code} applied (${result.voucher.percent}% off food · max total capped ≤ 95% of original price).`;
          }
          document.dispatchEvent(new CustomEvent("qsr:pricing-refresh"));
        } finally {
          vBtn.disabled = false;
          vBtn.textContent = "Apply";
        }
      });

      // Loyalty Rewards Box (1 pt per ₦500 food subtotal only · 10 Drink · 50 Shawarma · 70 Med · 80 Lrg · 90 Champ · 2,500 ₦2,500 off)
      const REWARD_TIERS = [
        { id: "drink_10", points: 10, label: "Free Cold Drink (50cl)" },
        { id: "shawarma_50", points: 50, label: "Free Shawarma" },
        { id: "medium_pizza_70", points: 70, label: "Free Medium Pizza" },
        { id: "large_pizza_80", points: 80, label: "Free Large Pizza" },
        { id: "champion_pizza_90", points: 90, label: "Free Champion Pizza" },
        { id: "cash_2500", points: 2500, label: "₦2,500 Off Order" },
      ];
      const loyaltyBox = document.createElement("div");
      loyaltyBox.id = "qsr-loyalty-box";
      loyaltyBox.className = "qsr-loyalty-box";
      loyaltyBox.innerHTML = `
        <div class="qsr-loyalty-top">
          <span class="qsr-loyalty-title"><i class="fa-solid fa-award" aria-hidden="true"></i> ${LOYALTY_NAME}</span>
          <span class="qsr-loyalty-pts" id="qsr-loyalty-pts-val">0 pts · 10 pts for Drink</span>
        </div>
        <div class="qsr-loyalty-bar"><div class="qsr-loyalty-fill" id="qsr-loyalty-fill" style="width:0%"></div></div>
        <p class="qsr-loyalty-note">${IS_CB ? '1&nbsp;pt / ₦500 subtotal (excl.&nbsp;fees) · Sister Kitchen Rewards: <span class="qsr-tier">10&nbsp;Drink</span> · <span class="qsr-tier">50&nbsp;Shawarma</span> · <span class="qsr-tier">70&nbsp;Med</span> · <span class="qsr-tier">80&nbsp;Lrg</span> · <span class="qsr-tier">90&nbsp;Champ&nbsp;Pizza</span> · <span class="qsr-tier">2,500&nbsp;=&nbsp;₦2,500&nbsp;off.</span>' : '1&nbsp;pt / ₦500 food subtotal (excl.&nbsp;fees) · <span class="qsr-tier">10&nbsp;Drink</span> · <span class="qsr-tier">50&nbsp;Shawarma</span> · <span class="qsr-tier">70&nbsp;Med</span> · <span class="qsr-tier">80&nbsp;Lrg</span> · <span class="qsr-tier">90&nbsp;Champ</span> · <span class="qsr-tier">2,500&nbsp;=&nbsp;₦2,500&nbsp;off.</span>'}</p>
        <div class="qsr-loyalty-redeem" id="qsr-loyalty-redeem-wrap" hidden>
          <select id="qsr-loyalty-reward-select" class="qsr-party-select" aria-label="Redeem loyalty reward" style="width:100%;margin-top:0.35rem;">
            <option value="">Keep points for later</option>
          </select>
        </div>
      `;
      orderCartSec.appendChild(loyaltyBox);

      function renderLoyaltyBalance(pts, isAuthed) {
        const safePts = isAuthed ? Math.max(0, Number(pts) || 0) : 0;
        window.__qsrCheckoutState.availablePoints = safePts;
        const nextTier = REWARD_TIERS.find((t) => safePts < t.points) || REWARD_TIERS[REWARD_TIERS.length - 1];
        const pct = Math.min(100, Math.round((safePts / nextTier.points) * 100));
        const valEl = document.getElementById("qsr-loyalty-pts-val");
        const fillEl = document.getElementById("qsr-loyalty-fill");
        const redeemWrap = document.getElementById("qsr-loyalty-redeem-wrap");
        const rewardSel = document.getElementById("qsr-loyalty-reward-select");
        if (valEl) {
          valEl.textContent = isAuthed
            ? `${safePts.toLocaleString("en-NG")} pts · Next: ${nextTier.points.toLocaleString("en-NG")} pts`
            : `Sign in to earn · 10 pts = Drink`;
        }
        if (fillEl) fillEl.style.width = `${pct}%`;
        const unlocked = REWARD_TIERS.filter((t) => safePts >= t.points);
        if (redeemWrap && rewardSel) {
          redeemWrap.hidden = !isAuthed || unlocked.length === 0;
          rewardSel.innerHTML = '<option value="">Keep points for later</option>' + unlocked
            .map((t) => `<option value="${t.id}">Redeem ${t.points.toLocaleString("en-NG")} pts — ${t.label}</option>`)
            .join("");
        }
      }

      renderLoyaltyBalance(0, false);

      fetch("/api/orders?action=loyalty_balance", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && d.ok) {
            renderLoyaltyBalance(d.points || 0, Boolean(d.authenticated));
          }
        })
        .catch(() => {});

      const rewardSel = document.getElementById("qsr-loyalty-reward-select");
      if (rewardSel) {
        rewardSel.addEventListener("change", () => {
          const val = rewardSel.value || "";
          window.__qsrCheckoutState.loyaltyRewardId = val;
          window.__qsrCheckoutState.redeemLoyalty = val === "cash_2500";
          document.dispatchEvent(new CustomEvent("qsr:pricing-refresh"));
        });
      }
    }
  }

  /* -----------------------------------------------------------------------
   * 5. Interactive Party Catering Flavour Pickers (pizzadeals.html)
   * ----------------------------------------------------------------------- */
  function initPartyPickers() {
    const partySection = document.getElementById("party-catering");
    if (!partySection) return;
    const iceCreamFlavours = ["Coldberry Vanilla Bean", "Strawberry Bliss Swirl", "Belgian Chocolate Fudge", "BlueMoon Berry Cream", "Coldberry Delight", "Oreo & Strawberry Roll"];
    const pizzaFlavours = ["Pepperoni Pizza", "BBQ Chicken Pizza", "Beef Suya Pizza", "Shawarma Pizza", "Chicken Supreme Pizza", "Nineoverloaded Pizza"];

    partySection.querySelectorAll(".party-bundle-card").forEach((card) => {
      if (card.querySelector(".qsr-party-pickers")) return;
      const btn = card.querySelector("[data-add-bundle]");
      if (!btn) return;
      const baseName = btn.dataset.addBundle || "Party Bundle";
      const cardHeading = (card.querySelector("h3")?.textContent || "") + " " + baseName;
      const isIceCreamCard = /coldberry|ice cream|tub|creamery|scoop/i.test(cardHeading) && !/pizza\s*\+/i.test(cardHeading);
      const flavours = isIceCreamCard ? iceCreamFlavours : (IS_CB && !/pizza/i.test(cardHeading) ? iceCreamFlavours : pizzaFlavours);
      const pickWrap = document.createElement("div");
      pickWrap.className = "qsr-party-pickers";
      pickWrap.innerHTML = Array.from({ length: 3 }, (_, i) => {
        const opts = flavours.map((f, fi) => `<option value="${f}"${fi === i ? " selected" : ""}>Flavour ${i + 1}: ${f}</option>`).join("");
        return `<select class="qsr-party-select" aria-label="Flavour ${i + 1}">${opts}</select>`;
      }).join("");

      btn.insertAdjacentElement("beforebegin", pickWrap);
      const noteEl = card.querySelector(".party-bundle-note");
      if (noteEl) {
        noteEl.textContent = "Pick your 3 included flavours above — added straight to your cart.";
      }

      function syncBundleName() {
        const chosen = Array.from(pickWrap.querySelectorAll("select")).map((s) => s.value);
        btn.dataset.addBundle = `${baseName} (${chosen.join(" + ")})`;
      }
      pickWrap.querySelectorAll("select").forEach((s) => s.addEventListener("change", syncBundleName));
      syncBundleName();
    });
  }

  /* -----------------------------------------------------------------------
   * 6. Live Tracker Enhancements (track.html): Auto-Sync Badge, Share PIN & Call Branch
   * ----------------------------------------------------------------------- */
  function initTrackerEnhancements() {
    const trackResult = document.getElementById("track-result");
    if (!trackResult || document.getElementById("qsr-track-actions")) return;

    const bar = document.createElement("div");
    bar.id = "qsr-track-actions";
    bar.className = "qsr-track-actions";
    bar.innerHTML = `
      <span class="qsr-live-sync-pill"><span class="qsr-sync-dot" aria-hidden="true"></span> Live sync · updates every 25s</span>
      <div class="qsr-track-btn-row">
        <button type="button" id="qsr-share-track-btn" class="qsr-track-mini-btn"><i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Share Link &amp; PIN</button>
        <a href="tel:${BRANCH_PHONE}" class="qsr-track-mini-btn"><i class="fa-solid fa-phone" aria-hidden="true"></i> Call Branch</a>
      </div>
    `;
    trackResult.appendChild(bar);

    const shareBtn = document.getElementById("qsr-share-track-btn");
    if (shareBtn) {
      shareBtn.addEventListener("click", async () => {
        const url = window.location.href;
        try {
          if (navigator.share) {
            await navigator.share({ title: "Live Order Tracking", text: "Track my order status live:", url });
          } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(url);
            shareBtn.textContent = "Tracking Link Copied!";
            setTimeout(() => { shareBtn.innerHTML = '<i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Share Link &amp; PIN'; }, 2200);
          }
        } catch (_) {}
      });
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initGpsNearestBranch();
    initQuickCartDrawer();
    initReorderAndFavorites();
    initCheckoutEnhancements();
    initPartyPickers();
    initTrackerEnhancements();
  });
})();

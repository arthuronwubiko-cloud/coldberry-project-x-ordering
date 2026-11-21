/**
 * Coldberry Ice Cream Nigeria - Floating Client Feedback Bubble
 * Connected to BOTH Neon Postgres and Supabase (dual-DB sync) via /api/feedback.
 *
 * Lightweight, self-contained, responsive, and theme-aware (light/dark mode).
 */

(function () {
  "use strict";

  // Prevent multiple initializations if script is loaded more than once
  if (document.getElementById("romeos-feedback-bubble-root")) {
    return;
  }

  const QUICK_TAGS = [
    "Rich & Creamy",
    "Fast Cold-Bag Delivery",
    "Authentic Flavours",
    "Friendly Courier",
    "Crispy Waffle Bowl",
    "Fresh Berry Swirls",
    "Perfect 2-in-1 Tub",
    "Perfectly Chilled"
  ];

  const COMPLAINT_TAGS = [
    "Delayed Delivery",
    "Melted / Wrong Scoop",
    "Missing Waffle / Cone",
    "Payment / Refund Issue",
    "Missing Spoons / Napkins",
    "Wrong Scoop Flavour"
  ];

  const RATING_DESCRIPTIONS = [
    "Tap a star to rate",
    "1 - Needs Improvement",
    "2 - Fair / Okay",
    "3 - Sweet & Good",
    "4 - Delicious Scoop!",
    "5 - Outstanding Indulgence!"
  ];

  function getAutoFillData() {
    let name = "";
    let pin = "";

    // 1. Check URL parameters
    try {
      const urlParams = new URLSearchParams(window.location.search);
      name = urlParams.get("customer_name") || urlParams.get("name") || urlParams.get("customerName") || "";
      pin = urlParams.get("order_pin") || urlParams.get("pin") || urlParams.get("orderPin") || "";
    } catch (_) {}

    // 2. Check localStorage if name or pin not in URL
    if (typeof localStorage !== "undefined") {
      try {
        if (!name) {
          name = localStorage.getItem("romeos_customer_name") ||
                 localStorage.getItem("romeos_name") ||
                 localStorage.getItem("customer_name") || "";
        }
        if (!pin) {
          pin = localStorage.getItem("romeos_last_order_pin") ||
                localStorage.getItem("romeos_order_pin") || "";

          // Also scan active pins store for the most recently allocated pin
          if (!pin) {
            const rawActive = localStorage.getItem("romeos_active_pins");
            if (rawActive) {
              const activeObj = JSON.parse(rawActive);
              if (activeObj && typeof activeObj === "object") {
                let newestTs = 0;
                let newestPin = "";
                for (const [p, ts] of Object.entries(activeObj)) {
                  if (Number(ts) > newestTs && /^\d{6}$/.test(p)) {
                    newestTs = Number(ts);
                    newestPin = p;
                  }
                }
                if (newestPin) pin = newestPin;
              }
            }
          }
        }
      } catch (_) {}
    }

    // 3. Check active form fields on the page (e.g. order.html or track.html)
    if (!name) {
      const nameInput = document.getElementById("customer-name") || document.getElementById("name") || document.querySelector('input[name="customer_name"]');
      if (nameInput && nameInput.value) {
        name = nameInput.value.trim();
      }
    }
    if (!pin) {
      const pinEl = document.getElementById("order-pin-display") || document.getElementById("track-pin");
      if (pinEl) {
        const text = (pinEl.value || pinEl.textContent || "").trim();
        if (/^\d{6}$/.test(text)) {
          pin = text;
        }
      }
    }

    return { name, pin };
  }

  function injectStyles() {
    if (document.getElementById("romeos-feedback-bubble-styles")) return;

    const styleEl = document.createElement("style");
    styleEl.id = "romeos-feedback-bubble-styles";
    styleEl.textContent = `
      /* Root feedback widget container */
      #romeos-feedback-bubble-root {
        position: fixed;
        bottom: 1.5rem;
        left: 1.5rem;
        z-index: 9990;
        font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-sizing: border-box;
      }
      #romeos-feedback-bubble-root * {
        box-sizing: border-box;
      }

      /* Floating Trigger Pill */
      .rfb-trigger-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.65rem 1.15rem;
        background: #b71c1c;
        color: #ffffff;
        border: 2px solid rgba(255, 255, 255, 0.25);
        border-radius: 9999px;
        font-size: 0.95rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        cursor: pointer;
        box-shadow: 0 4px 18px rgba(183, 28, 28, 0.45), 0 2px 6px rgba(0, 0, 0, 0.25);
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease, background-color 0.2s ease;
        outline: none;
        user-select: none;
        -webkit-
      }
      .rfb-trigger-btn:hover {
        transform: translateY(-2px) scale(1.03);
        background: #d32f2f;
        box-shadow: 0 8px 24px rgba(211, 47, 47, 0.55), 0 4px 10px rgba(0, 0, 0, 0.3);
      }
      .rfb-trigger-btn:active {
        transform: translateY(0) scale(0.98);
      }
      .rfb-trigger-btn:focus-visible {
        outline: 3px solid #ffca28;
        outline-offset: 3px;
      }

      .rfb-trigger-star {
        font-size: 1.1rem;
        color: #FFD700;
        filter: drop-shadow(0 0 4px rgba(255, 215, 0, 0.8));
        animation: rfb-star-pulse 3.5s infinite ease-in-out;
      }
      @keyframes rfb-star-pulse {
        0%, 100% { transform: scale(1) rotate(0deg); }
        50% { transform: scale(1.15) rotate(8deg); }
      }

      .rfb-badge {
        display: inline-block;
        padding: 0.15rem 0.45rem;
        background: #ffca28;
        color: #1a1a1a;
        font-size: 0.7rem;
        font-weight: 800;
        border-radius: 999px;
        line-height: 1;
        margin-left: 0.2rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      /* Popover Card */
      .rfb-popover-card {
        position: absolute;
        bottom: calc(100% + 0.75rem);
        left: 0;
        width: 360px;
        max-width: calc(100vw - 2.5rem);
        background: var(--rfb-card-bg, #ffffff);
        color: var(--rfb-text, #1f2937);
        border: 1px solid var(--rfb-border, #e5e7eb);
        border-radius: 1.15rem;
        box-shadow: 0 20px 40px -10px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(0, 0, 0, 0.06);
        padding: 1.25rem;
        opacity: 0;
        visibility: hidden;
        transform: translateY(12px) scale(0.96);
        transform-origin: bottom left;
        transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.22s;
        z-index: 9995;
      }
      .rfb-popover-card.rfb-open {
        opacity: 1;
        visibility: visible;
        transform: translateY(0) scale(1);
      }

      /* Dark Theme Overrides */
      :root[data-theme="dark"] #romeos-feedback-bubble-root,
      :root:not([data-theme="light"]) #romeos-feedback-bubble-root {
        --rfb-card-bg: #1c1d22;
        --rfb-text: #f4f4f6;
        --rfb-muted: #9ca3af;
        --rfb-border: #333640;
        --rfb-input-bg: #272832;
        --rfb-input-border: #3f4251;
        --rfb-chip-bg: #272832;
        --rfb-chip-border: #3f4251;
        --rfb-chip-hover: #333644;
      }
      :root[data-theme="light"] #romeos-feedback-bubble-root {
        --rfb-card-bg: #ffffff;
        --rfb-text: #1f2937;
        --rfb-muted: #6b7280;
        --rfb-border: #e5e7eb;
        --rfb-input-bg: #f9fafb;
        --rfb-input-border: #d1d5db;
        --rfb-chip-bg: #f3f4f6;
        --rfb-chip-border: #e5e7eb;
        --rfb-chip-hover: #e5e7eb;
      }
      @media (prefers-color-scheme: dark) {
        :root:not([data-theme]) #romeos-feedback-bubble-root {
          --rfb-card-bg: #1c1d22;
          --rfb-text: #f4f4f6;
          --rfb-muted: #9ca3af;
          --rfb-border: #333640;
          --rfb-input-bg: #272832;
          --rfb-input-border: #3f4251;
          --rfb-chip-bg: #272832;
          --rfb-chip-border: #3f4251;
          --rfb-chip-hover: #333644;
        }
      }

      /* Card Header */
      .rfb-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 0.9rem;
      }
      .rfb-title-group h3 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 800;
        color: var(--rfb-text, #1f2937);
        display: flex;
        align-items: center;
        gap: 0.35rem;
      }
      .rfb-title-group p {
        margin: 0.2rem 0 0;
        font-size: 0.8rem;
        color: var(--rfb-muted, #6b7280);
      }
      .rfb-close-btn {
        background: transparent;
        border: none;
        color: var(--rfb-muted, #6b7280);
        cursor: pointer;
        padding: 0.25rem;
        font-size: 1.1rem;
        border-radius: 0.4rem;
        line-height: 1;
        transition: color 0.15s, background-color 0.15s;
      }
      .rfb-close-btn:hover {
        color: #d32f2f;
        background: rgba(211, 47, 47, 0.1);
      }

      /* Star Rating Interactive Group */
      .rfb-stars-container {
        text-align: center;
        padding: 0.65rem 0.5rem;
        background: var(--rfb-input-bg, #f9fafb);
        border: 1px solid var(--rfb-border, #e5e7eb);
        border-radius: 0.85rem;
        margin-bottom: 0.85rem;
      }
      .rfb-stars-row {
        display: inline-flex;
        gap: 0.4rem;
      }
      .rfb-star-btn {
        background: transparent;
        border: none;
        padding: 0.2rem;
        cursor: pointer;
        font-size: 1.6rem;
        color: #d1d5db;
        transition: transform 0.15s ease, color 0.15s ease;
        line-height: 1;
      }
      .rfb-star-btn:hover {
        transform: scale(1.22);
      }
      .rfb-star-btn.rfb-active {
        color: #FFD700;
        filter: drop-shadow(0 0 5px rgba(255, 215, 0, 0.75));
      }
      .rfb-star-label {
        font-size: 0.8rem;
        font-weight: 600;
        margin-top: 0.35rem;
        color: var(--rfb-muted, #6b7280);
        min-height: 1.15rem;
      }

      /* Quick Tags */
      .rfb-tags-label {
        font-size: 0.78rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--rfb-muted, #6b7280);
        margin-bottom: 0.4rem;
      }
      .rfb-tags-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin-bottom: 0.85rem;
      }
      .rfb-tag-chip {
        background: var(--rfb-chip-bg, #f3f4f6);
        color: var(--rfb-text, #1f2937);
        border: 1px solid var(--rfb-chip-border, #e5e7eb);
        border-radius: 999px;
        padding: 0.35rem 0.65rem;
        font-size: 0.78rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        user-select: none;
      }
      .rfb-tag-chip:hover {
        background: var(--rfb-chip-hover, #e5e7eb);
      }
      .rfb-tag-chip.rfb-tag-selected {
        background: #b71c1c;
        color: #ffffff;
        border-color: #b71c1c;
        box-shadow: 0 2px 6px rgba(183, 28, 28, 0.35);
      }

      /* Textarea & Inputs */
      .rfb-field {
        margin-bottom: 0.65rem;
      }
      .rfb-textarea {
        width: 100%;
        min-height: 64px;
        max-height: 140px;
        padding: 0.55rem 0.75rem;
        background: var(--rfb-input-bg, #f9fafb);
        color: var(--rfb-text, #1f2937);
        border: 1px solid var(--rfb-input-border, #d1d5db);
        border-radius: 0.75rem;
        font-family: inherit;
        font-size: 0.85rem;
        line-height: 1.4;
        resize: vertical;
        outline: none;
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      .rfb-textarea:focus,
      .rfb-input:focus {
        border-color: #d32f2f;
        box-shadow: 0 0 0 3px rgba(211, 47, 47, 0.2);
      }

      .rfb-inputs-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.5rem;
        margin-bottom: 0.85rem;
      }
      .rfb-input {
        width: 100%;
        padding: 0.45rem 0.65rem;
        background: var(--rfb-input-bg, #f9fafb);
        color: var(--rfb-text, #1f2937);
        border: 1px solid var(--rfb-input-border, #d1d5db);
        border-radius: 0.65rem;
        font-family: inherit;
        font-size: 0.82rem;
        outline: none;
        transition: border-color 0.15s, box-shadow 0.15s;
      }

      /* Submit Button */
      .rfb-submit-btn {
        width: 100%;
        padding: 0.65rem 1rem;
        background: #b71c1c;
        color: #ffffff;
        border: none;
        border-radius: 0.75rem;
        font-size: 0.92rem;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        box-shadow: 0 4px 12px rgba(183, 28, 28, 0.35);
        transition: background-color 0.15s, transform 0.15s;
      }
      .rfb-submit-btn:hover:not(:disabled) {
        background: #d32f2f;
        transform: translateY(-1px);
      }
      .rfb-submit-btn:active:not(:disabled) {
        transform: translateY(0);
      }
      .rfb-submit-btn:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }

      .rfb-error-alert {
        padding: 0.5rem 0.75rem;
        background: #fee2e2;
        color: #991b1b;
        border-radius: 0.65rem;
        font-size: 0.8rem;
        margin-bottom: 0.65rem;
        display: none;
      }
      :root[data-theme="dark"] .rfb-error-alert,
      :root:not([data-theme="light"]) .rfb-error-alert {
        background: #450a0a;
        color: #fca5a5;
      }

      /* Animated Success State */
      .rfb-success-view {
        text-align: center;
        padding: 1.5rem 0.5rem;
        display: none;
      }
      .rfb-checkmark-wrap {
        width: 64px;
        height: 64px;
        margin: 0 auto 0.75rem;
        border-radius: 50%;
        background: #10b981;
        color: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2.2rem;
        box-shadow: 0 0 20px rgba(16, 185, 129, 0.5);
        animation: rfb-bounce-in 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      @keyframes rfb-bounce-in {
        0% { transform: scale(0.3); opacity: 0; }
        60% { transform: scale(1.15); opacity: 1; }
        100% { transform: scale(1); }
      }
      .rfb-success-view h4 {
        margin: 0 0 0.35rem;
        font-size: 1.15rem;
        font-weight: 800;
        color: var(--rfb-text, #1f2937);
      }
      .rfb-success-view p {
        margin: 0;
        font-size: 0.85rem;
        color: var(--rfb-muted, #6b7280);
      }

      @media (max-width: 480px) {
        #romeos-feedback-bubble-root {
          bottom: 1rem;
          left: 1rem;
        }
        .rfb-popover-card {
          width: calc(100vw - 2rem);
          max-width: 350px;
        }
      }
    `;
    document.head.appendChild(styleEl);
  }

  function createFeedbackWidget() {
    injectStyles();

    const root = document.createElement("div");
    root.id = "romeos-feedback-bubble-root";

    root.innerHTML = `
      <div id="rfb-popover"class="rfb-popover-card"role="dialog"aria-modal="true"aria-labelledby="rfb-title">
        <div id="rfb-form-view">
          <div class="rfb-header">
            <div class="rfb-title-group">
              <h3 id="rfb-title">Customer Feedback</h3>
              <p>Help us keep Coldberry Ice Cream fresh, rich &amp; creamy!</p>
            </div>
            <button type="button"class="rfb-close-btn"id="rfb-close-btn"aria-label="Close feedback window">
              <i class="fa-solid fa-xmark"aria-hidden="true"></i>
            </button>
          </div>

          <div id="rfb-error"class="rfb-error-alert"role="alert"></div>

          <!-- Feedback vs Complaint Switcher -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.4rem;margin-bottom:0.75rem;"role="tablist"aria-label="Feedback type">
            <button type="button"id="rfb-mode-feedback"data-rfb-mode="feedback"aria-selected="true"style="padding:0.45rem;border-radius:8px;border:1px solid var(--rfb-border,#e5e7eb);background:#ff5733;color:#fff;font-weight:700;font-size:0.8rem;cursor:pointer;">⭐ Sweet Review</button>
            <button type="button"id="rfb-mode-complaint"data-rfb-mode="complaint"aria-selected="false"style="padding:0.45rem;border-radius:8px;border:1px solid var(--rfb-border,#e5e7eb);background:var(--rfb-chip-bg,#f3f4f6);color:var(--rfb-text,#1f2937);font-weight:700;font-size:0.8rem;cursor:pointer;"> Scoop Issue</button>
          </div>

          <!-- Interactive Star Rating -->
          <div class="rfb-stars-container">
            <div class="rfb-stars-row"id="rfb-stars-row"role="radiogroup"aria-label="Rating out of 5 stars">
              <button type="button"class="rfb-star-btn"data-star="1"aria-label="1 star"><i class="fa-solid fa-star"aria-hidden="true"></i></button>
              <button type="button"class="rfb-star-btn"data-star="2"aria-label="2 stars"><i class="fa-solid fa-star"aria-hidden="true"></i></button>
              <button type="button"class="rfb-star-btn"data-star="3"aria-label="3 stars"><i class="fa-solid fa-star"aria-hidden="true"></i></button>
              <button type="button"class="rfb-star-btn"data-star="4"aria-label="4 stars"><i class="fa-solid fa-star"aria-hidden="true"></i></button>
              <button type="button"class="rfb-star-btn"data-star="5"aria-label="5 stars"><i class="fa-solid fa-star"aria-hidden="true"></i></button>
            </div>
            <div class="rfb-star-label"id="rfb-star-label">Tap a star to rate</div>
          </div>

          <!-- Quick Tags -->
          <div class="rfb-tags-label">Quick Flavour &amp; Delivery Tags:</div>
          <div class="rfb-tags-grid"id="rfb-tags-grid">
            ${QUICK_TAGS.map(tag => `<button type="button"class="rfb-tag-chip"data-tag="${tag}">${tag}</button>`).join("")}
          </div>

          <!-- Textarea Comments -->
          <div class="rfb-field">
            <textarea id="rfb-comments"class="rfb-textarea"rows="3"maxlength="1000"placeholder="Tell us how your ice cream scoops or delivery were..."></textarea>
          </div>

          <!-- Customer Name & Optional Order PIN -->
          <div class="rfb-inputs-row">
            <input type="text"id="rfb-name"class="rfb-input"placeholder="Your name (optional)"maxlength="100"autocomplete="name" />
            <input type="text"id="rfb-pin"class="rfb-input"placeholder="Order PIN (optional)"maxlength="6"inputmode="numeric"pattern="[0-9]*" />
          </div>

          <!-- Submit Button -->
          <button type="button"id="rfb-submit-btn"class="rfb-submit-btn">
            <span>Send Ice Cream Feedback</span> 
          </button>
        </div>

        <!-- Thank-You Animated Confirmation -->
        <div id="rfb-success-view"class="rfb-success-view">
          <div class="rfb-checkmark-wrap">
            <i class="fa-solid fa-check"aria-hidden="true"></i>
          </div>
          <h4>Thank You!</h4>
          <p>Your feedback was received and synced directly to our creamery &amp; couriers. We appreciate you!</p>
        </div>
      </div>

      <!-- Trigger Bubble Button -->
      <button type="button"id="rfb-trigger"class="rfb-trigger-btn"aria-haspopup="dialog"aria-expanded="false"aria-label="Open client feedback form">
        <i class="fa-solid fa-star rfb-trigger-star"style="color: #FFD700;"aria-hidden="true"></i>
        <span>Feedback</span>
        <span class="rfb-badge"style="background:#db2777;color:#fff;">Chilled</span>
      </button>
    `;

    document.body.appendChild(root);

    // State
    let selectedRating = 0;
    let feedbackMode = "feedback";
    const selectedTags = new Set();
    let isOpen = false;

    // Elements
    const triggerBtn = root.querySelector("#rfb-trigger");
    const popover = root.querySelector("#rfb-popover");
    const closeBtn = root.querySelector("#rfb-close-btn");
    const formView = root.querySelector("#rfb-form-view");
    const successView = root.querySelector("#rfb-success-view");
    const starBtns = root.querySelectorAll(".rfb-star-btn");
    const starLabel = root.querySelector("#rfb-star-label");
    const tagsGrid = root.querySelector("#rfb-tags-grid");
    const modeFeedbackBtn = root.querySelector("#rfb-mode-feedback");
    const modeComplaintBtn = root.querySelector("#rfb-mode-complaint");
    let tagChips = root.querySelectorAll(".rfb-tag-chip");
    const commentsInput = root.querySelector("#rfb-comments");
    const nameInput = root.querySelector("#rfb-name");
    const pinInput = root.querySelector("#rfb-pin");
    const submitBtn = root.querySelector("#rfb-submit-btn");
    const errorAlert = root.querySelector("#rfb-error");

    function bindTagChips() {
      tagChips = root.querySelectorAll(".rfb-tag-chip");
      tagChips.forEach((chip) => {
        chip.addEventListener("click", () => {
          const t = chip.dataset.tag;
          if (selectedTags.has(t)) {
            selectedTags.delete(t);
            chip.classList.remove("rfb-tag-selected");
          } else {
            selectedTags.add(t);
            chip.classList.add("rfb-tag-selected");
          }
        });
      });
    }

    function setFeedbackMode(mode) {
      feedbackMode = mode === "complaint" ? "complaint" : "feedback";
      const isComplaint = feedbackMode === "complaint";
      modeFeedbackBtn.setAttribute("aria-selected", isComplaint ? "false" : "true");
      modeComplaintBtn.setAttribute("aria-selected", isComplaint ? "true" : "false");
      modeFeedbackBtn.style.background = isComplaint ? "var(--rfb-chip-bg,#f3f4f6)" : "#ff5733";
      modeFeedbackBtn.style.color = isComplaint ? "var(--rfb-text,#1f2937)" : "#fff";
      modeComplaintBtn.style.background = isComplaint ? "#dc3545" : "var(--rfb-chip-bg,#f3f4f6)";
      modeComplaintBtn.style.color = isComplaint ? "#fff" : "var(--rfb-text,#1f2937)";
      selectedTags.clear();
      const activeList = isComplaint ? COMPLAINT_TAGS : QUICK_TAGS;
      tagsGrid.innerHTML = activeList.map((tag) => `<button type="button"class="rfb-tag-chip"data-tag="${tag}">${tag}</button>`).join("");
      bindTagChips();
      commentsInput.placeholder = isComplaint
        ? "Describe your complaint (melted scoop, missing cone, delay, refund, etc.)..."
        : "Tell us how your ice cream scoops or delivery were...";
      submitBtn.innerHTML = isComplaint ? `<span>Submit Complaint</span> ` : `<span>Send Feedback</span> `;
    }

    modeFeedbackBtn.addEventListener("click", () => setFeedbackMode("feedback"));
    modeComplaintBtn.addEventListener("click", () => setFeedbackMode("complaint"));

    // Pre-populate Customer Name and Order PIN
    function refreshAutoFill() {
      const data = getAutoFillData();
      if (data.name && !nameInput.value) {
        nameInput.value = data.name;
      }
      if (data.pin && !pinInput.value) {
        pinInput.value = data.pin;
      }
    }

    // Toggle popover
    function openPopover() {
      refreshAutoFill();
      popover.classList.add("rfb-open");
      triggerBtn.setAttribute("aria-expanded", "true");
      isOpen = true;
    }

    function closePopover() {
      popover.classList.remove("rfb-open");
      triggerBtn.setAttribute("aria-expanded", "false");
      isOpen = false;
    }

    triggerBtn.addEventListener("click", () => {
      if (isOpen) {
        closePopover();
      } else {
        openPopover();
      }
    });

    closeBtn.addEventListener("click", closePopover);

    // Close on click outside
    document.addEventListener("click", (e) => {
      if (isOpen && !root.contains(e.target)) {
        closePopover();
      }
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
      if (isOpen && e.key === "Escape") {
        closePopover();
      }
    });

    // Star rating hover & click interactions
    function updateStarVisuals(highlightUpTo) {
      starBtns.forEach((btn) => {
        const star = Number(btn.dataset.star);
        if (star <= highlightUpTo) {
          btn.classList.add("rfb-active");
        } else {
          btn.classList.remove("rfb-active");
        }
      });
      starLabel.textContent = RATING_DESCRIPTIONS[highlightUpTo] || RATING_DESCRIPTIONS[0];
    }

    starBtns.forEach((btn) => {
      const star = Number(btn.dataset.star);

      btn.addEventListener("mouseenter", () => {
        updateStarVisuals(star);
      });

      btn.addEventListener("click", () => {
        selectedRating = star;
        updateStarVisuals(star);
        errorAlert.style.display = "none";
      });
    });

    const starsRow = root.querySelector("#rfb-stars-row");
    starsRow.addEventListener("mouseleave", () => {
      updateStarVisuals(selectedRating);
    });

    // Quick tags multi-select
    tagChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const tag = chip.dataset.tag;
        if (selectedTags.has(tag)) {
          selectedTags.delete(tag);
          chip.classList.remove("rfb-tag-selected");
        } else {
          selectedTags.add(tag);
          chip.classList.add("rfb-tag-selected");
        }
      });
    });

    // Only allow digits in order PIN field
    pinInput.addEventListener("input", () => {
      pinInput.value = pinInput.value.replace(/\D/g, "").slice(0, 6);
    });

    // Form submission
    submitBtn.addEventListener("click", async () => {
      if (!selectedRating || selectedRating < 1 || selectedRating > 5) {
        errorAlert.textContent = "Please select a star rating (1 to 5 stars).";
        errorAlert.style.display = "block";
        return;
      }

      errorAlert.style.display = "none";
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span>Sending...</span> <i class="fa-solid fa-spinner fa-spin">⏳</i>`;

      const payload = {
        rating: selectedRating,
        customer_name: (nameInput.value || "").trim() || "Customer",
        order_pin: (pinInput.value || "").trim() || null,
        tags: Array.from(selectedTags),
        comments: (commentsInput.value || "").trim(),
        feedback_type: feedbackMode,
        source: "web_bubble"
      };

      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || "Unable to save feedback at this moment.");
        }

        // Remember name and PIN locally for convenience
        if (typeof localStorage !== "undefined") {
          try {
            if (payload.customer_name && payload.customer_name !== "Customer") {
              localStorage.setItem("romeos_customer_name", payload.customer_name);
            }
            if (payload.order_pin) {
              localStorage.setItem("romeos_last_order_pin", payload.order_pin);
            }
          } catch (_) {}
        }

        // Show animated thank-you view
        formView.style.display = "none";
        successView.style.display = "block";

        // Auto close after 2.8 seconds and reset for next time
        setTimeout(() => {
          closePopover();
          setTimeout(() => {
            // Reset form view
            formView.style.display = "block";
            successView.style.display = "none";
            selectedRating = 0;
            selectedTags.clear();
            tagChips.forEach(c => c.classList.remove("rfb-tag-selected"));
            updateStarVisuals(0);
            commentsInput.value = "";
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>Send Feedback</span> `;
          }, 300);
        }, 2800);

      } catch (err) {
        errorAlert.textContent = err.message || "Failed to send feedback. Please try again.";
        errorAlert.style.display = "block";
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>Send Feedback</span> `;
      }
    });
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createFeedbackWidget);
  } else {
    createFeedbackWidget();
  }
})();

/* Customer Account, Profile Icon & Refund Notification UI for Romeo's Pizza Nigeria */
(function () {
  if (typeof window === "undefined" || window.__romeosAuthUiLoaded) return;
  window.__romeosAuthUiLoaded = true;

  const AVATARS = [
    { id: "pizza", label: "Scoop", icon: "fa-ice-cream" },
    { id: "crown", label: "VIP", icon: "fa-crown" },
    { id: "fire", label: "Berry", icon: "fa-leaf" },
    { id: "rocket", label: "Express", icon: "fa-bolt" },
    { id: "cool", label: "Chill", icon: "fa-glasses" },
    { id: "star", label: "Star", icon: "fa-star" },
    { id: "rider", label: "Rider", icon: "fa-motorcycle" },
    { id: "heart", label: "Classic", icon: "fa-heart" },
  ];
  function avatarHtml(iconId) {
    const found = AVATARS.find((a) => a.id === iconId) || AVATARS[0];
    return `<i class="fa-solid ${found.icon}" aria-hidden="true"></i>`;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function injectStyles() {
    if (document.getElementById("romeos-auth-ui-styles")) return;
    const style = document.createElement("style");
    style.id = "romeos-auth-ui-styles";
    style.textContent = `
      .nav-auth-btn {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        padding: 0.45rem 0.95rem;
        border-radius: 6px;
        border: 1px solid #8C1D40;
        background: #8C1D40;
        color: #ffffff;
        font-weight: 700;
        font-size: 0.86rem;
        text-decoration: none;
        cursor: pointer;
        position: relative;
        white-space: nowrap;
        transition: transform 0.15s ease, background 0.15s ease;
      }
      .nav-auth-btn:hover { transform: translateY(-1px); background: #6F1632; border-color: #6F1632; }
      :root[data-theme="dark"] .nav-auth-btn { border-color: #f472b6; background: #8C1D40; color: #ffffff; }
      .nav-auth-avatar {
        width: 24px; height: 24px; border-radius: 50%;
        display: inline-flex; align-items: center; justify-content: center;
        background: #8C1D40; color: #fff; font-size: 0.85rem; line-height: 1;
      }
      .nav-refund-dot {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 18px; height: 18px; padding: 0 5px;
        border-radius: 6px; background: #198754; color: #fff;
        font-size: 0.7rem; font-weight: 800;
      }
      .auth-drawer-backdrop {
        position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 10020; display: flex; justify-content: flex-end;
      }
      .auth-drawer {
        width: min(420px, 95vw); height: 100%; overflow-y: auto;
        background: #fff; color: #1c1216; padding: 1.35rem;
        box-shadow: -8px 0 32px rgba(0,0,0,0.3);
        display: flex; flex-direction: column; gap: 1rem;
      }
      :root[data-theme="dark"] .auth-drawer { background: #1e161b; color: #faf6f2; }
      .auth-avatar-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; }
      .auth-avatar-opt {
        border: 1px solid rgba(128,128,128,0.28); border-radius: 6px;
        background: transparent; color: inherit; padding: 0.5rem 0.25rem;
        cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 0.2rem;
        font-size: 0.72rem; font-weight: 600;
      }
      .auth-avatar-opt[aria-pressed="true"] {
        border-color: #8C1D40; background: rgba(255, 87, 51, 0.14);
      }
      .auth-drawer-card {
        border: 1px solid rgba(128,128,128,0.22); border-radius: 6px; padding: 0.85rem;
        background: rgba(128,128,128,0.05);
      }
      .auth-refund-alert {
        border: 2px solid #20c997; border-radius: 6px; padding: 0.9rem;
        background: rgba(32, 201, 151, 0.12);
      }
    `;
    document.head.appendChild(style);
  }

  function prefillOrderForm(user) {
    if (!user) return;
    try {
      if (user.fullName) localStorage.setItem("romeos_customer_name", user.fullName);
      if (user.phone) localStorage.setItem("romeos_customer_phone", user.phone);
    } catch (_) {}

    const nameEl = document.getElementById("customer-name");
    const phoneEl = document.getElementById("customer-phone");
    const locEl = document.getElementById("location");
    const addrEl = document.getElementById("address");
    if (nameEl && !nameEl.value) nameEl.value = user.fullName || "";
    if (phoneEl && !phoneEl.value) phoneEl.value = user.phone || "";
    if (locEl && !locEl.value && user.defaultLocation) locEl.value = user.defaultLocation;
    if (addrEl && !addrEl.value && user.defaultAddress) addrEl.value = user.defaultAddress;
  }

  function openAccountDrawer(state) {
    const existing = document.getElementById("romeos-account-drawer");
    if (existing) existing.remove();

    const user = state.user;
    const refunds = state.refunds || [];
    const orders = state.orders || [];
    const messages = state.messages || [];

    const backdrop = document.createElement("div");
    backdrop.id = "romeos-account-drawer";
    backdrop.className = "auth-drawer-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "Customer Account");

    const messagesHtml = messages.length
      ? messages
          .slice(0, 8)
          .map(
            (m) => `
          <div class="auth-drawer-card" style="margin-bottom:0.55rem;border:1px solid rgba(184, 58, 27, 0.35);">
            <div style="display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:0.86rem;">
              <span><i class="fa-solid fa-envelope"></i> ${esc(m.title || "Message from Romeo's Pizza")}</span>
              <span style="font-size:0.72rem;opacity:0.7;">${m.recipient_username === "ALL" ? "Broadcast" : "Direct"}</span>
            </div>
            <div style="font-size:0.84rem;margin-top:0.3rem;line-height:1.45;">${esc(m.body)}</div>
            <div style="font-size:0.72rem;opacity:0.65;margin-top:0.3rem;">${new Date(m.created_at).toLocaleString()}</div>
          </div>`
          )
          .join("")
      : `<div style="font-size:0.84rem;opacity:0.75;">No messages from Romeo's Pizza yet.</div>`;

    const refundsHtml = refunds.length
      ? refunds
          .map(
            (r) => `
          <div class="auth-refund-alert" style="margin-bottom:0.65rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;font-weight:800;color:#20c997;font-size:0.88rem;">
              <span><i class="fa-solid fa-ticket"></i> ${r.status === "claimed" ? "Refund Claimed" : "Refund Available"}</span>
              <span>₦${Number(r.amount || 0).toLocaleString("en-NG")}</span>
            </div>
            <div style="font-family:monospace;font-size:1.1rem;font-weight:900;letter-spacing:0.1em;margin:0.35rem 0;">${esc(r.token)}</div>
            <div style="font-size:0.78rem;opacity:0.85;margin-bottom:0.45rem;">Order: ${esc(r.orderId || "")} · ${esc(r.reason || "")}</div>
            <div style="display:flex;gap:0.45rem;flex-wrap:wrap;">
              <button type="button" data-copy-refund="${esc(r.token)}" style="padding:0.3rem 0.65rem;border-radius:6px;border:1px solid #20c997;background:transparent;color:inherit;font-size:0.78rem;font-weight:700;cursor:pointer;">Copy Token</button>
              <a href="https://wa.me/2349055303848?text=${encodeURIComponent("Hello Romeo's Pizza, I would like to claim my refund token " + r.token + " (₦" + Number(r.amount || 0).toLocaleString("en-NG") + ").")}" target="_blank" rel="noopener noreferrer" style="padding:0.3rem 0.65rem;border-radius:6px;background:#25d366;color:#fff;text-decoration:none;font-size:0.78rem;font-weight:700;">Claim on WhatsApp</a>
            </div>
          </div>`
          )
          .join("")
      : `<div style="font-size:0.84rem;opacity:0.75;">No refund tokens on your account.</div>`;

    const ordersHtml = orders.length
      ? orders
          .slice(0, 6)
          .map(
            (o) => `
          <div class="auth-drawer-card" style="margin-bottom:0.5rem;font-size:0.84rem;">
            <div style="display:flex;justify-content:space-between;font-weight:700;">
              <span>PIN: ${esc(o.order_pin || "—")}</span>
              <span style="text-transform:uppercase;color:#8C1D40;">${esc((o.status || "pending").replace(/_/g, " "))}</span>
            </div>
            <div style="opacity:0.85;margin-top:0.2rem;">${esc(o.items || "")}</div>
            ${o.order_pin ? `<a href="track.html?phone=${encodeURIComponent(user.phone)}&pin=${encodeURIComponent(o.order_pin)}" style="display:inline-block;margin-top:0.3rem;font-size:0.78rem;color:#8C1D40;font-weight:700;">Track Order →</a>` : ""}
          </div>`
          )
          .join("")
      : `<div style="font-size:0.84rem;opacity:0.75;">No orders placed on this account yet.</div>`;

    backdrop.innerHTML = `
      <div class="auth-drawer">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(128,128,128,0.2);padding-bottom:0.75rem;">
          <div style="display:flex;align-items:center;gap:0.6rem;">
            <span class="nav-auth-avatar" style="width:38px;height:38px;font-size:1.3rem;" id="drawer-avatar-preview">${avatarHtml(user.avatarIcon)}</span>
            <div>
              <div style="font-weight:800;font-size:1.05rem;">@${esc(user.username)}</div>
              <div style="font-size:0.8rem;opacity:0.75;">${esc(user.fullName)} · ${esc(user.phone)}</div>
            </div>
          </div>
          <button type="button" id="close-auth-drawer" aria-label="Close account panel" style="background:transparent;border:none;color:inherit;font-size:1.4rem;cursor:pointer;">&times;</button>
        </div>

        <div>
          <div style="font-weight:700;font-size:0.85rem;margin-bottom:0.45rem;">Choose Your Profile Icon</div>
          <div class="auth-avatar-grid">
            ${AVATARS.map(
              (a) => `
              <button type="button" class="auth-avatar-opt" data-avatar-pick="${a.id}" aria-pressed="${a.id === user.avatarIcon ? "true" : "false"}">
                <i class="fa-solid ${a.icon}" style="font-size:1.1rem;" aria-hidden="true"></i>
                <span>${a.label}</span>
              </button>`
            ).join("")}
          </div>
        </div>

        <div>
          <div style="font-weight:800;font-size:0.92rem;margin-bottom:0.45rem;">Messages from Romeo's Pizza (${messages.length})</div>
          ${messagesHtml}
        </div>

        <div>
          <div style="font-weight:800;font-size:0.92rem;margin-bottom:0.45rem;">Refund Notifications (${refunds.length})</div>
          ${refundsHtml}
        </div>

        <div>
          <div style="font-weight:800;font-size:0.92rem;margin-bottom:0.45rem;">Recent Orders (${orders.length})</div>
          ${ordersHtml}
        </div>

        <button type="button" id="auth-signout-btn" style="margin-top:auto;padding:0.75rem;border-radius: 6px;border:1px solid #dc3545;background:rgba(220,53,69,0.12);color:#dc3545;font-weight:800;cursor:pointer;">
          <i class="fa-solid fa-right-from-bracket"></i> Sign Out
        </button>
      </div>
    `;

    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) backdrop.remove();
    });
    document.getElementById("close-auth-drawer").onclick = () => backdrop.remove();

    backdrop.querySelectorAll("[data-copy-refund]").forEach((btn) => {
      btn.onclick = () => {
        const tok = btn.dataset.copyRefund;
        if (navigator.clipboard) navigator.clipboard.writeText(tok).catch(() => {});
        btn.textContent = "Copied";
        setTimeout(() => { btn.textContent = "Copy Token"; }, 1800);
      };
    });

    backdrop.querySelectorAll("[data-avatar-pick]").forEach((btn) => {
      btn.onclick = async () => {
        const iconId = btn.dataset.avatarPick;
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_profile", avatarIcon: iconId }),
        }).catch(() => null);
        if (res && res.ok) {
          const data = await res.json();
          state.user = data.user;
          document.getElementById("drawer-avatar-preview").innerHTML = avatarHtml(data.user.avatarIcon);
          backdrop.querySelectorAll("[data-avatar-pick]").forEach((b) => {
            b.setAttribute("aria-pressed", b.dataset.avatarPick === iconId ? "true" : "false");
          });
          renderNavAuthButton(state);
        }
      };
    });

    document.getElementById("auth-signout-btn").onclick = async () => {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      }).catch(() => {});
      backdrop.remove();
      renderNavAuthButton({ authenticated: false });
    };
  }

  function renderNavAuthButton(state) {
    const header = document.querySelector("header.nav-bar");
    if (!header) return;
    let btn = document.getElementById("nav-auth-btn");
    if (!btn) {
      btn = document.createElement(state?.authenticated ? "button" : "a");
      btn.id = "nav-auth-btn";
      btn.className = "nav-auth-btn";
      const themeBtn = header.querySelector("#theme-toggle");
      if (themeBtn) header.insertBefore(btn, themeBtn);
      else header.appendChild(btn);
    }

    if (state && state.authenticated && state.user) {
      if (btn.tagName !== "BUTTON") {
        const replacement = document.createElement("button");
        replacement.type = "button";
        replacement.id = "nav-auth-btn";
        replacement.className = "nav-auth-btn";
        btn.replaceWith(replacement);
        btn = replacement;
      }
      const unclaimedCount = (state.refunds || []).filter((r) => r.status !== "claimed").length;
      const alertCount = unclaimedCount + (state.messages || []).length;
      btn.innerHTML = `
        <span class="nav-auth-avatar">${avatarHtml(state.user.avatarIcon)}</span>
        <span>@${esc(state.user.username)}</span>
        ${alertCount > 0 ? `<span class="nav-refund-dot" title="${unclaimedCount} refund(s), ${(state.messages || []).length} message(s)">${alertCount}</span>` : ""}
      `;
      btn.onclick = () => openAccountDrawer(state);
      prefillOrderForm(state.user);
    } else {
      if (btn.tagName !== "A") {
        const replacement = document.createElement("a");
        replacement.id = "nav-auth-btn";
        replacement.className = "nav-auth-btn";
        btn.replaceWith(replacement);
        btn = replacement;
      }
      btn.href = `login.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
      btn.innerHTML = `<i class="fa-solid fa-user-circle" aria-hidden="true"></i><span>Sign In</span>`;
      btn.onclick = null;
    }
  }

  async function initAuthUi() {
    injectStyles();
    try {
      const res = await fetch("/api/auth", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) return renderNavAuthButton({ authenticated: false });
      const data = await res.json();
      window.__romeosCurrentUser = data.authenticated ? data.user : null;
      renderNavAuthButton(data);
    } catch (_) {
      renderNavAuthButton({ authenticated: false });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAuthUi);
  } else {
    initAuthUi();
  }
})();

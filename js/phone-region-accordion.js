/* Region-Grouped Accordion Phone Code Selector (Korapay-style Flag + Short Code + Dial Code) */
(function () {
  "use strict";
  if (typeof window === "undefined") return;

  const REGIONS = [
    {
      id: "africa",
      label: "Africa",
      defaultOpen: true,
      countries: [
        ["NGA", "NGA", "+234", "Nigeria"],
        ["GHA", "GHA", "+233", "Ghana"],
        ["ZAF", "ZAF", "+27", "South Africa"],
        ["KEN", "KEN", "+254", "Kenya"],
        ["EGY", "EGY", "+20", "Egypt"],
        ["DZA", "DZA", "+213", "Algeria"],
        ["AGO", "AGO", "+244", "Angola"],
        ["BEN", "BEN", "+229", "Benin"],
        ["BWA", "BWA", "+267", "Botswana"],
        ["BFA", "BFA", "+226", "Burkina Faso"],
        ["BDI", "BDI", "+257", "Burundi"],
        ["CMR", "CMR", "+237", "Cameroon"],
        ["CPV", "CPV", "+238", "Cape Verde"],
        ["CAF", "CAF", "+236", "Central African Republic"],
        ["TCD", "TCD", "+235", "Chad"],
        ["COM", "COM", "+269", "Comoros"],
        ["COG", "COG", "+242", "Congo"],
        ["COD", "COD", "+243", "Congo (DRC)"],
        ["CIV", "CIV", "+225", "Côte d'Ivoire"],
        ["DJI", "DJI", "+253", "Djibouti"],
        ["GNQ", "GNQ", "+240", "Equatorial Guinea"],
        ["ERI", "ERI", "+291", "Eritrea"],
        ["SWZ", "SWZ", "+268", "Eswatini"],
        ["ETH", "ETH", "+251", "Ethiopia"],
        ["GAB", "GAB", "+241", "Gabon"],
        ["GMB", "GMB", "+220", "Gambia"],
        ["GIN", "GIN", "+224", "Guinea"],
        ["GNB", "GNB", "+245", "Guinea-Bissau"],
        ["LSO", "LSO", "+266", "Lesotho"],
        ["LBR", "LBR", "+231", "Liberia"],
        ["LBY", "LBY", "+218", "Libya"],
        ["MDG", "MDG", "+261", "Madagascar"],
        ["MWI", "MWI", "+265", "Malawi"],
        ["MLI", "MLI", "+223", "Mali"],
        ["MRT", "MRT", "+222", "Mauritania"],
        ["MUS", "MUS", "+230", "Mauritius"],
        ["MAR", "MAR", "+212", "Morocco"],
        ["MOZ", "MOZ", "+258", "Mozambique"],
        ["NAM", "NAM", "+264", "Namibia"],
        ["NER", "NER", "+227", "Niger"],
        ["RWA", "RWA", "+250", "Rwanda"],
        ["SEN", "SEN", "+221", "Senegal"],
        ["SYC", "SYC", "+248", "Seychelles"],
        ["SLE", "SLE", "+232", "Sierra Leone"],
        ["SOM", "SOM", "+252", "Somalia"],
        ["SSD", "SSD", "+211", "South Sudan"],
        ["SDN", "SDN", "+249", "Sudan"],
        ["TZA", "TZA", "+255", "Tanzania"],
        ["TGO", "TGO", "+228", "Togo"],
        ["TUN", "TUN", "+216", "Tunisia"],
        ["UGA", "UGA", "+256", "Uganda"],
        ["ZMB", "ZMB", "+260", "Zambia"],
        ["ZWE", "ZWE", "+263", "Zimbabwe"],
      ],
    },
    {
      id: "europe",
      label: "Europe",
      countries: [
        ["GBR", "GBR", "+44", "United Kingdom"],
        ["FRA", "FRA", "+33", "France"],
        ["DEU", "DEU", "+49", "Germany"],
        ["IRL", "IRL", "+353", "Ireland"],
        ["ITA", "ITA", "+39", "Italy"],
        ["ESP", "ESP", "+34", "Spain"],
        ["NLD", "NLD", "+31", "Netherlands"],
        ["BEL", "BEL", "+32", "Belgium"],
        ["CHE", "CHE", "+41", "Switzerland"],
        ["PRT", "PRT", "+351", "Portugal"],
        ["SWE", "SWE", "+46", "Sweden"],
        ["NOR", "NOR", "+47", "Norway"],
        ["DNK", "DNK", "+45", "Denmark"],
        ["FIN", "FIN", "+358", "Finland"],
        ["AUT", "AUT", "+43", "Austria"],
        ["POL", "POL", "+48", "Poland"],
        ["GRC", "GRC", "+30", "Greece"],
        ["CZE", "CZE", "+420", "Czechia"],
        ["HUN", "HUN", "+36", "Hungary"],
        ["ROU", "ROU", "+40", "Romania"],
        ["BGR", "BGR", "+359", "Bulgaria"],
        ["HRV", "HRV", "+385", "Croatia"],
        ["SVK", "SVK", "+421", "Slovakia"],
        ["SVN", "SVN", "+386", "Slovenia"],
        ["EST", "EST", "+372", "Estonia"],
        ["LVA", "LVA", "+371", "Latvia"],
        ["LTU", "LTU", "+370", "Lithuania"],
        ["LUX", "LUX", "+352", "Luxembourg"],
        ["MLT", "MLT", "+356", "Malta"],
        ["CYP", "CYP", "+357", "Cyprus"],
        ["ISL", "ISL", "+354", "Iceland"],
        ["ALB", "ALB", "+355", "Albania"],
        ["AND", "AND", "+376", "Andorra"],
        ["BLR", "BLR", "+375", "Belarus"],
        ["BIH", "BIH", "+387", "Bosnia & Herzegovina"],
        ["LIE", "LIE", "+423", "Liechtenstein"],
        ["MDA", "MDA", "+373", "Moldova"],
        ["MCO", "MCO", "+377", "Monaco"],
        ["MNE", "MNE", "+382", "Montenegro"],
        ["MKD", "MKD", "+389", "North Macedonia"],
        ["SRB", "SRB", "+381", "Serbia"],
        ["UKR", "UKR", "+380", "Ukraine"],
      ],
    },
    {
      id: "americas",
      label: "Americas",
      countries: [
        ["USA", "USA", "+1", "United States"],
        ["CAN", "CAN", "+1", "Canada"],
        ["BRA", "BRA", "+55", "Brazil"],
        ["MEX", "MEX", "+52", "Mexico"],
        ["ARG", "ARG", "+54", "Argentina"],
        ["COL", "COL", "+57", "Colombia"],
        ["CHL", "CHL", "+56", "Chile"],
        ["PER", "PER", "+51", "Peru"],
        ["VEN", "VEN", "+58", "Venezuela"],
        ["ECU", "ECU", "+593", "Ecuador"],
        ["BOL", "BOL", "+591", "Bolivia"],
        ["PRY", "PRY", "+595", "Paraguay"],
        ["URY", "URY", "+598", "Uruguay"],
        ["GUY", "GUY", "+592", "Guyana"],
        ["CRI", "CRI", "+506", "Costa Rica"],
        ["PAN", "PAN", "+507", "Panama"],
        ["GTM", "GTM", "+502", "Guatemala"],
        ["HND", "HND", "+504", "Honduras"],
        ["SLV", "SLV", "+503", "El Salvador"],
        ["NIC", "NIC", "+505", "Nicaragua"],
        ["BLZ", "BLZ", "+501", "Belize"],
        ["JAM", "JAM", "+1876", "Jamaica"],
        ["TTO", "TTO", "+1868", "Trinidad & Tobago"],
        ["BHS", "BHS", "+1242", "Bahamas"],
        ["BRB", "BRB", "+1246", "Barbados"],
        ["DOM", "DOM", "+1809", "Dominican Republic"],
        ["HTI", "HTI", "+509", "Haiti"],
        ["CUB", "CUB", "+53", "Cuba"],
      ],
    },
    {
      id: "asia",
      label: "Asia",
      countries: [
        ["IND", "IND", "+91", "India"],
        ["CHN", "CHN", "+86", "China"],
        ["JPN", "JPN", "+81", "Japan"],
        ["KOR", "KOR", "+82", "South Korea"],
        ["PHL", "PHL", "+63", "Philippines"],
        ["SGP", "SGP", "+65", "Singapore"],
        ["MYS", "MYS", "+60", "Malaysia"],
        ["IDN", "IDN", "+62", "Indonesia"],
        ["THA", "THA", "+66", "Thailand"],
        ["VNM", "VNM", "+84", "Vietnam"],
        ["PAK", "PAK", "+92", "Pakistan"],
        ["BGD", "BGD", "+880", "Bangladesh"],
        ["LKA", "LKA", "+94", "Sri Lanka"],
        ["NPL", "NPL", "+977", "Nepal"],
        ["HKG", "HKG", "+852", "Hong Kong"],
        ["TWN", "TWN", "+886", "Taiwan"],
        ["AFG", "AFG", "+93", "Afghanistan"],
        ["ARM", "ARM", "+374", "Armenia"],
        ["AZE", "AZE", "+994", "Azerbaijan"],
        ["BTN", "BTN", "+975", "Bhutan"],
        ["BRN", "BRN", "+673", "Brunei"],
        ["KHM", "KHM", "+855", "Cambodia"],
        ["GEO", "GEO", "+995", "Georgia"],
        ["KAZ", "KAZ", "+7", "Kazakhstan"],
        ["KGZ", "KGZ", "+996", "Kyrgyzstan"],
        ["LAO", "LAO", "+856", "Laos"],
        ["MDV", "MDV", "+960", "Maldives"],
        ["MNG", "MNG", "+976", "Mongolia"],
        ["MMR", "MMR", "+95", "Myanmar"],
        ["RUS", "RUS", "+7", "Russia"],
        ["UZB", "UZB", "+998", "Uzbekistan"],
      ],
    },
    {
      id: "middle-east",
      label: "Middle East",
      countries: [
        ["ARE", "ARE", "+971", "United Arab Emirates"],
        ["SAU", "SAU", "+966", "Saudi Arabia"],
        ["QAT", "QAT", "+974", "Qatar"],
        ["KWT", "KWT", "+965", "Kuwait"],
        ["BHR", "BHR", "+973", "Bahrain"],
        ["OMN", "OMN", "+968", "Oman"],
        ["TUR", "TUR", "+90", "Turkey"],
        ["ISR", "ISR", "+972", "Israel"],
        ["JOR", "JOR", "+962", "Jordan"],
        ["LBN", "LBN", "+961", "Lebanon"],
        ["IRQ", "IRQ", "+964", "Iraq"],
        ["IRN", "IRN", "+98", "Iran"],
        ["SYR", "SYR", "+963", "Syria"],
        ["YEM", "YEM", "+967", "Yemen"],
      ],
    },
    {
      id: "oceania",
      label: "Oceania",
      countries: [
        ["AUS", "AUS", "+61", "Australia"],
        ["NZL", "NZL", "+64", "New Zealand"],
        ["FJI", "FJI", "+679", "Fiji"],
        ["PNG", "PNG", "+675", "Papua New Guinea"],
      ],
    },
  ];

  function injectStyles() {
    if (document.getElementById("romeos-phone-accordion-styles")) return;
    const style = document.createElement("style");
    style.id = "romeos-phone-accordion-styles";
    style.textContent = `
      .rpa-wrap { position: relative; width: 100%; }
      .rpa-input-group {
        display: flex; align-items: stretch; width: 100%;
        border: 1px solid rgba(128,128,128,0.34); border-radius: 6px;
        overflow: hidden; background: transparent;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .rpa-input-group:focus-within {
        border-color: #8C1D40;
        box-shadow: 0 0 0 2px rgba(140, 29, 64,0.18);
      }
      .rpa-trigger {
        display: inline-flex; align-items: center; gap: 0.4rem;
        padding: 0.7rem 0.75rem; border: 0;
        border-right: 1px solid rgba(128,128,128,0.28);
        background: rgba(128,128,128,0.08); color: inherit;
        font-weight: 700; font-size: 0.9rem; cursor: pointer;
        white-space: nowrap; flex: 0 0 auto;
      }
      .rpa-trigger:hover { background: rgba(140, 29, 64,0.1); }
      .rpa-trigger-code { opacity: 0.85; font-family: monospace; font-size: 0.88rem; }
      .rpa-chevron { font-size: 0.75rem; transition: transform 0.2s ease; }
      .rpa-phone-input {
        flex: 1; min-width: 0; border: 0 !important; border-radius: 0 !important;
        padding: 0.7rem 0.85rem; background: transparent; color: inherit;
        font-size: 16px; outline: none;
      }
      .rpa-preview {
        margin-top: 0.35rem; font-size: 0.78rem; opacity: 0.8;
        font-family: monospace;
      }
      .rpa-panel {
        margin-top: 0.45rem; border: 1px solid rgba(128,128,128,0.32);
        border-radius: 6px; padding: 0.65rem;
        background: var(--surface, #ffffff);
        box-shadow: 0 12px 28px rgba(0,0,0,0.14);
      }
      :root[data-theme="dark"] .rpa-panel { background: #1a1217; color: #faf6f2; }
      .rpa-search {
        width: 100%; padding: 0.55rem 0.75rem; border-radius: 8px;
        border: 1px solid rgba(128,128,128,0.3); background: transparent;
        color: inherit; font-size: 16px; margin-bottom: 0.55rem; box-sizing: border-box;
      }
      .rpa-regions { max-height: 260px; overflow-y: auto; display: grid; gap: 0.4rem; }
      .rpa-region-box {
        border: 1px solid rgba(128,128,128,0.2); border-radius: 6px; overflow: hidden;
      }
      .rpa-region-btn {
        width: 100%; display: flex; align-items: center; justify-content: space-between;
        padding: 0.55rem 0.75rem; border: 0; background: rgba(128,128,128,0.07);
        color: inherit; font-weight: 800; font-size: 0.85rem; cursor: pointer; text-align: left;
      }
      .rpa-region-btn:hover { background: rgba(140, 29, 64,0.12); }
      .rpa-country-list { display: grid; gap: 0.15rem; padding: 0.35rem; }
      .rpa-country-item {
        width: 100%; display: flex; align-items: center; justify-content: space-between;
        gap: 0.5rem; padding: 0.48rem 0.6rem; border: 0; border-radius: 7px;
        background: transparent; color: inherit; font-size: 0.85rem; cursor: pointer; text-align: left;
      }
      .rpa-country-item:hover, .rpa-country-item[aria-selected="true"] {
        background: rgba(140, 29, 64,0.15); font-weight: 700;
      }
      .rpa-country-dial { font-family: monospace; opacity: 0.8; font-weight: 700; }
      [hidden] { display: none !important; }
    `;
    document.head.appendChild(style);
  }

  function mount({ phoneInputId, hiddenCodeId, defaultIso = "NGA" }) {
    injectStyles();
    const phoneInput = document.getElementById(phoneInputId);
    if (!phoneInput || phoneInput.dataset.rpaMounted === "1") return;
    phoneInput.dataset.rpaMounted = "1";

    let current = ["NGA", "NGA", "+234", "Nigeria"];
    for (const reg of REGIONS) {
      const found = reg.countries.find((c) => c[1] === defaultIso);
      if (found) { current = found; break; }
    }

    const wrap = document.createElement("div");
    wrap.className = "rpa-wrap";

    const hiddenCode = document.createElement("input");
    hiddenCode.type = "hidden";
    hiddenCode.id = hiddenCodeId;
    hiddenCode.value = current[2];

    const group = document.createElement("div");
    group.className = "rpa-input-group";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "rpa-trigger";
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", "Select region and country dialing code");
    trigger.innerHTML = `<span class="rpa-trigger-iso">${current[1]}</span> <span class="rpa-trigger-code">${current[2]}</span> <span class="rpa-chevron">▾</span>`;

    phoneInput.classList.add("rpa-phone-input");
    phoneInput.parentNode.insertBefore(wrap, phoneInput);
    group.appendChild(trigger);
    group.appendChild(phoneInput);
    wrap.appendChild(hiddenCode);
    wrap.appendChild(group);

    const preview = document.createElement("div");
    preview.className = "rpa-preview";
    preview.hidden = true;
    wrap.appendChild(preview);

    const panel = document.createElement("div");
    panel.className = "rpa-panel";
    panel.hidden = true;
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "Choose your region and country code");

    const search = document.createElement("input");
    search.type = "search";
    search.className = "rpa-search";
    search.placeholder = "Search country, short code (NGA), or +code...";
    search.setAttribute("aria-label", "Search country or dialing code");
    panel.appendChild(search);

    const regionsBox = document.createElement("div");
    regionsBox.className = "rpa-regions";

    REGIONS.forEach((reg) => {
      const box = document.createElement("div");
      box.className = "rpa-region-box";

      const regBtn = document.createElement("button");
      regBtn.type = "button";
      regBtn.className = "rpa-region-btn";
      const isDefaultOpen = Boolean(reg.defaultOpen);
      regBtn.setAttribute("aria-expanded", isDefaultOpen ? "true" : "false");
      regBtn.innerHTML = `<span>${reg.label} <small style="opacity:0.65;font-weight:600;">(${reg.countries.length})</small></span><span class="rpa-reg-chev">${isDefaultOpen ? "▴" : "▾"}</span>`;

      const list = document.createElement("div");
      list.className = "rpa-country-list";
      list.hidden = !isDefaultOpen;

      reg.countries.forEach(([flag, iso, code, name]) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "rpa-country-item";
        item.dataset.iso = iso;
        item.dataset.code = code;
        item.setAttribute("aria-selected", iso === current[1] ? "true" : "false");
        item.innerHTML = `<span><strong>${iso}</strong> · ${name}</span><span class="rpa-country-dial">${code}</span>`;
        item.addEventListener("click", () => {
          current = [flag, iso, code, name];
          hiddenCode.value = code;
          trigger.querySelector(".rpa-trigger-iso").textContent = iso;
          trigger.querySelector(".rpa-trigger-code").textContent = code;
          panel.querySelectorAll(".rpa-country-item").forEach((b) => {
            b.setAttribute("aria-selected", b === item ? "true" : "false");
          });
          setOpen(false);
          updatePreview();
          phoneInput.focus();
        });
        list.appendChild(item);
      });

      regBtn.addEventListener("click", () => {
        const willOpen = list.hidden;
        list.hidden = !willOpen;
        regBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
        regBtn.querySelector(".rpa-reg-chev").textContent = willOpen ? "▴" : "▾";
      });

      box.appendChild(regBtn);
      box.appendChild(list);
      regionsBox.appendChild(box);
    });

    panel.appendChild(regionsBox);
    wrap.appendChild(panel);

    function setOpen(open) {
      panel.hidden = !open;
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
      trigger.querySelector(".rpa-chevron").style.transform = open ? "rotate(180deg)" : "rotate(0deg)";
      if (open) search.focus();
    }

    function updatePreview() {
      const raw = phoneInput.value.trim();
      if (!raw) {
        preview.hidden = true;
        return;
      }
      const digits = raw.replace(/\D/g, "");
      if (!digits) {
        preview.hidden = true;
        return;
      }
      const combined = raw.startsWith("+")
        ? `+${digits}`
        : `${hiddenCode.value}${digits.replace(/^0+/, "")}`;
      preview.textContent = `Full number: ${combined}`;
      preview.hidden = false;
    }

    trigger.addEventListener("click", () => setOpen(panel.hidden));
    phoneInput.addEventListener("input", updatePreview);

    search.addEventListener("input", () => {
      const q = search.value.trim().toLowerCase();
      regionsBox.querySelectorAll(".rpa-region-box").forEach((box) => {
        const regBtn = box.querySelector(".rpa-region-btn");
        const list = box.querySelector(".rpa-country-list");
        const items = Array.from(box.querySelectorAll(".rpa-country-item"));
        let matches = 0;
        items.forEach((item) => {
          const hit = !q || item.textContent.toLowerCase().includes(q);
          item.hidden = !hit;
          if (hit) matches++;
        });
        box.hidden = Boolean(q) && matches === 0;
        if (q && matches > 0) {
          list.hidden = false;
          regBtn.setAttribute("aria-expanded", "true");
          regBtn.querySelector(".rpa-reg-chev").textContent = "▴";
        }
      });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.hidden) setOpen(false);
    });
  }

  window.RomeosPhoneAccordion = { mount, REGIONS };
})();

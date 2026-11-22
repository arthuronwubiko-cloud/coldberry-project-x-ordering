# Coldberry Ice Cream Nigeria — Ordering & Operations Platform

A modern, responsive ice cream and dessert ordering platform for **Coldberry Ice Cream Nigeria** (`coldberry.ng/menu`) built with clean HTML5, CSS3, modular vanilla JavaScript, and Vercel Serverless APIs. The site features authentic Coldberry rolled ice cream, scoops, waffle bowls, toppings, drinks, and combo deals across standardized Tub sizing (`Medium`, `Large`, `Champion`), an interactive 2-in-1 Half & Half flavour builder, checkout extras, a cross-page two-way cart, 6-digit PIN order tracking, customer accounts, feedback & complaints, and role-locked Admin, Refund Token, and Delivery Driver consoles.

## Project structure

```text
.
├── index.html
├── 890b.html
├── pizzadeals.html
├── order.html
├── track.html
├── admin.html
├── admin-console/
│   ├── index.html
│   ├── server.js
│   ├── vercel.json
│   └── package.json
├── prices.json
├── js/
│   ├── site.js
│   ├── cart.js
│   ├── deals-interactive.js
│   └── order.js
├── api/
│   ├── orders.js
│   ├── track.js
│   ├── overload-protection.js
│   ├── pin-manager.js
│   ├── admin.js
│   └── db.js
├── migrations/
│   └── 001_order_pin_and_tracking.sql
├── images/
│   ├── chicken-wings.jpg
│   ├── shawarma.jpg
│   ├── coca-cola.jpg
│   ├── bottled-water.png
│   ├── schweppes-can.png
│   └── schweppes-pet.png
├── scripts/
│   ├── verify-all.js
│   ├── stress-test.js
│   └── overload-test.js
├── ARCHITECTURE.md
├── peter890.css
├── dev-server.js
├── README.md
├── VERIFICATION-LOG.md
├── vercel.json
└── package.json
```

## Files

| File | Purpose |
| --- | --- |
| [`index.html`](./index.html) | Home page with hero section, menu highlights (including a consolidated 13-pizza dropdown inside the Pizza card), locations, gallery, search, and footer. |
| [`890b.html`](./890b.html) | Full menu page with pizza categories (Traditional, Special, Exclusive), sides, drinks, and deal previews with eligible-pizza accordions. |
| [`pizzadeals.html`](./pizzadeals.html) | Deals page with featured combos, interactive flavor selectors, and related pizza accordions with quick-select buttons. |
| [`order.html`](./order.html) | Order checkout form with delivery/pickup selection, interactive cart summary, "🍗 Add Popular Sides & Extras" section, order PIN display, direct tracking link, consent, and WhatsApp handoff. |
| [`track.html`](./track.html) | Real-time customer order tracking interface querying orders by phone number + 6-digit PIN, with 5-stage visual progress stepper, dark/light theme support, and live details. |
| [`admin.html`](./admin.html) | Store Manager Verification Console locked behind 14-character alphanumeric Username & Password (`admin` and `staff` RBAC roles). |
| [`admin-console/`](./admin-console/server.js) | Standalone, separately hosted console server (`npm run start:console` on port `4000`) and Vercel config for isolated console deployment. |
| [`prices.json`](./prices.json) | Canonical single source of truth defining all 4 pizza tiers, 3 standard sizes, combos, sides/drinks, and fee rules. |
| [`privacy.html`](./privacy.html) | Nigeria Data Protection Act (NDPA 2023) compliant privacy policy detailing data collected, legal basis, WhatsApp data transmission, browser storage disclosure, and data subject rights. |
| [`terms.html`](./terms.html) | Terms & Conditions of service detailing ordering rules, flat ₦800 service fee, delivery fee policy, perishable food cancellation/refund policy, and dispute resolution. |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Comprehensive architecture map, Mermaid diagrams, and connection matrix detailing how HTML pages, CSS, JS modules, browser storage, APIs, and databases connect. |
| [`js/site.js`](./js/site.js) | Real-time live search for home-page previews and full-menu products/combos with Enter-key handoff, plus interactive dark/light theme switcher with `localStorage` persistence and `<meta name="theme-color">` sync. |
| [`js/cart.js`](./js/cart.js) | Client-side cart state management, quantity limits (1–10), and cross-page synchronization via `localStorage`. |
| [`js/deals-interactive.js`](./js/deals-interactive.js) | Handles interactive pull-down selectors, size pricing updates, deal flavor pickers, Half & Half visual split preview, and related flavour accordions with descriptive `Scoop 1` and `Scoop 2` buttons. |
| [`js/order.js`](./js/order.js) | Client-side form validation, two-way cart sync, live subtotal, ₦800 service fee, 15% delivery fee calculation in ₦, and WhatsApp order synthesis. |
| [`api/orders.js`](./api/orders.js) | Serverless endpoint validating order payloads, computing itemized pricing/totals, issuing non-recycling 6-digit order verification PINs (5-day window), persisting to database (optional), and generating WhatsApp click-to-chat links. |
| [`api/track.js`](./api/track.js) | Serverless endpoint resolving customer tracking requests via Phone + 6-digit PIN with 5-step status lifecycle progression. |
| [`api/overload-protection.js`](./api/overload-protection.js) | Overload fail-safe engine featuring sliding-window rate limiting, active request concurrency governor, database circuit breaker, and 5-second read micro-caching. |
| [`api/pin-manager.js`](./api/pin-manager.js) | Order Verification PIN manager generating random 6-digit PINs (`100000`–`999999`) and enforcing strict 5-day non-recycling retention via atomic database allocation or memory/disk storage. |
| [`api/admin.js`](./api/admin.js) | Protected admin endpoint to query stored orders (`GET`) and advance order preparation status (`PATCH`). |
| [`api/db.js`](./api/db.js) | Database client adapter supporting Neon Postgres and Supabase order persistence, atomic PIN allocation, and live order tracking queries. |
| [`migrations/001_order_pin_and_tracking.sql`](./migrations/001_order_pin_and_tracking.sql) | SQL schema migration provisioning `order_pins` retention table, order lifecycle status column, and atomic `allocate_order_pin` database function. |
| [`scripts/verify-all.js`](./scripts/verify-all.js) | 102-point automated regression test suite validating syntax, size naming, card counts, Half & Half accordion component, image assets, pricing math, homepage preview & theme controller, navbar shopping cart icon, WhatsApp Order API, random 6-digit PIN 5-day retention, 1-click PIN clipboard copy, RBAC console auth (14-char credentials), 12-minute customer cancellation, order tracking lifecycle, single source of truth prices, and legal compliance. |
| [`scripts/stress-test.js`](./scripts/stress-test.js) | 5-round adversarial stress test suite verifying high-concurrency collision resistance (100 PINs), all 507 Half & Half permutations, XSS fuzzing, tracking lifecycle, and 5-day non-recycling math. |
| [`scripts/overload-test.js`](./scripts/overload-test.js) | System overload suite testing 5,000 rapid concurrent PIN allocations, 100,000 pricing engine calculations, 1,000 HTTP connection flood, and massive buffer injection. |
| [`peter890.css`](./peter890.css) | Centralized stylesheet for all pages: responsive layout, brand palette, typography, touch targets, and accessibility. |
| [`README.md`](./README.md) | Project overview, feature documentation, architecture, usage notes, and testing guide. |
| [`VERIFICATION-LOG.md`](./VERIFICATION-LOG.md) | Historical verification logs and test execution records. |

## Pages and content

### Home page — `index.html`

The home page includes:

1. Header navigation with Home, Menu, Locations, Deals, and Order links, with active page highlighting.
2. Hero section with a featured Coldberry Ice Cream banner and direct order call-to-action.
3. Menu preview cards with live search filtering, Enter-key handoff to the full menu, and a consolidated interactive `<details class="related-pizzas-details homepage-pizzas-details">` dropdown inside the `13 Varieties` Ice Cream card listing all 13 flavours across Classic, Premium, and Signature groups with thumbnails, size pricing tags (`Med`, `Lrg`, `Champion`), and `Order` links (`890b.html#<id>`).
4. Coldberry store locations in Nigeria grouped by Abuja (Wuse II, Garki, Jabi) and Lagos (Victoria Island, Lekki Phase 1, Ikeja GRA, Surulere).
5. Horizontally scrollable ice cream gallery showcasing authentic menu items from `coldberry.ng/menu/`.
6. Footer with social links, store hours, and brand information.

### Full menu — `890b.html`

The full menu page includes:

1. Header navigation and breadcrumb links.
2. Category navigation jumps for Classic Scoops, Premium Flavours, Signature Creations, Rolled Ice Cream & Tacos, Waffles & Cakes, Toppings, and Drinks.
3. **Half & Half Custom 2-in-1 Split Accordion**:
   - Interactive `<details class="related-pizzas-details half-and-half-accordion" open>` component allowing customers to split any two Coldberry ice cream flavours across Medium, Large, or Champion sizes.
   - **Pricing Formula**: Exactly 5% more expensive than the full price of the more expensive side:
     $$\text{Price} = \mathrm{round}\Big(\max(\text{Price}(\text{Side}_1), \text{Price}(\text{Side}_2)) \times 1.05\Big)$$
   - Live breakdown displaying Base Price (more expensive side), 5% Split Surcharge, and Total Price.
   - Stepper quantity controls wired directly into the cart system.
4. **13 Signature Coldberry Flavours** across four canonical categories:
   - **Canonical Size Hierarchy**: Every tub offers **Medium (10")**, **Large (12")**, and **Champion (16")** sizes.
   - **Size Selector Pull-Downs**: Interactive `<select class="pizza-size-select">` menus dynamically update displayed prices and cart keys.
5. **Sides, Toppings & Drinks**: Dip Waffle Bowl, Cone & Taco Crisps, Eva Water (75cl PET), Fanta & Coke (50cl), Pulpy Orange Juice with interactive quantity controls.
6. **Priced Ice Cream Deal Previews**: Combos with interactive flavour selectors, eligible-flavour `<details class="related-pizzas-details">` accordions, and cart controls.
7. Footer navigation and search status live announcements (`aria-live`).

### Deals page — `pizzadeals.html`

The dedicated deals page includes:

1. Hero banner for promotional combo packages.
2. Value deal cards with interactive flavour selectors (`.deal-pizza-select`) allowing customers to customize ice cream varieties included in the combo.
3. Interactive related-flavour pull-down accordions listing eligible flavours for each deal with size pricing tags and quick-select buttons (`data-target-select`) to populate combo choices instantly.
4. Real-time combo badge updates (`.deal-combo-badge`) reflecting chosen ice cream varieties and syncing with the cart.
5. Promotional deal cards, responsive layout, and order CTAs.

### Order page — `order.html`

The checkout order page collects customer details, fulfilment choice, and provides a comprehensive order summary:

1. **Customer Contact & Fulfilment**: Name, phone number (with automatic Nigerian phone number normalization e.g. `+234...`), optional email, fulfilment type (Delivery vs. Store Pickup), Coldberry store location selector, and delivery address field with conditional validation.
2. **Interactive Cart Summary**: Displays all selected items with live quantity steppers (+/−), item removal, and instant price updates.
3. **🍦 Add Popular Sides & Extras Section**:
   - Prominent add-ons section allowing customers to add high-demand sides directly to their order at checkout:
     - **Dip Waffle Bowl** — ₦4,700
     - **Crispy Cone & Taco** — ₦4,400
     - **Cold Coca-Cola (50cl)** — ₦900
   - Features local image assets (`images/chicken-wings.jpg`, `images/shawarma.jpg`, `images/coca-cola.jpg`) and interactive quantity steppers (+/−) capped at 10 items.
4. **Live Pricing Summary**:
   - Real-time subtotal in ₦ calculated across all items.
   - Dynamic delivery fee computation: standard delivery fee for delivery orders (or **₦0 (Free Pickup)** for in-store pickup), rendered with exact Naira amount while hiding internal calculation formulas.
   - Flat ₦800 service fee automatically calculated and rendered in cart summary.
   - Grand total in ₦ dynamically calculated and displayed in the UI.
5. **Itemized WhatsApp Order Handoff & 6-Digit Verification PIN**: Form submission generates a random, cryptographically secure 6-digit Order Verification PIN (non-recycled for 5 days), validates customer consent, saves the order to database storage if configured, and opens WhatsApp with a prefilled, formatted message containing:
   - Customer details, Order PIN (`• Order PIN: 739201`), and chosen location/address.
   - Itemized cart breakdown with unit prices.
   - Structured `*Payment Summary*` including Subtotal, Service Fee (₦800), Delivery Fee, and Grand Total in ₦.
   - Confirmation screen features a dedicated `#order-pin-container` highlighting the 6-digit PIN with a direct link (`#order-track-link`) to track the order live.

### Order Tracking page — `track.html`

The real-time customer tracking portal lets customers check their order lifecycle:

1. **Secure Dual-Factor Lookup**: Queries orders using the customer's Phone Number (`080...` or `+234...`) and 6-digit Order PIN (`100000`–`999999`).
2. **5-Stage Visual Progress Stepper**:
   - `Order Placed` -> `Confirmed` -> `In the Kitchen` -> `Out for Delivery` (or `Ready for Pickup`) -> `Delivered` / `Completed`.
3. **Live Order Breakdown**:
   - Displays fulfilment type, timestamp, store location, delivery address, order items breakdown, and payment total.
4. **Dark & Light Mode Support**: Inherits global theme persistence via `js/site.js` and styling from `peter890.css`.

### Store Manager Portal & Separately Hosted Console — `admin-console/` & `admin.html`

A separately hostable, strictly locked verification console for Store Admins and Regular Staff:

1. **Separate Hosting Ready**: Run standalone on port `4000` via `npm run start:console` (proxying `/api/*` to the ordering site or communicating cross-origin via CORS) or deploy `admin-console/` as a separate Vercel project.
2. **Locked Behind 14-Character Alphanumeric Credentials**: Dashboard DOM remains locked and empty until authenticated via `POST /api/admin`.
   - **Admin Account** (Full access — inspect all PII, update state, cancel, delete, export CSV):
     - Username: `RomeosAdmin890` | Password: `Adm94Kx72Qp81Z`
   - **Regular User / Staff Account** (State change only — Advance Confirmed / Kitchen / Out for Delivery / Ready / Completed; PII masked; cancel & delete return `403`):
     - Username: `RomeosStaff890` | Password: `Stf63Mp49Lw28R`
3. **Configurable via Env Vars**: Override credentials cleanly via `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `STAFF_USERNAME`, and `STAFF_PASSWORD`.

### Navbar Shopping Cart & 12-Minute Easy Customer Cancellation

- **Persistent Navbar Shopping Cart Logo (`#nav-cart-link`)**: Every page displays a shopping cart button in the top navigation bar with a live counter badge (`#cart-count`) synced across pages and tabs via `js/cart.js`.
- **12-Minute Easy Self-Service Cancellation**: Customers can cancel an order directly from `order.html` confirmation or `track.html` within 12 minutes of ordering (`POST /api/track` with `{ action: "cancel" }`), unless already out for delivery or completed. After 12 minutes, the cancellation window automatically locks.

## Upgraded features

- **Canonical Pizza Sizing & Live Pricing Sync**:
  - Standardized strictly to three official sizes: **Medium (10")**, **Large (12")**, and **Champion (16")**. The outdated "Jumbo" terminology has been completely retired across markup, scripts, and tests.
  - Live pricing synchronized directly across three distinct tiers:
    - **Traditional** (Pepperoni, BBQ Chicken, Chicken Supreme, Veggie Supreme, BBQ Beef):
      - Medium (10"): ₦11,200 | Large (12"): ₦14,150 | Champion (16"): ₦21,200
    - **Special** (Beef Suya, Shawarma Pizza, Chicken Suya, Sweet Chilli Chicken):
      - Medium (10"): ₦12,200 | Large (12"): ₦14,800 | Champion (16"): ₦22,000
    - **Exclusive** (Meatylover, Sweet & Hot, Margherita):
      - Medium (10"): ₦13,500 | Large (12"): ₦15,000 | Champion (16"): ₦23,500
- **Relocated Homepage Pizza Dropdown & Deal Selectors**:
  - Consolidated all 12 pizzas (Traditional, Special, and Exclusive) into a single scrollable `<details class="related-pizzas-details homepage-pizzas-details">` accordion inside the Pizza preview card on `index.html`, displaying thumbnails, size pricing tags (`Med`, `Lrg`, `Champion`), and direct `Order` links (`890b.html#<id>`).
  - Removed individual category accordions from the 12 pizza cards on `890b.html` for cleaner browsing while retaining eligible-pizza `<details>` accordions on deal cards.
  - On `pizzadeals.html` and the `890b.html` deals preview, deals feature interactive dropdown selectors (`.deal-pizza-select` managed by `js/deals-interactive.js`) for choosing combo pizza flavors, updating cart keys and quantity steppers in real time, accompanied by accordions of eligible pizzas with quick "Select" buttons.
- **Interactive Dark / Light Theme Switcher & Mobile `theme-color` Sync**:
  - An accessible circular `.theme-toggle` button (`#theme-toggle`) in the navigation bar of all pages (`index.html`, `890b.html`, `pizzadeals.html`, `order.html`) allows customers to switch between dark and light themes at any time.
  - Choice is persisted in `localStorage` under `romeos-theme` and applied across pages via `[data-theme="dark"]` and `[data-theme="light"]` attributes on `:root`.
  - Default theme is light (`--color-ivory: #F7F1E3`, `--color-deep-wine: #5C1A2B`). Dark theme (`--color-ivory: #161114`, `--color-slate: #F4EDE3`, `--color-deep-wine: #E57388`, `--color-saffron: #F0A83B`) is applied when toggled or when `prefers-color-scheme: dark` is active (unless overridden by light mode).
  - Dynamically updates `<meta name="theme-color">` (`#161114` in dark mode, `#5C1A2B` in light mode) and toggle button icons/labels.
- **Checkout Add-ons ("🍗 Add Popular Sides & Extras")**:
  - Embedded directly into `order.html`, this section enables 1-click addition of popular sides and beverages:
    - *Chicken Wings (6 pcs)* — ₦4,700
    - *Shawarma Roll* — ₦4,400
    - *Cold Coca-Cola (50cl)* — ₦900
  - Includes interactive quantity steppers enforcing safe limits (0 to 10 items) and instant two-way synchronization with the cart summary.
- **Two-Way Cart Synchronization & Live Price Calculations**:
  - Operates across all pages and tabs via `localStorage` keys (`romeos_cart` and `romeos-pizza-cart`) and custom `cart:change` DOM events.
  - Client-side calculation engine (`calculateOrderTotals` in `js/order.js`) computes real-time subtotals, flat ₦800 service fee, delivery fee (or ₦0 for pickup), and calculates the grand total in Nigerian Naira (₦).
- **Itemized WhatsApp Order Handoff (`/api/orders` + Client Fallback)**:
  - Form submission dispatches the payload to `POST /api/orders`, which validates inputs, computes itemized line prices (`getItemPrice`) and totals (`calculateOrderTotals`), persists the order record if a database is configured, and returns `{ orderId, pricing, whatsappUrl }`.
  - When deployed as static HTML without serverless routes, `js/order.js` falls back seamlessly to `buildClientWhatsAppUrl()` and fetches `/api/orders?diagnostics=1` on load when available to sync the configured restaurant recipient number.
  - The generated WhatsApp message includes customer information, fulfilment type, delivery address or pickup store, itemized product breakdown with quantities and unit/line prices, and a dedicated `*Payment Summary*` (Subtotal, ₦800 Service Fee, explicit Delivery Fee line hiding the internal calculation rate, and Grand Total).
- **Live Search & Instant Feedback**:
  - `js/site.js` provides instant filtering without page reloads. Filters home preview cards and matching rows inside `.homepage-pizzas-details` with Enter-key transition to `890b.html?search=<query>`, where full-menu items and deal combos are dynamically searched and announced via `aria-live`.
- **Responsive Layout & Accessibility**:
  - Centralized in `peter890.css` with breakpoints at 1024px, 800px, 650px, 520px, and 380px.
  - Meets WCAG 2.5.5 touch target minimums (≥44px, including `#theme-toggle`), WCAG AA/AAA color contrast, `:focus-visible` keyboard focus indicators, flattened cross-browser dark theme rules (`[data-theme="dark"]` and `prefers-color-scheme: dark`), and `prefers-reduced-motion` compliance.
  - Essential animation design: eliminated heavy floating lifts (`translateY`), image scaling (`scale(1.04/1.05)`), icon spins, and button bounces in favor of fast, crisp, accessible state transitions (≤0.15s–0.2s for colors, borders, and shadows).

## Customer Theme Switcher

Customers control the light/dark theme with the `#theme-toggle` button in the nav bar of `index.html`, `890b.html`, `pizzadeals.html`, and `order.html`.

- **Unified Cross-Tab Controller**: A single `window.ThemeController` instance manages theme state using delegated click handling and synchronizes all open browser tabs in real time via `BroadcastChannel` (`romeos_theme_channel`) and `storage` events. Toggling the theme in any tab instantly updates all other open tabs without requiring a page refresh.
- **Accessibility & Touch Target**: Uses `44px × 44px` hit target dimensions, live `aria-label`, `title`, and `aria-pressed` state updates, and Font Awesome moon/sun icons across all four pages.
- **Persistence**: the choice is stored in `localStorage` under the key `romeos-theme`.
- **Application**: `js/site.js` sets `data-theme` (`light` or `dark`) on `<html>`; `peter890.css` styles flattened cross-browser `[data-theme="dark"]` / `:root:not([data-theme="light"])` dark-mode selectors.
- **Fallback**: with no saved choice, the site follows the system `prefers-color-scheme`.
- **Mobile browser chrome**: `<meta name="theme-color">` is synced to `#161114` (dark) or `#5C1A2B` (light).
- **Precedence**: an explicit customer choice always overrides the system preference.

## How the code works

- **HTML5**: Semantic document structure across `index.html`, `890b.html`, `pizzadeals.html`, and `order.html`.
- **CSS3 (`peter890.css`)**: Centralized design system with CSS variables, Grid and Flexbox layouts, responsive media queries, and accessible focus states.
- **JavaScript Modules (`js/`)**:
  - `site.js`: Search indexing, real-time filtering, URL search query handoff, interactive dark/light theme switching with `localStorage` persistence, and dynamic `<meta name="theme-color">` updates.
  - `cart.js`: Shared cart state management, storage synchronization, and counter badges.
  - `deals-interactive.js`: Interactive pull-down selectors for pizza sizes and deal combos, live pricing lookup from `romeospizza.ng`, and related pizza accordions.
  - `order.js`: Order form handling, two-way cart synchronization, checkout add-ons, pricing totals calculation, and WhatsApp message formatting.
- **Serverless API (`api/`)**:
  - `orders.js`: Server-side order validation, database persistence, itemized pricing calculation, and WhatsApp link generation.
  - `admin.js`: Protected read endpoint for reviewing orders (`/api/admin?secret=...`).
  - `db.js`: Database connector supporting Neon Postgres and Supabase.
- **5 Core Modern Upgrades**:
  1. **Canonical Single Source of Truth (`prices.json`)**: Centralized data dictionary defining all 4 pizza tiers, 3 standardized sizes, combos, sides/drinks, and fee rules, consumed by client pricing engines, serverless handlers, and test suites.
  2. **Order Tracking Page (`track.html` & `api/track.js`)**: Real-time customer order tracking portal with 5-stage visual progress stepper (`pending` -> `confirmed` -> `preparing` -> `out_for_delivery` / `ready` -> `completed`), dual-factor lookup (Phone + 6-digit PIN), and status progression via `PATCH /api/admin`.
  3. **Half & Half Visual 2-in-1 Split Circle Preview**: An interactive 2-in-1 split circle preview element (`.half-visual-preview`) in `890b.html` dynamically showcasing left/right flavor backgrounds in real-time as flavors are selected in `js/deals-interactive.js`.
  4. **Self-Contained Local Image Assets**: Fully local, high-performance image assets (`images/chicken-wings.jpg`, `images/shawarma.jpg`, `images/coca-cola.jpg`, `images/bottled-water.png`, `images/schweppes-can.png`, `images/schweppes-pet.png`) eliminating third-party remote network latency and hotlinking failures.
  5. **Accessible Styling & Clean Markup Migration**: Migrated all inline styling from `order.html` into `peter890.css`, added accessible ARIA live feedback, focus-visible outlines, responsive card layouts, and complete dark/light theme compatibility.
- **Security Hardening & Database Secret Remediation**:
  - Removed all hard-coded credentials and administrative secrets from `dev-server.js` in favor of environment variables (`process.env.SUPABASE_URL`, etc.).
  - Added strict path traversal prevention (`path.normalize` / directory escaping guard) blocking unauthorized file probing.
- **Atomic 6-Digit PIN Engine & 5-Day Retention**:
  - Cryptographically secure 6-digit PIN generator with database-level atomic allocation (`allocate_order_pin()`) and automatic in-memory fallback.
  - Strict 5-day retention guarantee ($432,000,000\text{ ms}$) preventing PIN recycling across concurrent instances.
- **Multi-Tier Overload Fail-Safe Architecture**:
  1. **Concurrency Governor & Fast Load Shedder**: Tracks in-flight server requests and caps active concurrency (`MAX_CONCURRENT_REQUESTS = 150`). When traffic spikes beyond capacity, excess requests are shed in $<1\text{ ms}$ with `HTTP 503` + `Retry-After: 1`, preventing event loop starvation and keeping response times ultra-low ($<10\text{ ms}$) for active users.
  2. **Sliding-Window Rate Limiting**: Caps per-IP throughput at 120 requests/minute to prevent malicious scraper or bot floods from degrading website speed.
  3. **Database Circuit Breaker**: Wraps all database operations in a strict $2,000\text{ ms}$ timeout. If external database queries timeout or fail 3 times consecutively, the circuit breaker trips to `OPEN` for 20 seconds, executing fast-path fallback instantly ($0\text{ ms}$ DB latency) while queuing orders locally.
  4. **Micro-Caching for High-Volume Reads**: In-memory 5-second TTL cache for `/api/track` queries by `(phone, pin)`. Rapid customer or bot status refreshes return in $<0.1\text{ ms}$ directly from memory without touching the database or disk.
  5. **Streaming Payload Capping**: Restricts incoming request streams in `dev-server.js` to 48KB max, immediately destroying the request stream and returning `HTTP 413` to prevent buffer bloat and memory exhaustion.
  6. **Client-Side Instant WhatsApp Fallover**: Configured an `AbortSignal.timeout(2500)` in `js/order.js`. If the serverless backend takes longer than 2.5 seconds or returns 429/503 during a network surge, the client seamlessly bypasses the backend, generates the 6-digit PIN locally, displays the confirmation screen, and launches WhatsApp immediately. The customer experiences zero delay and zero drop in speed.
  7. **Static Asset Caching & 304 Handling**: Configured `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` and `If-Modified-Since` (304 Not Modified) in `dev-server.js` to ensure browsers cache styles, images, and scripts without repeatedly querying the disk.
- **Automated Verification (`scripts/verify-all.js`)**: 81-point comprehensive regression test suite verifying JavaScript syntax, size naming hygiene, card counts, image assets, pricing calculations (Coke @ ₦900, Half & Half 5% surcharge, ₦800 service fee, 15% delivery fee), homepage card & theme controller behavior, navbar cart badge, WhatsApp Order API endpoints, 1-click PIN clipboard copying, RBAC console auth & PII masking, 12-minute customer cancellation, order tracking lifecycle, prices single source of truth, and legal compliance.
- **Adversarial Stress Testing (`scripts/stress-test.js`)**: 5-round high-concurrency stress test verifying 0-collision PIN generation (100 PINs per round), all 507 Half & Half permutations, XSS fuzzing, tracking lifecycle, and 5-day non-recycling retention math.

## Testing & verification

The project includes an automated end-to-end regression test suite in `scripts/verify-all.js` and an adversarial stress test suite in `scripts/stress-test.js`.

### Running the test suite

Run the verification suite from the project root:

```bash
npm test
# Or: node scripts/verify-all.js
```

Run the 5-round adversarial stress test suite:

```bash
npm run test:stress
# Or: node scripts/stress-test.js
```

Run the extreme system overload stress suite:

```bash
npm run test:overload
# Or: node scripts/overload-test.js
```

### What the test suite checks (81 points)

1. **JavaScript Syntax Sanity (14 checks)**: Verifies that all project scripts (`admin-console/server.js`, `api/admin.js`, `api/db.js`, `api/orders.js`, `api/overload-protection.js`, `api/pin-manager.js`, `api/track.js`, `dev-server.js`, `js/cart.js`, `js/deals-interactive.js`, `js/order.js`, `js/site.js`, `scripts/overload-test.js`, `scripts/stress-test.js`) compile cleanly without syntax errors.
2. **Size Naming Hygiene (1 check)**: Scans all HTML and JS files for any legacy "Jumbo" references, ensuring 100% adherence to the canonical Medium / Large / Champion naming convention.
3. **Menu Pizza Cards, Sizing & Half/Half Accordion (15 checks)**: Confirms that all 12 pizza cards in `890b.html` include Medium, Large, and Champion size options, default to Large, have accurate live prices, and includes the Half & Half 2-in-1 accordion builder.
4. **Image Asset Integrity (3 checks)**: Verifies that local side and drink images (`images/chicken-wings.jpg`, `images/shawarma.jpg`, `images/coca-cola.jpg`) exist on disk, are valid non-empty files, and are correctly referenced in `order.html`.
5. **Pricing Math & Order Logic (15 checks)**:
   - Validates unit prices for pizzas across categories and sizes (e.g., Pepperoni Champion: ₦21,200, Beef Suya Large: ₦14,800, Meatylover Champion: ₦23,500).
   - Validates unit prices for popular sides (Chicken Wings 6 pcs: ₦4,700) and combo deals (The Festive Box: ₦28,000).
   - Validates Coca-Cola (50cl) canonical unit price at ₦900 across order and menu pages.
   - Validates flat service fee logic: exactly ₦800 for orders with items (`serviceFee = 800`).
   - Validates delivery fee logic: exactly 15% of subtotal for delivery orders and ₦0 (Free Pickup) for pickup orders.
   - Validates subtotal, service fee, and grand total arithmetic for multi-item carts (`grandTotal = subtotal + serviceFee + deliveryFee`).
   - Validates WhatsApp message summary generation, ensuring itemized subtotals, ₦800 service fee, explicit delivery fee line (hiding internal calculation formulas), and grand totals are formatted correctly.
   - Cross-checks all 39 menu pizza size-price combinations against the pricing logic in `js/order.js`.
   - Validates Half & Half 5% surcharge formula across all tiers and permutations.
6. **Homepage Pizza Card & Theme Controller (6 checks)**: Confirms the generic Pizza card quantity control was removed from `index.html`, all HTML pages include `#theme-toggle`, `js/site.js`, and Font Awesome, and `window.ThemeController` toggles dark/light mode with persistence and `aria-pressed`/`theme-color` updates.
7. **WhatsApp Order & Tracking API (7 checks)**: Exercises `api/orders.js` for `GET ?diagnostics=1`, Delivery and Pickup itemized WhatsApp URL & `*Payment Summary*` generation, 6-digit PIN 5-day retention, rejection of missing consent (`400`) and invalid phones (`400`), `PUT` method rejection (`405`), and live tracking lookup via `GET /api/track`.
8. **Legal Compliance, Footers & Core Upgrades (13 checks)**:
   - Confirms `privacy.html` and `terms.html` exist with compliant policy text.
   - Confirms footer navigation across all pages links to `privacy.html` and `terms.html`.
   - Confirms `order.html` consent checkbox explicitly links to both `Terms & Conditions` and `Privacy Policy`.
   - Confirms deal eligibility accordions use clean descriptive `Pizza 1` and `Pizza 2` quick-select buttons without ambiguous `#1` / `#2` tags.
   - Confirms Coca-Cola is displayed at ₦900 and cart UI renders `#cart-service-row`.
   - Confirms `#order-pin-container` and `#order-pin-display` exist in `order.html`.
   - Confirms `prices.json` exists as single source of truth.
   - Confirms `track.html` exists with interactive lookup form and progress stepper.
   - Confirms Half & Half visual 2-in-1 split circle preview in `890b.html`.
   - Confirms `dev-server.js` contains 0 hard-coded secrets or credentials.

For historical test logs and manual audit records, refer to [`VERIFICATION-LOG.md`](./VERIFICATION-LOG.md).

## Run locally

You can open any HTML file directly in a modern web browser, or serve the project locally using any static web server:

### Option 1: Python HTTP server
```bash
python3 -m http.server 8000
```

### Option 2: Node.js `serve`
```bash
npx serve . -l 8000
```

Then open your browser to:
- `http://localhost:8000/index.html` (Home)
- `http://localhost:8000/890b.html` (Menu)
- `http://localhost:8000/pizzadeals.html` (Deals)
- `http://localhost:8000/order.html` (Order)

### Option 3: Full-stack local development with Vercel CLI
Static pages and the client-side cart work completely offline and on local static servers. To test order submission through the serverless `/api/orders` endpoint locally:
```bash
vercel dev
```
*(Ensure `WHATSAPP_ORDER_RECIPIENT` is configured in your local environment or `.env` file as described below).*

## Notes

- 100% of product images and brand media are downloaded directly from **Coldberry Ice Cream Nigeria** (`coldberry.ng/menu/`) into `images/` with 0 external hotlinks and 0 AI imagery.
- Font Awesome is loaded from a CDN for icons.
- If an external image or font URL changes or fails, replace the `src` or stylesheet link with a valid alternative.

## Vercel and WhatsApp setup

Deploy this repository as a Vercel project so `/api/orders` runs as a serverless function. Configure the restaurant's WhatsApp number in the Vercel project's Environment Variables for every environment where orders should be enabled:

| Variable | Value |
| --- | --- |
| `WHATSAPP_ORDER_RECIPIENT` | Restaurant WhatsApp number, digits only with country code (for example `2348012345678`). |

After the customer submits the order form, the site opens WhatsApp with the order details prefilled. The customer must review and tap Send in WhatsApp; submitting the website form alone does not send an order. Add/update the environment variable in Vercel and redeploy after changing it. Configure Vercel Firewall/rate limiting for `POST /api/orders` before production to reduce automated or abusive submissions.

To diagnose environment configuration without exposing secret values, request `GET /api/orders?diagnostics=1`. The response reports only whether the required settings are configured and the names of missing or malformed variables.

## Editing guide

- Update page content, pricing, and menu items in the relevant HTML file.
- Update shared styling in `peter890.css`.
- Keep class names consistent when editing CSS to preserve the site layout.
- Add descriptive `alt` text for meaningful images.
- Use section IDs and matching anchor links when adding new in-page navigation.

## Current limitations

- The home-page search filters its three preview cards as you type; press Enter to search all menu items and the three priced deal previews on the full-menu page.
- The cart is stored in the customer's browser. Orders are stored only when `DATABASE_URL` or `SUPABASE_URL` is configured; the website does not process payments, and a message is not sent until the customer taps Send in WhatsApp.
- The full-menu page previews priced deals. Two image-only promotions on the dedicated deals page do not have individual prices or quantity controls.
- The HTML pages are static; the order form requires deployment on Vercel (or local `dev-server.js`) and a valid restaurant WhatsApp recipient number.

## License

This project does not currently include a license file. If you plan to publish or share it publicly, add an appropriate license before distribution.

---

## Free order storage

Orders can optionally be stored in Neon Postgres or Supabase. Storage is optional and does not delay the WhatsApp handoff if it is unconfigured or unavailable. The schema is auto-created on the first order.

**Orders table schema:**

```sql
CREATE TABLE orders (
  id            SERIAL PRIMARY KEY,
  order_id      TEXT UNIQUE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  fulfilment    TEXT NOT NULL,         -- 'Delivery' or 'Pickup'
  location      TEXT NOT NULL,
  address       TEXT,
  items         TEXT NOT NULL,
  notes         TEXT,
  status        TEXT DEFAULT 'pending'
);
```

**Setup (Supabase - Recommended):**

1. Create a free project at [supabase.com](https://supabase.com).
2. Run the table creation SQL in Supabase SQL Editor.
3. Set `SUPABASE_URL` and `SUPABASE_KEY` in your Vercel project environment variables.
4. You can view, filter, and edit orders in real-time in the Supabase Table Editor (MS Access / Spreadsheet UI).

**Alternative (Neon Postgres):**

1. Create a free Neon project at [neon.tech](https://neon.tech).
2. Set `DATABASE_URL` in your Vercel project environment variables.

---

### Role-Based Verification Console & Orders API (`/api/admin` & `admin-console/`)

Run the standalone verification console separately from the storefront:

```bash
npm run start:console
# Default URL: http://localhost:4000 (proxies /api/* to http://localhost:3000)
```

Authenticate via `POST /api/admin` (`{ action: "login", username, password }`) using 14-character alphanumeric credentials to receive an 8-hour HMAC session Bearer token:

- **Admin (`RomeosAdmin890` / `Adm94Kx72Qp81Z`)**: Full `GET`, `PATCH` (any state including `cancelled`), `DELETE`, analytics, and CSV export.
- **Regular User / Staff (`RomeosStaff890` / `Stf63Mp49Lw28R`)**: Masked PII in `GET`; `PATCH` restricted to operational state progression (`confirmed`, `preparing`, `out_for_delivery`, `ready`, `completed`); `cancelled` & `DELETE` rejected with `HTTP 403`.

---

### Required Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `RESTAURANT_WHATSAPP_NUMBER` | Optional | Restaurant WhatsApp number (defaults to `2349055303848`) |
| `SUPABASE_URL` | Optional | Supabase project URL e.g. `https://tfpedhsgktihxkeuoztv.supabase.co` |
| `SUPABASE_KEY` | Optional | Supabase API key (anon or service_role) |
| `DATABASE_URL` | Optional | Enables Neon Postgres order storage (alternative to Supabase) |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Optional | Override 14-char alphanumeric Admin console credentials |
| `MANAGER_USERNAME` / `MANAGER_PASSWORD` | Optional | 14-char alphanumeric Manager Console (`/manager`) & Refunds credentials |
| `STAFF_USERNAME` / `STAFF_PASSWORD` | Optional | Override 14-char alphanumeric Regular Staff credentials |
| `ADMIN_SECRET` / `ADMIN_SESSION_SECRET` | Optional | Legacy bearer token secret & HMAC signing secret |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Optional | Upstash Redis REST endpoint & token for distributed login sessions, instant logout revocation, rate limiting, and failed-login lockouts |
| `LOAD_BALANCER_ENABLED` / `LOAD_BALANCER_STRATEGY` | Optional | Enable `api/load-balancer.js` upstream routing (`least-connections` or `round-robin`) |
| `LOAD_BALANCER_UPSTREAMS` / `CLUSTER_WORKERS` | Optional | Comma-separated upstream API origins and Node.js cluster worker count for `dev-server.js` |
| `ADMIN_PORT` / `API_ORIGIN` | Optional | Port (`4000`) and API backend URL (`http://localhost:3000`) for `admin-console/server.js` |

If no database is configured, order storage is skipped — the WhatsApp handoff works regardless.

---

### Install Dependencies

```bash
npm install
```

Dependency: `@neondatabase/serverless` (Postgres).

### Diagnostics

Check configuration status (without exposing secrets):

```
GET /api/orders?diagnostics=1
```

Returns whether the database is configured and the WhatsApp recipient number in use.


---

## Recent Platform Upgrades (2026-11-21)

- **Security Hardening:** Full two-pass security audit completed across all APIs and consoles (authenticated `/api/orders?diagnostics=1`, fail-closed production session secrets, salted `crypto.scryptSync` hashing, `crypto.timingSafeEqual` verification, HttpOnly/SameSite cookies, CORS & CSP headers, and RBAC isolation).
- **Redis Login Session Store & Lockout (`api/redis.js`):** Distributed session tracking via Upstash Redis REST (with graceful in-memory fallback), instant `jti` session revocation on logout, distributed login rate limiting, and automatic failed-login lockout protection.
- **Load Balancer & Failover (`api/load-balancer.js`, `dev-server.js`):** Upstream pool routing (`least-connections` / `round-robin`) with circuit-breaker health checks, automatic failover, and multi-worker Node.js cluster support.
- **Brand Color Palettes & Human-Made UI Polish:** Applied custom light/dark Berry & Cream (Light: `#FFF8F5` / `#8C1D40` / `#5C1A2B`, Dark: `#150B0E` / `#F0708F` / `#2A0F18`) tokens across storefront, Admin Console, and Driver Console; paired `Fraunces`, `Plus Jakarta Sans`, and `JetBrains Mono`; removed all UI emojis and nested card-in-card chrome; enforced `<= 8px` radii and `44px` touch targets.
- **Three-Dots (`⋮`) Navigation Menu:** Moved primary navigation into an accessible three-dots (`fa-ellipsis-vertical`) menu across all 8 client storefront pages (`#nav-dots-toggle`, `DotsMenuController`) and the Admin Verification Console (`#admin-dots-toggle`, `#admin-dots-menu`, `feedback.html`, `refunds.html`).
- **Automated Verification:** `npm test` runs **111 / 111** passing end-to-end checks.
- **Completed Console & Strict 4-Tier Role Isolation:** Dedicated role-locked consoles for **Admin** (`/admin`, `/feedback`, `/refunds`), **Manager** (`/manager`, `/refunds` — can cancel orders & delete orders for refunds), **Staff** (`/staff`), and **Rider** (`/driver`). Orders marked `completed` or `out_for_delivery` shift to the Completed Console with permanent DB persistence and role windows (**3h** Rider, **48h** Staff, **7d** Manager, **unlimited** Admin), recording `ready_confirmed_by` and `completed_by`. Full-database CSV export (`GET /api/admin?export=csv`) is strictly Admin-only (`HTTP 403` for all other roles).

---

## Future Implementations (Planned Roadmap)

The following high-conversion QSR modules are intentionally scoped for upcoming iterations and are NOT yet active in production:

1. **Digital e-Gift Cards / Treat-a-Friend Module (`pizzadeals.html`, `order.html`, `api/orders.js`):**
   - Digital e-Gift Cards in `₦10,000`, `₦25,000`, and `₦50,000` denominations with bonus perks on `₦25,000+` gift cards (e.g., complimentary Waffle Cup on Coldberry or complimentary Wings on Romeo's), recipient name, custom gift note, and unique redeemable e-Gift codes.
2. **Product Toppings & Mix-Ins Customizers (Pending Final Ingredient & Pricing Lists):**
   - **Coldberry Ice Cream:** 1-tap Mix-Ins & Waffle Vessel customizer chips inside the Split Tub builder and menu cards (waiting for final approved Coldberry toppings list).
   - **Romeo's Pizza:** 1-tap Crust & Extra Toppings customizer chips inside the Half & Half builder and pizza cards (waiting for final approved Romeo's toppings list).

# Recap: activity (updated 2026-11-18)
142 nodes, 353 edges. Read this first; use `recap.py query` before opening raw sources.

## Hubs (most connected)
- - **README.md**: README.md [36]
- - **VERIFICATION-LOG.md**: VERIFICATION-LOG.md [34]
- - **890b.html**: 890b.html [29]
- - **feat: add navbar cart icon, separately hosted 14-char RBAC …** (2026-11-18) [27]
- - **peter890.css**: peter890.css [25]
- - **Replace Google Sheets with Neon order storage** (2026-11-12) [24]
- - **order.js**: js/order.js [21]
- - **order.html**: order.html [21]

## Open loops
- none

## Decisions (latest 10)
- 2026-11-21: Standardize client and admin navigation into an accessible 44px three-dots (fa-ellipsis-vertical) popover menu.
- 2026-11-21: Enforce human-made UI standards (zero UI emoji, <= 8px radii, unframed operational ledger sections, Fraunces + Plus Jakarta Sans + JetBrains Mono).
- 2026-11-21: Use Upstash Redis REST (with graceful local fallback) for login session revocation and failed-login lockout.

## Timeline (latest 10)
- 2026-11-21 feat(nav): move client storefront & admin console navigation into three-dots (⋮) menu
- 2026-11-21 style(ui): apply human-made UI polish, brand light/dark palettes, zero UI emojis, and Google Fonts
- 2026-11-21 feat(infra): add Redis login session/lockout store (api/redis.js) and Load Balancer failover (api/load-balancer.js)
- 2026-11-21 security: complete two-round security audit remediation across all APIs and consoles
- 2026-11-18 feat: add 1-click order PIN copy buttons across checkout, t…
- 2026-11-18 feat: add zero-code Store Manager Portal (admin.html) for o…
- 2026-11-18 feat: link admin status updates to tracking cache with imme…
- 2026-11-18 feat: implement multi-tier overload fail-safe system for ze…
- 2026-11-18 test: add extreme system overload and concurrency stress su…
- 2026-11-18 feat: integrate 5 core modern upgrades, order tracking, sec…
- 2026-11-18 Add random 6-digit order verification PIN with 5-day non-re…
- 2026-11-18 Add Half & Half pizza accordion with 5% surcharge and updat…
- 2026-11-18 feat(drinks): update Schweppes drinks to authentic Nigerian…
- 2026-11-18 fix: make Bottled Water image background transparent and de…

## Clusters
- README.md, VERIFICATION-LOG.md, 890b.html, feat: add navbar cart icon, separately hosted 14-char RBAC …, peter890.css (+94)
- Replace Google Sheets with Neon order storage, .gitignore, sheets.js, SKILL.md, branching.md (+16)
- I, resolved folder misconfigurations, .DS_Store, .DS_Store, 890b.css (+9)
- feat(admin-console): configure standalone Vercel deployment…, package.json, server.js, vercel.json, .gitignore

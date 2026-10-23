# हाम्रो नेपाली डेरी — Hamro Nepali Dairy

A Nepali wholesale dairy shop with server-verified Supabase authentication and a Supabase PostgreSQL business database. Node.js 24 or newer is required. No user password, database password or secret service key is bundled in the frontend.

## First start on Windows

1. Extract the ZIP into a new folder. Keep your old project and data as a backup.
2. Open this folder in VS Code. Open Terminal and run `npm ci`.
3. Run `Copy-Item .env.example .env` only on this new installation.
4. In your Supabase project, open **Connect** and copy the **session pooler** PostgreSQL URL. Put it in `.env` as `DATABASE_SETUP_URL`. Replace its database-password placeholder locally. This is the database password, not your customer login password. Never paste it into chat or commit `.env`.
5. If TLS verification requires your project's CA, download its certificate from Database settings and set `DATABASE_CA_CERT` to that local path. Never disable certificate verification.
6. Run `npm run setup:database`. It generates a restricted server password locally, verifies the connection, saves `DATABASE_URL` in `.env`, and removes the administrator setup URL. It will not overwrite an existing configured DATABASE_URL.
7. Run `npm start`, then open http://localhost:3000/auth.html. Keep the terminal open.

The `dairy` schema has already been applied to project `qmsxwulvmwjbjhnqpzlw`. Do not rerun its initial migration against that project. Existing Supabase users and roles are retained. Configure Supabase Auth's Site URL and allowed redirect URLs for your local or production domain, including `/auth/callback` and `/auth/callback?next=reset`.

The app has no local SQLite fallback. If the database is unavailable, operations fail instead of silently creating another database. Existing local orders are not automatically uploaded. New Supabase inventory starts empty; enter actual available stock through the admin interface.

## Database layout

Supabase Dashboard → Table Editor → choose schema **dairy**.

| Table | Purpose |
|---|---|
| orders | Order status, payment, totals, immutable checkout snapshot and readable generated contact/delivery fields |
| order_items | Product, quantity, unit price and subtotal; created atomically with each order |
| inventory | Shared available stock and low-stock thresholds |
| daily_inventory | Date-specific available stock |
| stock_movements | Receipts, waste, adjustments, reservations and cancellations |
| delivery_days | Per-date total capacity |
| delivery_slots | Morning/afternoon capacity by date |
| saved_addresses | Customer-owned reusable addresses |
| support_tickets | Complaints, cancellation/refund requests and staff replies |
| standing_plans | Customer recurring-order drafts requiring manual submission |
| order_events | Order audit history and in-app notifications |
| shop_settings | Nepal-time cutoff and preparation lead days |
| operation_errors | Sanitized reference, action and time; no submitted credentials |
| schema_version | Backend compatibility version |

Authentication remains in Supabase **Authentication → Users**. The existing `public.account_profiles` and `public.account_roles` hold profile and protected role information. Passwords are managed by Supabase Auth; never add a password column to business tables. Product definitions and trusted pricing remain in `lib/catalog.mjs` in this release; inventory is in PostgreSQL.

## Access and security structure

- Browser → Node API → verified Supabase user/role → PostgreSQL.
- Customers can access only their own orders, addresses, standing plans and tickets. Staff actions require the verified admin role on every request.
- No database URL or server credential is sent to the browser. `.env`, source files, database dumps and test files are not served.
- Anonymous and authenticated browser database roles have no access to the `dairy` schema. Every business table has RLS; a restricted server role has only necessary table permissions. Authorization is additionally enforced in the Node API; RLS here is a server-only boundary, not a claim of per-customer SQL policies.
- `hamro_server` has no superuser, role creation, database creation or RLS-bypass permission. Runtime refuses administrator database credentials.
- SQL values are bound parameters. Transactions and a database-level advisory lock prevent competing writers from over-reserving stock or delivery capacity across Node instances.
- Auth sessions use HttpOnly, SameSite cookies and Secure cookies on HTTPS. Public deployment requires HTTPS. API and auth responses are no-store. Origin checks reject cross-site writes.
- Password fields clear on submission, failure and page exit. Recovery requests omit passwords. Form fallback uses POST; passwords cannot fall into a GET URL when scripts fail. Your own browser can still inspect credentials you enter in DevTools.
- Shop and login pages restrict script sources with CSP. Styles currently allow inline attributes for existing UI; do not describe this as a fully strict CSP.

## Preserved features

Product minimum quantities, server-calculated totals, area-based delivery fees, manual fees for other areas, Nepal cutoff, shared/date stock, stock/waste ledger, duplicate-order protection, order status and customer history, admin tools, cash-on-delivery receipts, bank/wallet credential gating, support requests, in-app notifications, reorder, regular-order drafts, reports, manual backups, up to ten saved addresses and capacity-limited delivery slots are retained. Online payments remain deferred.

## Old data and backups

Keep your previous app stopped during a final data transfer. Export a v3 business backup from your independent admin dashboard. On a NEW EMPTY Supabase business database run:

`npm run import:backup -- C:\path\backup.json`

The importer refuses a nonempty destination, commits all rows together, preserves stock balances and reconstructs order line items. It accepts independent v3 and Hamro PostgreSQL exports, not raw Sites identities. Verify ownership, counts and totals before accepting new orders. Do not run old SQLite and new PostgreSQL apps simultaneously against separate order records.

Admin exports now use `hamro-dairy-postgres-v1`. Automatic backup scheduling is not configured. Verify your Supabase plan's backup/restore facilities, add an independent protected export as appropriate and rehearse restoration. Authentication and role administration are separate from commerce JSON exports.

## Source structure

- `public/`: Nepali pages, images, styles and frontend scripts only.
- `lib/auth.mjs`, `lib/session.mjs`: verified authentication and session authorization.
- `lib/http-app.mjs`: HTTP routing, protected static root and request safeguards.
- `app/api/shop/route.js`: shop API and server-enforced customer/admin actions.
- `lib/commerce.mjs`, `operations.mjs`, `improvements.mjs`, `delivery-options.mjs`: business rules.
- `lib/postgres.mjs`: restricted PostgreSQL connection and transaction adapter.
- `supabase/migrations/`: initial server-only commerce schema, constraints, grants and RLS.
- `scripts/setup-database.mjs`: local restricted credential setup.
- `scripts/import-business-backup.mjs`: transactional import into empty business tables.
- `tests/`: regression, authentication, privacy, migration and PostgreSQL integration tests.
- `drizzle/`, `lib/sqlite.mjs` and old restore scripts: legacy test/import compatibility only; not used by `npm start`.

## Still required before public launch

Production SMTP and real-inbox signup/recovery tests; admin MFA; disabled-account/session revocation tests; production domain and HTTPS host; proxy-aware/shared rate limiting for multi-instance deployments; automated backups and restored-data rehearsal; monitoring/alerts; business contact/policy review; real-device and slow-connection acceptance tests. Phone/SMS login and external order emails are not implemented. Supabase's security advisor reports leaked-password protection disabled; enable it if supported by your plan. See https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.

Payments, staff delivery assignments, batch expiry management and automatic order subscriptions have not been added. Existing recurring plans create drafts only.

## CI/CD

See **CI-CD.md** for the push/PR → checks → scans → staging → production workflow. It is included but not yet installed in a GitHub repository or connected to hosting. Publication and deployment default to disabled.

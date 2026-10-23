# Verification — 19 October 2026

53 automated tests passed on Node.js 24. The suite covers the existing commerce rules, authentication boundaries, credential handling, private addresses, delivery slots and a PostgreSQL integration workflow.

## Tested

- Existing minimum quantities, trusted pricing, area delivery fees, Nepal-time cutoff, atomic stock reservation, duplicate requests, cancellation, cash receipt confirmation, customer ownership and admin permissions.
- Separate customer/admin sessions over the real local HTTP server with simulated Supabase transport. HttpOnly cookies, unconfirmed-account rejection, role refresh, metadata privilege attempts, origin checks, no-store responses and denial of private source/configuration files.
- Password field clearing, password-free recovery requests and a POST fallback that prevents form credentials entering the URL.
- Saved-address isolation, stale-update rejection and immutable order-address snapshots.
- Competing requests for a limited slot, idempotent retries, cancellation releasing capacity and admin-only capacity changes.
- Legacy SQLite backup/import and migration checks for compatibility.
- PostgreSQL integration using PGlite (embedded PostgreSQL): schema creation, restricted server role, checkout, line-item capture, stock reservation, slots, retry rejection, customer ownership, reorder, standing plans, support, delivered cash receipts, reports, backup and cancellation.
- Hosted Supabase metadata: all 14 dairy tables have RLS enabled; anonymous/authenticated browser roles lack schema access; hamro_server has no superuser, database/role creation or RLS-bypass rights.
- Hosted bootstrap membership: postgres already has ADMIN OPTION on hamro_server, but not SET ROLE permission. No additional role grant was applied.

## Limits and outstanding checks

The PostgreSQL integration tests run locally, not through the user's production connection. A hosted SET ROLE smoke check was denied by the existing role configuration; no test business data was committed. The local setup step must verify an actual restricted-account connection using the user's database setup URL.

Real-inbox confirmation/recovery, live admin/customer login, MFA, connection-pooler configuration, actual phone/desktop appearance, throttled-browser behaviour, hosting, monitoring and backup restoration remain deployment checks. Browser automation could not run because the Chromium download was invalid; no visual browser QA is claimed.

No customer account was created, email/SMS sent, real payment made, or old local business data imported. The existing hosted Sites website is unchanged. Supabase's security advisor reports leaked-password protection disabled; see README.md.

Production dependency audit: `npm audit --omit=dev --audit-level=high` reported zero vulnerabilities on 19 October 2026.

## CI/CD update

Three deployment-contract tests verify immutable-image validation, exact-release health checking and failure on stale releases. Syntax/CSP checks pass. A checksum-verified Gitleaks 8.30.1 directory scan found no secrets using the project config; public Supabase publishable-key assignments are explicitly allowed. Playwright discovers two browser tests. Their execution, Docker image build and a complete GitHub run are not yet verified in this workspace. See CI-CD.md for the deployment contract and activation requirements.

Auth response regression: empty, non-JSON, truncated and structurally invalid responses display a safe HTTP-status message, clear passwords, re-enable the form and do not retry automatically. This does not identify the cause of an empty response on a user's separate installation.

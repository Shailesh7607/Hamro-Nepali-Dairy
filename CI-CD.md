# CI/CD for हाम्रो नेपाली डेरी

This package contains a GitHub Actions workflow matching the supplied diagram. It is **prepared, not activated**: no repository has been updated, image published, hosting configured or deployment triggered by this work.

## Pipeline behaviour

| Stage | Behaviour |
|---|---|
| Trigger | Every push, every pull request, or manual workflow run |
| Build/test | Node 24, reproducible dependency install, JavaScript syntax/CSP checks, 53 unit/HTTP/PostgreSQL/deployment tests, desktop/mobile checkout tests, Docker build and import smoke test |
| Scan | npm audit fails on high/critical dependency vulnerabilities; pinned/checksum-verified Gitleaks checks Git history for secrets |
| Publish | Only main, after both checking jobs pass, and only when explicitly enabled; publishes the same built container to GitHub Container Registry |
| Staging | Optional, main only, deploys the immutable image digest and checks database readiness and exact release SHA |
| Production | Requires successful staging, an enabled production flag, a manual run on main with DEPLOY entered, and any configured GitHub environment approval |

There is no frontend compilation step for this plain JavaScript app. `npm run lint` checks JavaScript syntax and inline-script restrictions; it is not a comprehensive style linter. The dependency audit covers packages, not a container operating-system vulnerability scan.

## 1. Put this edition in the correct repository

Use the Hamro source in this ZIP as the project root: `package.json`, `.github`, `public` and `server.mjs` must be at the repository root. The earlier Lovable repository may contain a different implementation; do not merge both folder trees indiscriminately. Back up that version or use a new repository for this independent edition.

Commit `.github/workflows/pipeline.yml`, `.github/dependabot.yml`, `.gitleaks.toml`, the lockfile and the tests. Never commit `.env`, database credentials, certificates with private keys, database exports or real customer data. The publishable Supabase project key in `.env.example` is intentionally public; the scanner permits only that specific kind of assignment.

Open GitHub → Actions → Dairy pipeline. The first push should run Build and test and Security scans. Publishing and deployment are skipped by default.

## 2. Require checks before merging

After the first run registers the check names, configure the main branch's ruleset/branch protection to require **Build and test** and **Security scans**. Require review of application/security changes, restrict who can bypass checks and protect workflow changes. Dependabot is configured to propose weekly npm, GitHub Actions and Docker updates; it does not automatically merge them.

GitHub Actions and branch/environment protections depend on repository visibility and your GitHub plan. Reviewers can be added to the production environment if your plan supports them. A manual DEPLOY input is an intentional release step, not a substitute for independent review or access control.

## 3. Enable container publication only when ready

Repository Settings → Secrets and variables → Actions → Variables:

- `CONTAINER_PUBLISH_ENABLED`: `true`

The publishing job alone receives `packages: write`. PR/test jobs have read-only repository permissions and no production database secrets. GitHub Actions are pinned by commit SHA. Test artifacts contain no live account data.

The image is built once, saved as a short-lived workflow artifact, loaded by the publishing job and pushed with the commit SHA tag. Staging and production use its immutable `@sha256:...` reference. Configure GHCR package access and the host's read-only pull credential according to the visibility you choose. Do not make a private package public merely to bypass authentication.

## 4. Connect hosting — provider-specific work still required

Choose a host that can run the Node Docker image over HTTPS and reach Supabase. Create separate staging and production environments with separate Supabase projects/data. Never run staging against your live order database.

The included `scripts/deploy.mjs` implements a **host-neutral contract**, not a preconfigured Render/Vercel/other-provider integration. A normal provider deploy-hook URL may not support this contract. Add a host-specific adapter, or implement a protected endpoint that:

1. Authenticates the bearer token and authorises the target environment.
2. Accepts `image`, `commit` and `environment` JSON fields.
3. Deploys exactly that image digest, not an arbitrary latest branch build.
4. Preserves server-side environment settings and secrets.
5. Returns a 2xx acknowledgement; deployment is only successful when `/healthz` subsequently reports the expected commit and healthy database.

The workflow polls for up to about ten minutes. A webhook acknowledgement alone does not count as success. Failed verification blocks production. No automatic database migrations or automatic rollback is performed.

Create GitHub environments **staging** and **production**. For each set:

| Setting | Type | Value |
|---|---|---|
| DEPLOY_HOOK_URL | Environment secret | HTTPS deployment endpoint implementing the above contract |
| DEPLOY_TOKEN | Environment secret | Token scoped to that environment's deployment endpoint |
| HEALTH_URL | Environment variable | HTTPS app `/healthz` URL |

Store `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `APP_ORIGIN` and any mail/payment settings in your hosting environment. Do not put the database setup administrator URL into the running service. Retain the image's `RELEASE_SHA` value so deployment verification works.

When the integration is ready, enable these **repository** variables:

- `STAGING_DEPLOY_ENABLED`: `true`
- `PRODUCTION_DEPLOY_ENABLED`: `true` only after staging validation.

Production: GitHub → Actions → Dairy pipeline → Run workflow → branch main → enter DEPLOY. Both checks, image publication and staging must succeed first. Configure required reviewers and main-only deployment branches in the production environment where supported.

## 5. Releases and rollback

Record each successful commit and image digest in your release notes. Retain the previous known-good image. If a release fails, inspect the host and restore the previous digest through the host's controls, then verify its health and order flow. Database migrations need a backup, compatibility review and separate approval; rolling back an image cannot undo data changes safely by itself.

## Local checks

```
npm ci
npm run lint
npm test
npm audit --audit-level=high
npx playwright install chromium
npm run test:e2e
```

Browser tests launch `tests/e2e-server.mjs`: an isolated embedded PostgreSQL database and synthetic customer identity. They do not validate real Supabase email/password delivery and never use production credentials. The test server is not included in the Docker image and is never started by `npm start`.

## Verified here / not verified here

- 53 Node tests passed, syntax checks passed, and the current source directory's Gitleaks scan found no secrets after excluding the intentionally public publishable-key assignment.
- Workflow YAML parsed; Playwright discovers two tests (desktop and mobile).
- Actual browser tests, Docker build and the complete GitHub-hosted pipeline still require the first GitHub run. Chromium could not be downloaded in this workspace, and Docker is unavailable here.
- No live hosting integration, image publication, deployment or Git-history scan has been performed here. History scanning begins after this source is committed to a repository.

References: https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments and https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments

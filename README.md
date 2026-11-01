# CRM Backend

Node.js / Express / MongoDB backend for the CRM platform.

## Prerequisites

- Node.js 20.x
- MongoDB instance (local or Atlas)
- npm 10.x

## Environment setup

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `DATABASE` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret used to sign JWT tokens |
| `NODE_ENV` | No | `development` / `staging` / `production` |
| `PORT` | No | HTTP port (default `8888`) |
| `PUBLIC_SERVER_FILE` | No | Base URL for publicly served files |
| `DO_SPACES_KEY` / `DO_SPACES_SECRET` / `DO_SPACES_NAME` / `DO_SPACES_URL` / `REGION` | No | DigitalOcean Spaces file storage |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | No | AI integrations |
| `RESEND_API` | No | Transactional email via Resend |

## New project setup

Run these two commands in order when setting up a fresh database:

### 1. Seed the database collections

```bash
npm run setup-db
```

This seeds the following (idempotent — safe to re-run):

- **Permissions** — default permission documents for all non-owner roles (`admin`, `manager`, `employee`, `create_only`, `read_only`)
- **Settings** — app, company, finance, invoice, quote, and money-format defaults
- **Taxes** — default 0% tax entry
- **Payment modes** — default payment mode

### 2. Create the first admin user

```bash
npm run create-admin -- --email=you@example.com --password=YourPassword --name=First --surname=Last
```

| Parameter | Required | Description |
|---|---|---|
| `--email` | Yes | Login email |
| `--password` | Yes | Password |
| `--name` | No | First name (defaults to `Admin`) |
| `--surname` | No | Last name (defaults to empty) |

The account is created with `role: owner` and `enabled: true`. The script refuses to create a duplicate — it exits with an error if that email already exists. It also upserts Permission documents for all non-owner roles, so sub-users created afterwards will have correct defaults.

You can also create admins without the CLI via **Settings → Administrators** in the web app.

## Development

```bash
npm install
npm run dev
```

## Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Start with nodemon (watches for changes) |
| `npm start` | Start in production mode |
| `npm run setup-db` | Seed DB collections (idempotent) |
| `npm run create-admin` | Create an owner admin account |
| `npm run setup` | Legacy: creates demo admin + seeds collections |
| `npm run reset` | Delete all admin and settings data |

## Production Server Deployment
railway login
railway link
railway up



TODO!!!
All 13 tasks complete. End-to-end foundations + vertical slice working against Railway staging Postgres.

Setup & data migration (Tasks 1-6)
- pg + pg-hstore installed, mysql2 dropped
- DATABASE_URL + PGSSL=require set in .env (public TCP proxy)
- Schema gap audit found and fixed 4 real issues in src/db/index.js: Upload table was missing 7 fields including the file-type ENUM; Warehouse had address instead of additional_notes; Quote was missing credit/approved/isExpired/converted; Invoice was missing converted_offer_id. Added compound unique index (number, year) on Invoice and Quote.
- db:sync → 22 tables created on Railway Postgres 18.6
- Migration script rewritten to use raw mongodb driver (not Mongoose — avoids the dual-instance resolution problem). Added migrateUploads() and migrateQuoteFiles() fills (both were missing).
- All 15 source collections migrated with 0 row-count diffs. Invoices, inventory stock_all sums, and sales rows spot-check cleanly.

Controller porting (Tasks 7-11) — 4 parallel agents ported 21 files + 4 setup scripts:
- Group 1: 5 settings middleware files
- Group 2: 5 settings controllers
- Group 3: Permission controller
- Group 4: 7 admin/user mgmt files (incl. user → admin_id rename)
- Setup: createAdmin.js, setupDb.js, setup.js, reset.js
- Plus unblocking fixes: created src/models/utils/index.js (replaces the Mongoose glob-based routes list), minimal top-level Sequelize-ify of 11 appController index.js files + coreControllers/setup.js + handlers/downloadHandler/downloadPdf.js + middlewares/serverData.js

Smoke tests (Task 12) against localhost:8889 → Railway Postgres:
- POST /api/login → JWT returned, admin_sessions row created
- GET /api/setting/listAll → 54 settings
- GET /api/permission/my → 28 permission keys for owner role
- GET /api/admin/read/:id → correct payload
- GET /api/admin/list → 5 admins (3 migrated + 2 smoke)
- POST /api/logout → session row deleted
- Post-logout request → 401 "Session expired" ✓

Parity vs crm-backend staging (Task 13) — 5 login error paths tested, 3 byte-identical, 2 cosmetic shape diffs (new omits raw Joi error._original/error.details; frontend confirmed not to consume those keys).

Known fragility (follow-up work):
- 25 mongoose.model('X') calls remain inside method bodies of app controllers (invoice, quote, payment, sales, inventory, warehouse, client, kogan tooling, chat). These load fine via the mongoose devDep shim but will throw at endpoint-invoke time. Groups 5-16 need to be ported before toblo-frontend-next's business pages are usable.
- Sequelize sync({alter:true}) has a bug on ENUM+UNIQUE columns on Postgres → migration script now uses {alter:false} and relies on db:sync running first. Documented inline.
- Setting model has no created/updated columns — only noticed in listAll sort; fixed by sorting on id. If any other code expects settings.created, add it to the model and re-run migration.

✻ Churned for 13m 15s

※ recap: Migrating crm-backend from MongoDB to Postgres on crm-backend-sql; staging Postgres is set up, 15 collections migrated with row counts matching, and login/settings/permission/admin endpoints smoke-test green. Next: port Groups 5-16 (invoice, quote, payment, sales, inventory, warehouse, client, kogan, chat controllers) so business pages work. (disable recaps in /config)

❯ for production what do we need to do, especially the data migration

────────────────────────────────── 1 new message ──────────────────────────────────

Here's the production checklist, with data migration called out in detail.

0. Blocker — port Groups 5–16 first

The vertical slice tests login + settings + admin + permissions. All business endpoints (sales list, invoice create, quote convert, payment record, inventory stock update, warehouse, kogan upload, chat, PDF generation) still have mongoose.X() calls inside method bodies and will throw at endpoint-invoke time. 25 remaining mongoose.model('X') call sites.

If you deploy to prod now, toblo-frontend-next's dashboard, invoice/quote/payment pages, inventory, sales, kogan upload, and AI chat all 500. Finish Groups 5–16 of MIGRATION_TODO.md before cutover (we can split this into another round of parallel agents the same way we did Groups 1–4).

---
1. Provision production Postgres on Railway

In the production Railway project (same one that currently hosts crm-backend + prod Mongo):

1. + New → Database → Add PostgreSQL. Name it postgres-production.
2. Do NOT expose the public TCP proxy on prod (we did that on staging for local access only). Prod uses postgres.railway.internal service-to-service.
3. Choose a Postgres plan with enough storage. The staging DB is ~380 rows but prod may be larger — budget for 10× current sales table size.
4. Enable automated backups (daily, 7-day retention minimum) in the Postgres service Settings → Backups.

2. Deploy crm-backend-sql to Railway production

1. Create a new service in the production project: + New → GitHub Repo → crm-backend-sql on the production branch.
2. Env vars on that service:
  - DATABASE_URL=${{Postgres.DATABASE_URL}} (service reference — Railway auto-injects the internal URL)
  - PGSSL=require
  - NODE_ENV=production
  - JWT_SECRET=<strong 32-byte hex> — generate fresh for prod, do NOT reuse staging
  - ANTHROPIC_API_KEY, OPENAI_API_KEY, RESEND_API, DO_SPACES_* — copy from current prod crm-backend
  - PORT — Railway sets this automatically
3. Do NOT set DATABASE= (mongo URL) on the deployed service. That var is only needed for running the migration script.
4. railway.toml currently has startCommand = "npm start" — this calls syncDatabase({ alter: false }) on boot (because NODE_ENV=production), which is correct for prod. No schema alterations happen at boot.
5. Dependency hygiene before deploying:
  - Confirm mongoose is in devDependencies (not dependencies) in package.json — Railway doesn't install devDeps for a production build by default, so the shim stays out of the prod bundle only if no runtime require('mongoose') remains. Current status: Group 5–16 controllers still require('mongoose') at module top. Must be fixed before deploy, else boot fails on Railway production.
  - mongodb driver (for the migration script) is also devDep — fine, migration runs from a workstation or Railway shell with devDeps installed.
6. Deploy and verify boot logs show PostgreSQL connection established + PostgreSQL schema synced + Express running.
7. Run on the Railway shell (one-off, before migration):
npm run db:sync    # create 22 tables in prod Postgres
npm run setup-db   # seed permissions + default settings + tax + payment mode

3. Data migration — the actual production run

3a. Dry-run on a snapshot

Do not run the migration against the real production target first. Instead:

1. Snapshot the prod Mongo: Railway Mongo plugin → Settings → "Create backup" (or mongodump to local).
2. Restore the snapshot into a temporary Mongo instance (Railway side-service, or local Docker).
3. Create a temporary Postgres service (Railway or local) with the same schema (npm run db:sync).
4. Point .env at the temp pair and run:
DATABASE=mongodb://<snapshot-url> \
DATABASE_URL=<temp-postgres-url> \
npm run migrate:mongo-to-postgres
5. Run row-count parity (the same script we used for staging) and spot-checks. Capture any migration errors — this is your chance to catch prod-only data edge cases (orphaned refs, encoding issues, unexpected ENUM values).
6. Resolve any issues in src/migration/mongoToPostgres.js. Iterate until the dry-run produces 0 row-count diffs.

3b. Freeze window + real migration

Pick a low-traffic window (ideally weekend early morning). Expected downtime: 15–60 minutes depending on prod volume.

1. T-24h: notify users of planned maintenance window.
2. T-10min: take a fresh prod Mongo backup.
3. T-0 (freeze): put the current crm-backend into read-only mode. Two options, in preference order:
  - Preferred: scale crm-backend to 0 replicas on Railway. Frontend will show errors — acceptable for a short window and prevents any new writes slipping through.
  - Fallback: temporarily rotate the frontend's NEXT_PUBLIC_BACKEND_SERVER to a maintenance page.
4. Run migration from a shell with network access to BOTH prod Mongo (public TCP proxy or VPN) AND prod Postgres (public TCP proxy temporarily enabled for this window — see note below). From the crm-backend-sql directory:
DATABASE="mongodb://<prod-mongo-URL>" \
DATABASE_URL="postgresql://<prod-postgres-public-URL>" \
PGSSL=require \
npm run migrate:mongo-to-postgres | tee /tmp/prod-migration.log
4. The script is idempotent (findOrCreate / ignoreDuplicates) so it's safe to re-run if it bails midway.
5. Verify against prod Mongo:
DATABASE=... DATABASE_URL=... node validate-parity.js   # the row-count script we built
5. Specifically confirm: sales count matches, every invoice has correct credit sum vs payments, inventory.stock_all matches junction sum per SKU, and admin_sessions for existing admins carried over (otherwise everyone re-logs in — may be acceptable).
6. Disable public TCP proxy on prod Postgres (go back to internal-only).

3c. Cutover

1. Switch frontend to the new backend: edit toblo-frontend-next/.env.production (or Railway env var) — set NEXT_PUBLIC_BACKEND_SERVER to the new crm-backend-sql production URL. Redeploy frontend.
2. Keep crm-backend deployed but at 0 replicas. Don't delete it. Keep prod Mongo running too. These are your rollback.
3. Smoke-test on prod the same vertical slice we did on staging (login + settings + a representative business endpoint from each Group 5–16).

4. Rollback plan

If something breaks within the first 24h:

1. Scale crm-backend-sql to 0 replicas.
2. Scale crm-backend back to its original replica count.
3. Flip NEXT_PUBLIC_BACKEND_SERVER back to the old URL. Frontend redeploys.
4. Any writes made to Postgres during the broken window are stranded — Mongo doesn't know about them. If writes occurred, you'll need a reverse-sync script before rollback. For a 1-hour outage window with no writes, that's fine. For 24h+, build a reverse migration before cutover.

5. Monitoring (first 72h after cutover)

- Railway logs on crm-backend-sql service — watch for 500s and SequelizeDatabaseError.
- Enable pg_stat_statements on the Postgres service → check top-10 slowest queries. Add indexes for anything > 500ms (we listed candidate indexes in crm-backend-sql-migration-workflow.md section 4c).
- Watch admin_sessions row growth — if the table grows unbounded, add a cleanup cron for tokens older than JWT expiry.
- 48h with clean logs → consider the migration successful. 30 days later → decommission crm-backend and prod Mongo.

---
Short answer to "what do we need to do, especially data migration"

Three concrete prerequisites before touching production:

1. Finish porting Groups 5–16 (invoice, quote, payment, sales, inventory, warehouse, kogan tooling, chat). I can launch the next round of parallel agents when you want.
2. Run a dry-run migration against a snapshot of prod Mongo into a disposable Postgres. Iterate on mongoToPostgres.js until row counts match and spot-checks are clean. Do NOT run against real prod until the dry-run is clean.
3. Plan a 15–60 min write-freeze window (scale old backend to 0, run migration, verify, flip frontend env var). Keep the old backend + Mongo on standby at 0 replicas for 30 days as the rollback option.
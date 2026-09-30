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
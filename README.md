# Meal Planning App

[![codecov](https://codecov.io/gh/GagnatDev/unforked/graph/badge.svg)](https://codecov.io/gh/GagnatDev/unforked)

Plan meals for the week: manage recipes, assign dinners by day, and export shopping lists.

- **Backend:** Node 24, TypeScript, Express 5, PostgreSQL (JSONB) via Kysely
- **Frontend:** React, TypeScript, Vite
- **Monorepo:** pnpm workspaces (`frontend/`, `backend/`)

A single Node process serves the API and the built SPA on port 8080.

## Run with Docker (recommended)

From the repo root:

```bash
docker compose up --build
```

- App + API: http://localhost:8080 (frontend and backend in one container)
- Postgres: localhost:5432 (user `meals`, password `meals`, db `meals`)

## Run locally (dev)

Uses **pnpm** ([Corepack](https://nodejs.org/api/corepack.html): run `corepack enable` once if `pnpm` is not on your PATH) and **Node 24**.

### 1. Install (once, at the repo root)

```bash
pnpm install
```

### 2. Database

```bash
docker compose up -d postgres
```

### 3. Backend

```bash
export DATABASE_URL=postgresql://meals:meals@localhost:5432/meals
export DISABLE_AUTH=true   # no auth sidecar locally; use the fixed dev admin
pnpm --filter @unforked/backend run dev   # tsx watch, auto-restart
```

Migrations run automatically at boot. API: http://localhost:8080

`DISABLE_AUTH=true` makes requests without the sidecar's `X-Homectl-*` identity
headers resolve to a fixed dev admin (see [Authentication](#authentication)).
Do not set it in production.

**Test data (dev):** set `SEED_TEST_DATA=true` to seed sample recipes on startup when the recipe table is empty (already enabled in `docker-compose.yml`). Do not set in production.

### 4. Frontend

```bash
pnpm --filter meal-planning-frontend run dev
```

Vite proxies `/api` to the backend. App: http://localhost:3000

### Repo-wide scripts (from the root)

```bash
pnpm dev      # frontend + backend in parallel
pnpm build    # build both workspaces
pnpm test     # run workspace tests
```

## Tests

Backend tests use Testcontainers (PostgreSQL), so Docker must be running:

```bash
pnpm --filter @unforked/backend run test          # vitest
pnpm --filter @unforked/backend run test:coverage # + v8 coverage (lcov)
pnpm --filter meal-planning-frontend run test:unit
pnpm --filter meal-planning-frontend run e2e       # Playwright (boots the Node backend)
```

## Build for production

From the repo root: `docker build -t unforked .` — builds both workspaces and produces a single Node-24 image (a bundled `dist/server.js` + the SPA in `web/`) that serves everything on port 8080.

## Authentication

Production auth is handled by the [homectl-auth](https://github.com/GagnatDev/homectl-auth) **auth-proxy sidecar** (see `k8s/deployment.yml` and [docs/deploy.md](docs/deploy.md)): the sidecar runs the OAuth flow against `auth.homectl.no`, keeps the session in an encrypted `hs_session` cookie, and injects verified `X-Homectl-User` / `X-Homectl-Email` / `X-Homectl-Role` headers. The backend maps that identity onto its local `users` table by email (provisioning a user + family on first sighting); the frontend holds no token and just calls the API same-origin. There are no local passwords and no login page in this app anymore.

On the first boot with `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, and `INTERNAL_AUTH_URL` set, the backend runs a **one-time import** of the pre-existing local accounts (email + bcrypt hash + role) into homectl-auth via `POST /internal/users/import`, so existing users keep their passwords. Completion is recorded in the `auth_migration` table; re-boots skip it.

For local dev and e2e there is no sidecar: set `DISABLE_AUTH=true` and requests without identity headers resolve to a fixed dev admin.

## API

All `/api` routes read the sidecar identity headers (or the dev fallback).

- `GET /api/auth/me`
- `GET|PATCH /api/family`, `POST /api/family/invites`, `POST /api/family/invites/accept`
- `GET/POST /api/recipes`, `GET /api/recipes/tags`, `GET/PUT/DELETE /api/recipes/:id`, `POST /api/recipes/import`
- `GET/PUT /api/meal-plans/current?week=YYYY-Wnn`
- `GET /api/shopping-lists?week=YYYY-Wnn`
- `GET /health`

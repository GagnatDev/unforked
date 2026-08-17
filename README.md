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

- App + API: http://localhost:8082 (frontend and backend in one container)
- Machine API (API-key-authenticated, for other local apps like aivo): http://localhost:8086 — see [Testing the aivo↔unforked integration locally](#testing-the-aivounforked-integration-locally)
- Postgres: localhost:5632 (user `meals`, password `meals`, db `meals`)

Local ports are deliberately moved off this platform's defaults (8080/3000/5432) to avoid collisions when running several homectl apps side by side. Production still uses the defaults (see `k8s/deployment.yml`).

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
export DATABASE_URL=postgresql://meals:meals@localhost:5632/meals
export PORT=8082
export MACHINE_PORT=8086   # separate listener for the machine API; see docs/aivo-integration.md
export DISABLE_AUTH=true   # no auth sidecar locally; use the fixed dev admin
pnpm --filter @unforked/backend run dev   # tsx watch, auto-restart
```

Migrations run automatically at boot. API: http://localhost:8082

`DISABLE_AUTH=true` makes requests without the sidecar's `X-Homectl-*` identity
headers resolve to a fixed dev admin (see [Authentication](#authentication)).
Do not set it in production.

**Test data (dev):** set `SEED_TEST_DATA=true` to seed sample recipes on startup when the recipe table is empty (already enabled in `docker-compose.yml`). Do not set in production.

### 4. Frontend

```bash
pnpm --filter meal-planning-frontend run dev
```

Vite proxies `/api` to the backend. App: http://localhost:3002

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

On the first boot with `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, and `INTERNAL_AUTH_URL` set, the backend runs a **one-time import** of the pre-existing local accounts (email + bcrypt hash + role) into homectl-auth via `POST /internal/users/import`, so existing users keep their passwords. Completion is recorded in the `auth_migration` table; re-boots skip it. Ingress traffic is held until import completes (see [docs/auth-sidecar-migration.md](docs/auth-sidecar-migration.md)).

For local dev and e2e there is no sidecar: set `DISABLE_AUTH=true` and requests without identity headers resolve to a fixed dev admin.

## API

All `/api` routes read the sidecar identity headers (or the dev fallback).

- `GET /api/auth/me`
- `GET|PATCH /api/family`, `POST /api/family/invites`, `POST /api/family/invites/accept`
- `GET/POST /api/recipes`, `GET /api/recipes/tags`, `GET/PUT/DELETE /api/recipes/:id`, `POST /api/recipes/import`
- `GET/PUT /api/meal-plans/current?week=YYYY-Wnn`
- `GET /api/shopping-lists?week=YYYY-Wnn`
- `GET /health`

## Local integration testing

### Testing the aivo↔unforked integration locally

[Aivo](https://github.com/GagnatDev/aivo) talks to unforked over the **machine
API** (`docs/aivo-integration.md`), which is a separate listener/port from the
human API and frontend above — not the same `:8082` used by the browser. With
`docker compose up --build` running here, aivo (or any other local app) should
use:

- **Machine API base URL:** `http://localhost:8086` (routes under `/machine/v1/`,
  see `docs/aivo-integration.md` §5). This is published by `docker-compose.yml`
  precisely so another locally-running app can reach it.
- **Auth:** a real per-user API key, not `DISABLE_AUTH`. `DISABLE_AUTH=true`
  only affects the human API/frontend — the machine listener always requires a
  valid `Authorization: Bearer ufk_…` key (`backend/src/middleware/machineAuth.ts`).
  Create one from unforked's own UI (API-keys page) or `POST /api/api-keys`
  against the human API (`http://localhost:8082`, using the dev-admin fallback
  or a real session), then register the plaintext key on the calling app's
  side (e.g. aivo's own config/Secret for `UNFORKED_API_KEY`).

### Running the homectl-auth-proxy sidecar locally

To test with real homectl-auth sessions instead of `DISABLE_AUTH`, run the real
[homectl-auth-proxy](https://github.com/GagnatDev/homectl-auth) sidecar in
front of unforked's human API. Use a `LISTEN_PORT` distinct from aivo's sidecar
(`4180`), since both may run at once when testing the integration end-to-end:

```bash
docker run --rm -p 4181:4181 \
  -e LISTEN_PORT=4181 \
  -e PUBLIC_AUTH_URL=http://localhost:4400 \
  -e INTERNAL_AUTH_URL=http://localhost:4400 \
  -e UPSTREAM=http://host.docker.internal:8082 \
  -e AUTH_CLIENT_ID=unforked \
  -e AUTH_CLIENT_SECRET=<from the homectl-auth-registered dev secret> \
  -e DEV_FAKE_IDENTITY=<as documented in homectl-auth's sidecar docs> \
  ghcr.io/gagnatdev/homectl-auth-proxy:latest
```

Then browse to `http://localhost:4181` instead of `:8082` directly. See
homectl-auth's own sidecar docs for the exact `DEV_FAKE_IDENTITY` format and
image reference.

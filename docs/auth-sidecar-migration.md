# Migrating an app to the homectl-auth sidecar

A practical guide based on how [unforked](https://github.com/GagnatDev/unforked) moved from
homegrown password/JWT auth to the [homectl-auth](https://github.com/GagnatDev/homectl-auth)
**auth-proxy sidecar**. Use this when planning a similar migration in another app — especially
one with more users or a longer legacy history.

Homectl-auth also publishes generic sidecar docs:

- [integration.md](https://github.com/GagnatDev/homectl-auth/blob/main/docs/sidecar/integration.md) — wiring the sidecar
- [migration.md](https://github.com/GagnatDev/homectl-auth/blob/main/docs/sidecar/migration.md) — library → sidecar delta
- homectl-auth README — `POST /internal/users/import` contract

This document focuses on **application-level patterns** and **operational ordering** that those
guides do not spell out per app.

---

## Target architecture

```
Browser ──▶ Ingress ──▶ Service:80 ──▶ auth-proxy:4180 ──▶ app:8080
```

- The **sidecar** owns OAuth (`/auth/callback`), session cookie (`hs_session`), logout
  (`POST /auth/logout`), and in-cluster token refresh.
- The **app** is auth-agnostic: it reads verified `X-Homectl-User` / `X-Homectl-Email` /
  `X-Homectl-Role` headers on every `/api` request. No JWT signing, no login routes, no
  passwords in the frontend.
- The **Service must target the sidecar port**, never the app port directly. If clients can hit
  `:8080`, they can forge identity headers.

Local dev / e2e typically set `DISABLE_AUTH=true` and resolve header-less requests to a fixed
dev principal (see `backend/src/seed/devPrincipal.ts`).

---

## Prerequisites (do these in order)

### 1. Terraform: client secret + cookie key

In homectl-infra, set `auth = true` on the app and `terraform apply`. This writes
`AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, and `COOKIE_KEY` into `<app>-terraform-secrets` and
mirrors the client secret into homectl-auth's `auth-client-secrets` Secret.

### 2. homectl-auth: register the app **before** first deploy

Add the app to homectl-auth `apps.json` with:

- `allowedRedirectUris`: `https://<app>.homectl.no/auth/callback`
- `allowedOrigins`: `https://<app>.homectl.no`
- `roles`: names and ranks that match what your import and authorization logic expect

Unforked uses `user` (rank 1) and `admin` (rank 2). Role names in `apps.json` must match the
`role` field sent by your import and understood by your backend's `normalizeRole` helper.

Roll out homectl-auth after editing `apps.json` (`kubectl rollout restart deploy/auth`).

**Why order matters:** the one-time user import runs on first boot. If roles are wrong or the
app is unregistered, entries may be `invalid` or imported with the wrong grant. homectl-auth
**does not overwrite** password or role on re-import for existing emails (`skipped`).

### 3. Deploy the migrated app image

Only after steps 1–2. See [deploy.md](./deploy.md) for unforked-specific kubectl steps.

---

## Backend migration checklist

### Remove legacy auth

Delete (or stop mounting):

- `POST /api/auth/login`, `/setup`, `/register-invite`
- `POST /api/users` (admin account creation)
- JWT sign/verify, `JWT_SECRET`, `bcryptjs` password paths tied to login

Account lifecycle (passwords, SSO, app roles in homectl-auth) lives in homectl-auth after cutover.

### Identity middleware

Replace JWT/`Authorization` middleware with header reads:

| Header | Meaning |
|--------|---------|
| `X-Homectl-User` | homectl-auth subject (opaque id) |
| `X-Homectl-Email` | **Identity key** — map to your local `users` table |
| `X-Homectl-Role` | App-scoped role for this client (authoritative at request time) |

Pattern in unforked: `backend/src/middleware/auth.ts` → `requireAuth(db)`:

1. If headers missing and `DISABLE_AUTH=true` → fixed dev admin.
2. Else if headers missing → `401`.
3. Else `resolveLocalUser(db, email, role)`:
   - `findByEmail(email.trim().toLowerCase())`
   - on miss → JIT `createWithNewFamily(email, null, role)` (new user + solo family)
   - on unique race → re-read

**Important:** use **email** as the join key between homectl-auth and local rows so imported
users keep their existing `users.id`, `family_id`, and data.

The **header role wins** over the stored DB `role` at runtime (`GET /api/auth/me` returns the
header role). The DB column is a provisioning/import snapshot only.

### Nullable `password_hash`

After cutover, locally provisioned users have no password. Migration `004` in unforked does:

```sql
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
```

Keep legacy hashes in place for rollback — do not wipe them on import.

---

## One-time user import into homectl-auth

### API contract

In-cluster only:

```
POST http://homectl-auth.homectl/internal/users/import
```

```json
{
  "client_id": "<app-id>",
  "client_secret": "<plaintext secret>",
  "users": [
    {
      "email": "alice@example.com",
      "username": "alice",
      "passwordHash": "$2b$12$…",
      "role": "admin"
    }
  ]
}
```

- **Pre-hashed bcrypt** (bcryptjs cost 12) — plaintext passwords never traverse the wire.
- **Email is the dedupe key** — re-runs are safe (`created` vs `skipped`).
- **Per-entry results** — `created` / `skipped` / `invalid`; HTTP `200` even when some entries
  fail (best-effort batch).

See homectl-auth README for full semantics (`isAdmin` is operator-only; app admin → `role`).

### Unforked implementation

| Piece | Location |
|-------|----------|
| Import service | `backend/src/service/homectlUserImport.ts` |
| Env trio (`AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, `INTERNAL_AUTH_URL`) | `backend/src/config/env.ts` |
| Boot wiring (import before `listen`) | `backend/src/bootstrap.ts` |
| Exactly-once flag | `auth_migration` table, id `homectl-user-import` |
| Concurrency | Postgres advisory xact lock + double-check after lock |
| Batching | 200 users per request (stay under 1 MB body limit) |

**Who gets imported:** users with non-null `password_hash`. Users with `password_hash IS NULL`
(sidecar-provisioned / dev) are skipped — they must already exist in homectl-auth.

**When import runs:** during `startServer()`, after DB migrations, **before** `app.listen()`.
HTTP import failure → thrown error → process exit → k8s restart → retry. homectl-auth dedupes
on retry.

**When import is skipped:** row present in `auth_migration`, or env trio unset (local dev).

### Invalid entries — policy choice

homectl-auth may return `invalid` for bad bcrypt, unknown role names, etc. Unforked **still
writes `auth_migration`** and continues boot. Rationale: small user base; ops review import
summary logs; affected users can re-register in homectl-auth with the same email and JIT-map back
to their local row (data preserved, password reset).

For a **larger app**, consider failing boot when `invalid > 0` or when
`created + skipped + invalid !== importable.length`, and alert on the summary.

### Email normalization

Always normalize email **the same way** in:

- import payload (`trim().toLowerCase()`)
- JIT lookup (`resolveLocalUser`)
- optional pre-import SQL: `UPDATE users SET email = lower(trim(email))`

Mismatch between homectl-auth (lowercase) and legacy DB casing creates a **duplicate local
user** on first login — recipes/data stay on the old row.

### Roles on import

Send the app role grant homectl-auth should store, e.g. `normalizeRole(row.role)` → `user` |
`admin`. This only applies on `created`; `skipped` emails keep their existing homectl-auth
password and grants.

---

## Block traffic until import completes

Two mechanisms work together in unforked:

### 1. App: import before listen

`bootstrap.ts` awaits `importUsersToHomectlOnce()` before `app.listen()`. `/health` is
unreachable until import finishes (or is skipped).

### 2. Kubernetes: sidecar probes wait for upstream `/health`

The auth-proxy `/readyz` endpoint only checks JWKS — it becomes ready while the app is still
importing. **Do not use `/readyz` alone as the sidecar readiness probe** when Service traffic
enters through the sidecar.

Unforked's `k8s/deployment.yml` uses **exec probes** in the sidecar container that fetch the
app directly on the pod loopback:

```yaml
# startup: tolerate long first-boot import (30 × 10s)
startupProbe:
  exec:
    command:
      - node
      - -e
      - "fetch('http://127.0.0.1:8080/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
  failureThreshold: 30
  periodSeconds: 10

# steady-state: upstream healthy AND sidecar JWKS ready
readinessProbe:
  exec:
    command:
      - node
      - -e
      - "Promise.all([fetch('http://127.0.0.1:8080/health'),fetch('http://127.0.0.1:4180/readyz')]).then((rs)=>process.exit(rs.every((r)=>r.ok)?0:1)).catch(()=>process.exit(1))"
```

The app container keeps its own `startupProbe` / `readinessProbe` on `:8080/health`. The pod
is not Ready until **both** containers pass — ingress traffic cannot reach OAuth/login until
import is done.

**Scaling tip:** advisory lock + `auth_migration` flag still matter if you later run
`replicas > 1`; only one import runs, others block on the lock then skip.

---

## Frontend migration checklist

- Delete token storage, login page, admin “create user” UI.
- Replace authenticated `fetch` with same-origin `fetch` (session cookie only).
- On `401` from API → full page reload so the sidecar can redirect HTML navigations to login
  (see `frontend/src/lib/session.ts` — rate-limited to avoid reload loops).
- `AuthContext` loads `GET /api/auth/me` only.
- Logout → `POST /auth/logout` (sidecar), then navigate home.

**Invite flows:** if the old app registered invitees with a local password form, the new flow is:
sidecar signs the visitor in first → authenticated `POST /api/family/invites/accept`. Unforked
keeps `/register-invite?token=…` as a route name but renders join-family confirmation only
(`frontend/src/pages/JoinFamily.tsx`).

---

## Testing strategy

| Layer | Approach |
|-------|----------|
| Unit / integration | Drive identity via `X-Homectl-*` headers (`backend/src/test/app.ts` → `withAuth`) |
| Import | Mock `fetch`; test exactly-once, payload shape, HTTP failure retry, invalid tally |
| JIT | Test first-sighting provisioning, email normalization, existing-row reuse |
| E2e | `DISABLE_AUTH=true` + seeded dev principal; or full sidecar stack in staging |
| Pre-prod | Import against a DB **clone**; verify `invalid === 0` and spot-check admin role in homectl-auth |

`TEST_DATABASE_URL` / `E2E_DATABASE_URL` allow running tests against an existing Postgres
without Docker.

---

## Rollback

Homectl-auth is unchanged by the sidecar migration. Rollback is primarily config + image:

1. Repoint Service `targetPort` from sidecar (`4180`) back to app (`8080`).
2. Redeploy a pre-migration image with legacy JWT/password login.

Local `users.password_hash` values are retained in unforked, so the old code path keeps working.

---

## Suggested approach for a larger app

1. **Inventory users** — count, email normalization, bcrypt format, role distribution, users
   without passwords.
2. **Dry-run import** against a staging homectl-auth + DB clone; read per-entry `results`.
3. **Normalize emails** in DB before cutover if legacy data may have mixed case.
4. **Stricter invalid policy** — fail boot or page ops if any `invalid` (unforked intentionally
   does not).
5. **Batch size** — 200 works for unforked; tune down if payloads approach 1 MB (long hashes,
   extra fields).
6. **Probe timeouts** — `failureThreshold × periodSeconds` on app and sidecar startup probes
   must exceed worst-case import duration (network + user count / batch size).
7. **Communicate** — users will need the central login UI; JWT sessions and local passwords
   stop working at cutover.
8. **Keep rollback image** until a full login + core-flow smoke test passes in production.

---

## Unforked file index (quick reference)

| Concern | Path |
|---------|------|
| Import logic | `backend/src/service/homectlUserImport.ts` |
| Import tests | `backend/src/service/homectlUserImport.test.ts` |
| Auth middleware | `backend/src/middleware/auth.ts` |
| Boot order | `backend/src/bootstrap.ts`, `backend/src/server.ts` |
| DB migration | `backend/migrations/004_homectl_auth_sidecar.sql` |
| K8s sidecar + probes | `k8s/deployment.yml` |
| Deploy runbook | `docs/deploy.md` |
| Env example | `.env.example` |

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

## Recent findings (post-cutover) — read these first if you run a PWA

Unforked completed its cutover, then hit a handful of issues in production. Fixes landed in both
repos; the details are woven into the sections below, but here is the short list so a PWA
migration does not repeat them:

- **App registration is a ConfigMap edit, not a repo file.** In production the app list lives in
  the `homectl-auth-apps` ConfigMap (`k8s/configmap.yaml`, key `apps.json`), and each app needs a
  `clientSecretEnv` naming the env var that holds its client secret. A rollout restart is required
  for changes to take effect. → [Prerequisites #2](#2-homectl-auth-register-the-app-before-first-deploy)
- **`isAdmin` is no longer accepted on import.** homectl-auth's `isAdmin` is an operator-only,
  service-wide flag; the import endpoint now ignores it entirely and always creates users
  non-admin. Express an app "admin" via the per-app `role` grant. → [Roles on import](#roles-on-import)
- **Migration 009 (drop `username` UNIQUE) can silently skip on prod.** It needs table ownership;
  when the app's DB role lacks it the migration warns and boots anyway, but colliding usernames
  then import as `invalid` until the table owner runs the manual `ALTER`. → [Duplicate usernames](#duplicate-usernames-migration-009)
- **Spurious logouts "roughly every access-token lifetime" are a rotation race, not a TTL bug.**
  A stateless sidecar sends the same refresh token from concurrent requests; homectl-auth now
  tolerates that with a 30s rotation grace window (migration 010). Make sure the homectl-auth you
  target includes it. → [Sidecar session behavior](#sidecar-session-behavior-you-depend-on)
- **Silent, place-preserving re-auth beats "reload on 401".** The original "401 → full page load"
  advice loops on a PWA and dumps the user at the home page. Unforked now navigates to the current
  location, coordinates concurrent 401s into one navigation, caps attempts, and re-checks the
  session on tab focus. → [Frontend: session handling](#session-handling-401--silent-re-auth)
- **Redact identity from your own logs.** `pino-http` logs full headers by default; both
  homectl-auth loggers now redact `authorization` / `cookie` / `set-cookie`. Do the same in the
  migrating app. → [Operational notes](#operational-notes)
- **PWA icons and the web app manifest must be served *unauthenticated*.** When a phone installs
  the app to the Home Screen, the OS fetches the manifest and icons in a background context that
  carries **no** `hs_session` cookie. Behind the sidecar those requests 401, so the installed app
  shows a blank/letter icon — the icon never resolves, no matter how many times you re-add it or
  which icon you ship. Allowlist the exact discovery-asset paths in the sidecar (`PUBLIC_PATHS`)
  and everything else stays authenticated. → [PWA pitfalls #4](#pwa--service-worker-pitfalls)

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

Registration is the app list homectl-auth reads from `config/apps.json`. **In production that
file is mounted from the `homectl-auth-apps` ConfigMap** (`k8s/configmap.yaml`, key `apps.json`) —
so registering a new app means editing the ConfigMap and rolling out, not just committing a repo
file. Add an entry with:

- `id`: the app/client id (e.g. `unforked`)
- `name`: display name
- `clientSecretEnv`: **name of the env var** that holds this app's client secret (e.g.
  `UNFORKED_CLIENT_SECRET`). homectl-auth reads `process.env[clientSecretEnv]` and refuses to
  serve the app if it is unset, so the secret Terraform mirrors into homectl-auth
  (`auth-client-secrets`) must be exposed under exactly this name in the auth Deployment.
- `allowedRedirectUris`: `https://<app>.homectl.no/auth/callback`
- `allowedOrigins`: `https://<app>.homectl.no`
- `roles`: names and ranks that match what your import and authorization logic expect

Unforked's entry:

```json
{
  "id": "unforked",
  "name": "Unforked",
  "clientSecretEnv": "UNFORKED_CLIENT_SECRET",
  "allowedRedirectUris": ["https://unforked.homectl.no/auth/callback"],
  "allowedOrigins": ["https://unforked.homectl.no"],
  "roles": [
    { "name": "user", "rank": 1 },
    { "name": "admin", "rank": 2 }
  ]
}
```

Role names must match the `role` field sent by your import and understood by your backend's
`normalizeRole` helper.

Roll out homectl-auth after editing the ConfigMap: `kubectl rollout restart deploy/auth`. ConfigMap
changes are **not** hot-reloaded — without the restart the new app stays unregistered and its
first OAuth callback fails.

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
- **No `isAdmin` field.** The payload no longer accepts `isAdmin`; any value sent is ignored and
  imported users are always created non-admin. `isAdmin` is homectl-auth's operator-level,
  service-wide flag (access to the admin GUI that manages every user, app, invite, and reset), not
  an app-scoped role. Express an app "admin" via `role` instead (see [Roles on import](#roles-on-import)).

See homectl-auth README for full semantics.

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
password and grants. When `role` is omitted homectl-auth defaults it to the app's lowest-rank role.

Because `isAdmin` is no longer accepted, **`role` is the only way to express app-level admin**.
An imported user you want as an app admin must carry `role: "admin"` (or whatever your top-rank
role is named in `apps.json`). An existing homectl-auth operator (`isAdmin=true`) is matched by
email and left untouched — import never demotes or promotes the operator flag.

### Duplicate usernames (migration 009)

homectl-auth treats **email as the sole unique identity**; `username` is a display handle that may
collide freely across accounts (common when importing from an app that never enforced global
username uniqueness). homectl-auth migration `009_drop_username_unique.sql` drops the old UNIQUE
constraint on `username` to allow this.

**Watch out:** `DROP CONSTRAINT` requires ownership of the `users` table, and the app's
`DATABASE_URL` role may not own it (in prod it did not — the 2026-07-10 deploy first crashlooped
on `must be owner of table users`). The migration now catches `insufficient_privilege`, logs a
`WARNING`, and boots anyway — but until the table owner runs the manual drop, the constraint is
still live and **any colliding username imports as `invalid`** (reported specifically, matched on
`users_username_key`, not mislabeled as an email duplicate).

If your legacy user set has duplicate usernames, before cutover have the table owner run:

```sql
ALTER TABLE homectl_auth.users DROP CONSTRAINT IF EXISTS users_username_key;
```

Otherwise expect some `invalid` entries and reconcile them from the import summary.

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
  timeoutSeconds: 5 # `node -e` cold-start exceeds the 1s exec default under low CPU
  failureThreshold: 30
  periodSeconds: 10

# steady-state: same upstream check as startup
readinessProbe:
  exec:
    command:
      - node
      - -e
      - "fetch('http://127.0.0.1:8080/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
  timeoutSeconds: 5
```

**`timeoutSeconds` is not optional here.** An exec probe that spawns `node -e` pays a full
Node.js cold start on every invocation. With the sidecar's small CPU request that easily
exceeds Kubernetes' default `timeoutSeconds: 1`, so every probe times out before Node finishes
booting — the sidecar restarts on a loop and the pod never goes Ready, no matter how high
`failureThreshold` is. Set `timeoutSeconds` below `periodSeconds`.

The app container keeps its own `startupProbe` / `readinessProbe` on `:8080/health`. The pod
is not Ready until **both** containers pass — ingress traffic cannot reach OAuth/login until
import is done.

**Scaling tip:** advisory lock + `auth_migration` flag still matter if you later run
`replicas > 1`; only one import runs, others block on the lock then skip.

---

## Frontend migration checklist

- Delete token storage, login page, admin “create user” UI.
- Replace authenticated `fetch` with same-origin `fetch` (session cookie only).
- On `401` from API → top-level navigation so the sidecar can silently re-authenticate or redirect
  to login. This is more nuanced than a plain reload — see
  [Session handling](#session-handling-401--silent-re-auth) below.
- `AuthContext` loads `GET /api/auth/me` only.
- Logout → `POST /auth/logout` (sidecar), then navigate home.

### Session handling: 401 → silent re-auth

The sidecar refreshes the upstream OAuth token in-cluster while the `hs_session` cookie is valid,
so an API `401` means the **session itself is gone**. The only fix is a top-level navigation that
reaches the sidecar: if the central IdP session is still alive the sidecar re-establishes the
session and 302s the user straight back with no login screen; if not, it redirects to login.

The first cut of this guide said "on 401, full page reload." That is the right idea but too blunt —
it loops on a PWA and drops the user at `/`. Unforked's `frontend/src/lib/session.ts` now
implements a bounded, place-preserving version. Replicate these properties:

1. **Navigate to the *current* location, not `/`.** `window.location.href =
   ${pathname}${search}${hash}` so a silent sidecar re-auth returns the user to the page they were
   on, mid-task.
2. **Coordinate concurrent 401s.** A burst of parallel API calls all 401 at once; an in-page
   `navigating` guard collapses them into a single navigation instead of racing.
3. **Cap attempts within a guard window.** Track attempts in `sessionStorage`; after
   `MAX_ATTEMPTS` (2) within the guard window (15s), stop navigating and emit a `session-lost`
   event so the UI can show the manual "session expired" screen. This is what prevents a
   reload-loop when there is no sidecar in front (local misconfig) or the IdP session is also gone.
4. **Reset the budget after a confirmed auth.** `markAuthenticated()` clears the counters on a
   successful `GET /api/auth/me`, so a later unrelated expiry gets a fresh set of attempts rather
   than immediately hitting the cap.
5. **Drop identity on `session-lost`.** `AuthContext` subscribes to the event and clears the user,
   so `RequireAuth` surfaces the manual screen even when the request that failed was a data call,
   not `/api/auth/me`.
6. **Re-check the session on tab focus / `visibilitychange`.** On mobile the app is backgrounded
   for long stretches and the session often expires while hidden. Re-checking on return triggers
   the silent reload *before* the user taps anything, instead of surfacing a mid-action 401.
   (Throttle it — unforked uses 5s.)
7. **The manual reload button must go through `navigateForLogin`, never `window.location.reload()`.**
   A plain reload is answered by the PWA service worker from precache and never reaches the
   sidecar, so the button just re-renders in a loop. `navigateForLogin` unregisters the service
   worker first (see the PWA pitfalls below).

**Invite flows:** if the old app registered invitees with a local password form, the new flow is:
sidecar signs the visitor in first → authenticated `POST /api/family/invites/accept`. Unforked
keeps `/register-invite?token=…` as a route name but renders join-family confirmation only
(`frontend/src/pages/JoinFamily.tsx`).

### PWA / service worker pitfalls

The sidecar's login redirect only happens when a top-level navigation **reaches the network**.
An offline-first service worker (`navigateFallback: index.html`) answers navigations from its
precache, which breaks the flow in three ways:

1. **`/auth/*` must be denylisted from the navigate fallback.** Otherwise the SW serves the
   cached SPA for `/auth/callback?code=…&state=…` — the authorization code never reaches the
   sidecar and login fails with OAuth state errors. Unforked:
   `navigateFallbackDenylist: [/^\/api\//, /^\/auth\//]` in `frontend/vite.config.ts`.
2. **The 401 → login bounce must bypass the SW.** A plain `location.href` / `location.reload()` is
   served from the precache, so the sidecar never sees it and the app loops back to a
   session-expired screen. Unforked unregisters the service worker(s) before navigating
   (`frontend/src/lib/session.ts` → `navigateForLogin`, which targets the *current* location so a
   silent re-auth lands the user back where they were); the SW re-registers after login. See
   [Session handling](#session-handling-401--silent-re-auth) for the surrounding attempt-cap logic.
3. **The SW update prompt must render outside the auth gate.** Everything behind the sidecar —
   including `sw.js` — 302s to login when unauthenticated, and a logged-out stale client that
   can't show the update prompt stays pinned to the old build forever.

**Stale installs from before the migration cannot self-heal**: their SW serves the old app
(old login UI) without touching the network, and its update check for `sw.js` is redirected to
the auth host and fails. Users must remove the installed app and re-add it. Note for iOS:
Safari's "Clear History and Website Data" does **not** clear a Home Screen web app's storage —
the installed app keeps its own container. Delete the app icon from the Home Screen, open the
site in Safari, log in, then "Add to Home Screen" again.

4. **The web app manifest and Home Screen icons must be reachable without a session.** The
   sidecar authenticates every path except its own (`/healthz`, `/readyz`, callback, logout), so
   an unauthenticated asset fetch gets a `302` (HTML navigation) or `401` (everything else). When
   iOS/Android install a PWA, the icon and manifest are fetched by an OS background process that
   does **not** share the browser's cookie jar, so those fetches are anonymous → `401` → the
   installed app falls back to a solid tile with the app's first letter. This is independent of
   which icon you ship: **no icon ever resolves** while the assets sit behind the auth gate, and
   clearing cache / reinstalling does not help because the fetch is still cookie-less.

   Fix: allowlist the exact discovery-asset paths in the sidecar so they proxy to the app
   anonymously (identity headers still stripped, nothing injected), leaving every other path
   authenticated. Unforked uses the homectl-auth-proxy `PUBLIC_PATHS` env (comma-separated exact
   GET/HEAD paths), set on the sidecar container in `k8s/deployment.yml`:

   ```yaml
   - name: PUBLIC_PATHS
     value: /manifest.webmanifest,/apple-touch-icon-180x180.png,/apple-touch-icon.png,/apple-touch-icon-precomposed.png,/pwa-icon.svg,/favicon.ico,/pwa-64x64.png,/pwa-192x192.png,/pwa-512x512.png,/maskable-icon-512x512.png
   ```

   The list must cover the manifest, the `apple-touch-icon` referenced from `index.html` (plus the
   `/apple-touch-icon*.png` root paths iOS probes when the link fails), and every icon named in
   the manifest. These are static branding files with no user data, so serving them anonymously is
   safe. Requires a homectl-auth-proxy build that supports `PUBLIC_PATHS` — it matches these exact
   paths **before** the auth middleware, strips any inbound `X-Homectl-*` / `Authorization`, and
   injects no identity, so a public path cannot be used to smuggle a forged identity upstream.
   After deploying, users must still delete and re-add the Home Screen app once for the OS to
   re-fetch the (now reachable) icon.

---

## Sidecar session behavior you depend on

The migrating app does not implement token refresh — the sidecar does — but two homectl-auth
behaviors directly shape what your users experience, so target a homectl-auth build that has them.

### Refresh-token rotation is reuse-tolerant (spurious-logout fix)

**Symptom to expect if you skip this:** users get logged out at seemingly random times, and it
recurs *roughly every access-token lifetime*. That pattern makes it look like a session-TTL
problem — it is not. Changing TTLs does not fix it.

**Cause:** the forward-auth sidecar is stateless — its session, including the rotating refresh
token, lives entirely in an encrypted cookie. A burst of concurrent browser requests therefore all
carry the **same** refresh token, and when it nears expiry they all cross the refresh threshold
together. The original `rotateSession` hard-deleted the presented token, so the first refresh won
and every other in-flight request got a `401`; the sidecar then cleared the session and bounced the
user to login.

**Fix (homectl-auth migration `010_session_rotation_grace.sql`):** rotation now stamps the
presented token with `rotated_at` and keeps the row for a 30s grace window instead of deleting it.
A token re-presented within the window is treated as a legitimate concurrent refresh and its caller
gets a fresh successor; presented after the window it is replay and rejected. The row is locked
`FOR UPDATE` so the first-use stamp is applied exactly once; the hourly cleanup job purges rotated
rows once well past the grace window. **Make sure the homectl-auth you deploy against includes
migration 010.** (This pairs with the frontend silent-re-auth work above: 010 stops the logout at
the source; the frontend bounds what happens if one still slips through.)

## Operational notes

### Redact identity from your app's logs

`pino-http` (and most HTTP loggers) log full request/response headers by default. Under real
traffic that writes `Authorization` bearer tokens, `Cookie` (the `hs_session`), and `Set-Cookie`
values to stdout in plaintext, where they land in aggregated/exported pod logs. homectl-auth's
server and proxy loggers now add a pino `redact` config censoring `req.headers.authorization`,
`req.headers.cookie`, and `res.headers["set-cookie"]`. **Add the same redaction to the migrating
app's logger** — after cutover the app sits behind the sidecar and receives the session cookie on
every request, so it has exactly the same exposure. Benign fields (host, content-type, …) are
unaffected.

### Migrations run before the pod is Ready

Both apps run DB migrations in-process at startup, before `listen()`. A migration that throws takes
the whole pod down and the rollout times out (this is how the migration-009 ownership issue first
surfaced as a crashloop). For migrations that touch objects the app's DB role may not own (drops,
ownership-sensitive `ALTER`s), wrap the statement in a `DO $$ … EXCEPTION WHEN insufficient_privilege
THEN RAISE WARNING … $$;` block so the service still boots, and document the manual follow-up for
the table owner. Keep deploy-failure diagnostics (pod state + logs on rollout failure) in the CI
workflow so the next crashloop is diagnosable without a separate debug job.

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
7. **Duplicate usernames** — if usernames may collide, have the table owner drop
   `users_username_key` before cutover, or expect `invalid` entries until they do (see
   [Duplicate usernames](#duplicate-usernames-migration-009)).
8. **Confirm the homectl-auth version** includes the rotation-grace fix (migration 010) so
   concurrent-refresh logouts don't hit your larger, more-concurrent user base.
9. **Communicate** — users will need the central login UI; JWT sessions and local passwords
   stop working at cutover.
10. **PWA users need to reinstall.** Stale installs from before the migration cannot self-heal;
    plan an in-app or out-of-band notice (see [PWA pitfalls](#pwa--service-worker-pitfalls)).
11. **Keep rollback image** until a full login + core-flow smoke test passes in production.

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
| Session / silent re-auth | `frontend/src/lib/session.ts`, `frontend/src/lib/session.test.ts` |
| Session recheck + gate | `frontend/src/contexts/AuthContext.tsx`, `frontend/src/components/RequireAuth.tsx` |

### homectl-auth references (the moving parts on the other side)

| Concern | Path (homectl-auth) |
|---------|---------------------|
| App registration (ConfigMap) | `k8s/configmap.yaml` (key `apps.json`), loaded by `packages/server/src/config/apps.ts` |
| User import endpoint | `packages/server/src/routes/internal-users.router.ts` |
| Refresh-token rotation grace | `packages/server/src/modules/session/session.service.ts`, migration `010_session_rotation_grace.sql` |
| Username UNIQUE drop | migration `009_drop_username_unique.sql` |
| Log redaction | `packages/server/src/logger.ts`, `packages/proxy/src/logger.ts` |

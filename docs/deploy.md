# Deploying unforked to homectl Kubernetes

Production runs on the homectl Kapsule cluster (`homectl` namespace). CI on `main` must pass before the **Deploy to Kubernetes** workflow builds the image and applies `k8s/deployment.yml`.

## One-time setup

### GitHub repository secrets

| Secret | Purpose |
|--------|---------|
| `SCW_ACCESS_KEY` | Scaleway API access key (deploy workflow) |
| `SCW_SECRET_KEY` | Scaleway API secret (docker login + `scw` CLI) |
| `SCW_ORGANIZATION_ID` | Scaleway organization UUID |
| `SCW_PROJECT_ID` | Scaleway project UUID (same as homectl-infra; cluster lives in this project) |
| `K8S_CLUSTER_ID` | Full cluster ID from `terraform -chdir=terraform output -raw cluster_id` in homectl-infra (includes `fr-par/` prefix) |

Use the **same** `SCW_*` values as in the homectl-infra repo, or create API keys with Kubernetes + Container Registry permissions on the homectl project. Docker login can succeed while kubeconfig fails if the key lacks K8s access or targets the wrong project (Scaleway often returns 404).

Remove after cutover from Serverless (no longer used): `SCALEWAY_API_KEY`, `SCW_REGISTRY_NAMESPACE`, `SCW_CONTAINER_ID`.

### Kubernetes secrets

**`unforked-terraform-secrets`** (Terraform-managed in homectl-infra) supplies
`DATABASE_URL` and the Object Storage credentials for recipe photos
(`S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` —
the app has `bucket = true` in homectl-infra, and the bucket carries a CORS
rule for `https://unforked.homectl.no` so browsers can PUT photos directly via
presigned URLs). All are loaded automatically by `k8s/deployment.yml`. Ensure
the `unforked` app is provisioned there and `terraform apply` has run before
deploy. Without the `S3_*` variables the app still runs; the photo endpoints
just report the feature as unavailable and the frontend hides its photo UI.

**`unforked-secrets`** holds app config that is not in Terraform. Create once
in namespace `homectl` (do not commit values to git):

```sh
scw k8s kubeconfig install <K8S_CLUSTER_ID> --region fr-par

kubectl create secret generic unforked-secrets \
  --namespace homectl \
  --from-literal=CORS_ORIGIN="https://unforked.homectl.no"
```

(Neither `DB_URL`/`DB_USER`/`DB_PASSWORD` nor `JWT_SECRET` are read anymore —
the database connection comes from `unforked-terraform-secrets`'
`DATABASE_URL` and authentication moved to the homectl-auth sidecar below;
leftover keys in an existing Secret are ignored.)

**`unforked-vapid-secrets`** (Terraform-managed in homectl-infra) supplies the
Web Push VAPID keys — see [Web Push (VAPID) keys](#web-push-vapid-keys) below.

**Migration handoff:** migrations run at pod boot (node-pg-migrate). On the first Node deploy against the existing Flyway-migrated database, the runner detects the schema and baselines migrations `001–003` as already-applied instead of recreating tables; a fresh database migrates normally.

Verify ClusterIssuer before first deploy:

```sh
kubectl get clusterissuer letsencrypt-prod   # READY=True
```

### Web Push (VAPID) keys

Push notifications (design issue #104, D5/D7) need a
[VAPID](https://datatracker.ietf.org/doc/html/rfc8292) keypair. **Do not
generate keys by hand** — they are provisioned by homectl-infra's Terraform:
the `unforked` app is marked `vapid = true` there, which generates a stable
ECDSA P-256 keypair once and writes it into the Kubernetes Secret
**`unforked-vapid-secrets`** (namespace `homectl`) with the keys the backend
reads from env:

| Key | Purpose |
|-----|---------|
| `VAPID_PUBLIC_KEY` | URL-safe base64; served to browsers via `GET /api/push/vapid-key` |
| `VAPID_PRIVATE_KEY` | URL-safe base64; server-only signing key |
| `VAPID_SUBJECT` | Contact URI (`mailto:`/`https:`) sent to push services |

`k8s/deployment.yml` already references the Secret via `envFrom`
(`optional: true`, so pods start without it and the backend reports push as
unavailable — the frontend hides/soft-disables the notifications card). Setup
is: `terraform apply` in homectl-infra (creates the Secret), then
`kubectl rollout restart deployment/unforked -n homectl` so pods pick up the
env vars. Inspect the public key with
`terraform -chdir=terraform output -json app_vapid_public_keys` (homectl-infra).

> **Do not rotate the keypair casually.** Every existing browser subscription
> is bound to the public key; rotating invalidates them all and every device
> must re-enable notifications. The backend self-prunes the dead rows
> (`push_subscriptions`) as sends start failing with 404/410.

The three env vars must be set together — the backend fails fast at boot on a
partial set. Local dev needs none of them: without keys the push routes stay
mounted but report push as unavailable.

### Registry pull secret (only if `ImagePullBackOff`)

```sh
kubectl create secret docker-registry scw-registry \
  --namespace homectl \
  --docker-server=rg.fr-par.scw.cloud \
  --docker-username=nologin \
  --docker-password="<SCW_SECRET_KEY>"
```

Add `imagePullSecrets: [{ name: scw-registry }]` to the Deployment if needed.

### homectl-auth sidecar (`auth-proxy`)

Authentication is handled by the [homectl-auth](https://github.com/GagnatDev/homectl-auth)
`auth-proxy` sidecar (see its `docs/sidecar/integration.md` and `migration.md`).
Traffic flows **ingress → Service:80 → sidecar:4180 → app:8080**; the Service
must never target the app port directly, or clients could forge the
`X-Homectl-*` identity headers the backend trusts.

One-time setup, in this order:

1. **Provision the client secret** — in homectl-infra's Terraform, set
   `auth = true` on the `unforked` app and `terraform apply`. This writes
   `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, and `COOKIE_KEY` into the
   `unforked-terraform-secrets` Secret (which `k8s/deployment.yml` references)
   and mirrors the same plaintext secret into homectl-auth's
   `auth-client-secrets` Secret under `UNFORKED_CLIENT_SECRET`.
2. **Register the app** in homectl-auth's `apps.json` (roll out *after* the
   Terraform apply, then `kubectl rollout restart deploy/auth`):

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

   The role names must stay `user`/`admin` — they mirror this app's roles and
   are what the one-time user import sends.
3. **Deploy.** On the first boot with `AUTH_CLIENT_ID`/`AUTH_CLIENT_SECRET`/
   `INTERNAL_AUTH_URL` set (all wired in `k8s/deployment.yml`), the backend
   automatically imports the existing local accounts into homectl-auth via the
   in-cluster `POST /internal/users/import` — emails, bcrypt password hashes,
   and roles — so users keep their current passwords. The import runs **exactly
   once**: completion is recorded in the `auth_migration` DB table, and homectl-auth
   itself dedupes on email, so a re-run (e.g. after wiping the flag) is harmless.
   If the import fails, the pod exits and retries on the next start — check
   `kubectl logs` for `homectl-auth import` lines.

   **Traffic during import:** the app runs import before it listens on `:8080`.
   The auth-proxy sidecar's probes fetch `http://127.0.0.1:8080/health` on the
   pod loopback (not `/readyz` alone), so the Service does not send ingress
   traffic until import finishes. See [auth-sidecar-migration.md](./auth-sidecar-migration.md).

Verify after deploy:

- A fresh browser on `https://unforked.homectl.no` is 302'd to
  `auth.homectl.no`, logs in, and lands back with a working session and an
  `hs_session` cookie (no token in JS).
- `kubectl logs -n homectl deployment/unforked -c unforked` shows the import
  summary on the first boot; subsequent boots skip it.

**Rollback:** repoint the Service `targetPort` back to `8080` and redeploy a
pre-migration image (the legacy password login lives in the old code). The
local `users` table is untouched by the sidecar migration — password hashes are
retained — so the old build keeps working.

## Pre-cutover verification (port-forward)

While DNS still points at Serverless:

```sh
kubectl get pods,ingress -n homectl -l app=unforked
kubectl logs -n homectl deployment/unforked   # migrations applied, "backend listening"

kubectl port-forward -n homectl svc/unforked 8080:80
curl http://localhost:8080/healthz            # sidecar liveness: ok
curl -i http://localhost:8080/                # 302 to auth.homectl.no (no session)
```

(The app's own `/health` sits behind the sidecar's auth; the kubelet probes it
directly on the app container, so an unauthenticated curl through the Service
being redirected is expected.)

Accounts live in homectl-auth — there is no local setup endpoint. Admin rights
come from the `admin` role on the `unforked` app in homectl-auth (set via its
operator GUI, or inherited from the pre-migration `role` column by the one-time
user import).

## DNS cutover

1. Update `unforked.homectl.no` A record at one.com to `ingress_ip` (homectl-infra terraform output).
2. After TTL: verify `https://unforked.homectl.no`, cert-manager cert (`kubectl describe certificate -n homectl`), login, core flows.
3. Delete the Scaleway Serverless container and old GitHub secrets listed above.

**Rollback:** Re-point DNS to Serverless until k8s is verified; keep Serverless running until cutover succeeds.

## Secret rotation

```sh
kubectl delete secret unforked-secrets -n homectl
# re-create with kubectl create secret generic ...
kubectl rollout restart deployment/unforked -n homectl
```

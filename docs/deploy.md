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

### Kubernetes secret (`unforked-secrets`)

Create once in namespace `homectl` (do not commit values to git):

```sh
scw k8s kubeconfig install <K8S_CLUSTER_ID> --region fr-par

kubectl create secret generic unforked-secrets \
  --namespace homectl \
  --from-literal=DB_URL="jdbc:postgresql://<postgres_host>:<postgres_port>/unforked" \
  --from-literal=DB_USER="homectl" \
  --from-literal=DB_PASSWORD="<your-db-password>" \
  --from-literal=JWT_SECRET="$(openssl rand -base64 32)" \
  --from-literal=CORS_ORIGIN="https://unforked.homectl.no"
```

Get `postgres_host` and `postgres_port` from homectl-infra terraform outputs. If connecting fails on the private network, try appending `?sslmode=disable`.

The Node backend accepts the legacy `jdbc:postgresql://…` `DB_URL` (with `DB_USER`/`DB_PASSWORD`) as-is, so this Secret does not change at the Kotlin→Node cutover. You may migrate to a single `DATABASE_URL=postgresql://user:pass@host:port/unforked` later on your own schedule.

**Migration handoff:** migrations run at pod boot (node-pg-migrate). On the first Node deploy against the existing Flyway-migrated database, the runner detects the schema and baselines migrations `001–003` as already-applied instead of recreating tables; a fresh database migrates normally.

Verify ClusterIssuer before first deploy:

```sh
kubectl get clusterissuer letsencrypt-prod   # READY=True
```

### Registry pull secret (only if `ImagePullBackOff`)

```sh
kubectl create secret docker-registry scw-registry \
  --namespace homectl \
  --docker-server=rg.fr-par.scw.cloud \
  --docker-username=nologin \
  --docker-password="<SCW_SECRET_KEY>"
```

Add `imagePullSecrets: [{ name: scw-registry }]` to the Deployment if needed.

## Pre-cutover verification (port-forward)

While DNS still points at Serverless:

```sh
kubectl get pods,ingress -n homectl -l app=unforked
kubectl logs -n homectl deployment/unforked   # migrations applied, "backend listening"

kubectl port-forward -n homectl svc/unforked 8080:80
curl http://localhost:8080/health   # {"status":"ok"}

curl -X POST http://localhost:8080/api/auth/setup \
  -H 'Content-Type: application/json' \
  -d '{"email":"<your-email>","password":"<strong-password>"}'
```

The first `/api/auth/setup` caller becomes admin — run this before DNS cutover.

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

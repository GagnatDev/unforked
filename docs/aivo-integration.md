# Aivo integration — machine API for meal-plan queries

**Status:** Phase 1 (§8) is implemented — per-user API keys (issued from the
API-keys page in the UI, `/api/api-keys` endpoints), the machine listener on
`MACHINE_PORT` (default 8081, `backend/src/machineApp.ts`) with the
`/machine/v1/` read endpoints, the `unforked-machine` Service and the
NetworkPolicy (`k8s/deployment.yml`). On the Aivo side the key is registered
from Aivo's dashboard (Settings page), not via a k8s Secret as §6 originally
assumed. Phases 2–4 remain open, as do the operational checks in §7 (O3).

This document explores how [Aivo](https://github.com/GagnatDev/aivo) (the
personal AI assistant reachable through Discord) could query unforked on
behalf of its owner, so that questions like these can be answered in chat:

- *"What meals are planned this week?"*
- *"Give me the shopping list for next week."*
- *"I have chicken thighs, leeks and crème fraîche in the fridge — what can I make?"*

Three hard constraints from the outset:

1. The integration acts **as a specific unforked user account** (and therefore
   sees that user's family data). Unforked should let a user generate an API
   key for their own account and hand it to Aivo.
2. Aivo ↔ unforked traffic goes **exclusively over Kubernetes service
   discovery** inside the cluster. The new endpoints should **not** be
   reachable through the public ingress.
3. It should be possible to **restrict which pods** may call the machine
   endpoints, e.g. with a `NetworkPolicy`.

## 1. Where we start from

### Current traffic topology

Everything unforked serves today goes through one path
(see `k8s/deployment.yml` and `docs/deploy.md`):

```
internet ── nginx ingress ── Service unforked:80 ── auth-proxy sidecar:4180 ── app:8080 (pod-local)
```

The app container trusts the `X-Homectl-User` / `X-Homectl-Email` /
`X-Homectl-Role` headers **as-is** (`backend/src/middleware/auth.ts`). That is
only safe because nothing except the sidecar can reach port 8080 — the Service
deliberately targets 4180, and the deployment manifest warns against ever
pointing a Service at 8080.

> **Design consequence #1:** we cannot simply add a second ClusterIP Service
> that targets `app:8080`. Any pod in the cluster could then send
> `X-Homectl-Email: ann.katrin@…` and impersonate any user on the *human* API.
> The machine API must be isolated from the header-trusting surface — the
> cleanest way is a **separate listener port** that serves only the machine
> routes and never reads identity headers.

### Current data model and API

All domain data is family-scoped JSONB documents (`backend/src/db/schema.ts`,
`backend/src/domain/types.ts`):

- **Recipes** — `{ name, description, ingredients[{name, quantity, unit}], steps, servings, tags }`
- **Meal plans** — one doc per family per ISO week (`YYYY-Wnn`, see
  `domain/weekIdentifier.ts`), with `assignments[{day, recipeId, recipeName, persons}]`
- **Shopping lists** — persisted, one doc per family per ISO week
  (`PersistedShoppingListDoc` in the `shopping_lists` table). Every read
  re-syncs the stored doc against the week's meal plan
  (`service/shoppingListSync.ts`): the fresh aggregate from
  `service/shoppingListService.ts` is reconciled with the stored entries so
  per-item state — `checked`, store `category`, manually added items —
  survives plan edits. Per-family ingredient→category overrides live in a
  separate `ingredient_categories` table.

The existing authenticated API already answers two of the three use cases
almost verbatim:

| Use case | Existing endpoint |
|---|---|
| Meals this week | `GET /api/meal-plans/current?week=YYYY-Wnn` |
| Shopping list next week | `GET /api/shopping-lists?week=YYYY-Wnn` |
| Recipes from fridge ingredients | *(nothing yet — see §5.3)* |

Auth resolves an identity to a local user by email and every query is keyed on
that user's `family_id` (`routes/context.ts`). The machine API can reuse this
exact model: **API key → user row → family**, and all downstream service code
works unchanged.

## 2. Proposed architecture

```
                        homectl namespace
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌────────────┐   http://unforked-machine.homectl:8081      │
│  │ aivo pod   │ ────────────────────────────────┐           │
│  │ (Discord   │   Authorization: Bearer ufk_…   │           │
│  │  gateway + │                                 ▼           │
│  │  LLM agent)│                    ┌───────────────────────┐│
│  └────────────┘                    │ unforked pod          ││
│                                    │  ┌──────────────────┐ ││
│  internet ─ ingress ─ Service:80 ─▶│  │ auth-proxy :4180 │ ││
│                                    │  └────────┬─────────┘ ││
│                                    │           ▼           ││
│                                    │  ┌──────────────────┐ ││
│                                    │  │ app :8080 human  │ ││
│                                    │  │     :8081 machine│ ││
│                                    │  └──────────────────┘ ││
│                                    └───────────────────────┘│
│   NetworkPolicy: only pods labelled app=aivo may reach 8081 │
└─────────────────────────────────────────────────────────────┘
```

Pieces:

1. **A second HTTP listener in the app container (`:8081`, "machine API").**
   Same Node process, separate Express app instance. It mounts only the
   machine routes, authenticates exclusively by API key, and never consults
   `X-Homectl-*` headers. Port 8080 keeps its current behaviour untouched.
2. **A dedicated ClusterIP Service** (e.g. `unforked-machine`) targeting 8081.
   It is **not** referenced by any Ingress, so the endpoints are unreachable
   from the internet. Aivo discovers it by DNS:
   `http://unforked-machine.homectl.svc.cluster.local` (short form
   `unforked-machine.homectl` — the same convention the deployment already
   uses for `http://homectl-auth.homectl`).
3. **Per-user API keys**, generated from the unforked UI (behind the normal
   sidecar auth) and stored hashed. The plaintext key is shown once and pasted
   into Aivo's config (a k8s Secret in Aivo's deployment).
4. **A `NetworkPolicy`** restricting ingress to 8081 to pods that carry an
   agreed label (e.g. `app: aivo`), as defence in depth on top of the API key.

Why a second port instead of path-based separation on 8080:

- Port-level separation is what `NetworkPolicy` can actually express (L3/L4).
  A single port with `/machine/*` paths could not be network-restricted
  separately from the human API without an L7-aware policy (Cilium-specific).
- It keeps the "8080 is only reachable via the sidecar" invariant intact and
  auditable — no new code path can accidentally trust identity headers from
  an in-cluster caller.
- It costs almost nothing: `buildApp()` already returns an Express app without
  listening; a sibling `buildMachineApp()` can share the same `Db` and service
  layer, and `server.ts` calls `.listen()` twice.

## 3. Authentication options for the machine API

### 3.1 Per-user API keys (recommended — and what was asked for)

- **Issuance:** new authenticated endpoints on the *human* API
  (`POST /api/api-keys`, `GET /api/api-keys`, `DELETE /api/api-keys/:id`) plus
  a small settings UI. Creating a key returns the plaintext **once**.
- **Format:** `ufk_` + 32+ bytes of `crypto.randomBytes` base64url. A
  recognisable prefix makes keys identifiable in logs/secret scanners.
- **Storage:** new `api_keys` table — `id`, `user_id`, `name` ("Aivo"),
  `key_hash` (SHA-256 of the key; no bcrypt needed since keys are
  high-entropy), `scopes`, `created_at`, `last_used_at`, `expires_at?`,
  `revoked_at?`. Lookup is by hash equality, O(1) with a unique index.
- **Verification middleware:** `Authorization: Bearer ufk_…` → hash → row →
  reject if revoked/expired → `req.user = { userId, role }` exactly like
  `requireAuth` does, so `requireUserAndFamily` and everything below it just
  works.
- **Scopes:** start with a single `read` scope (all three use cases are
  read-only). A future `write` scope would gate things like "add this recipe
  to Thursday". Keys default to read-only.

Trade-off: a bearer secret that must be provisioned into Aivo and rotated by
hand. Acceptable for a personal, single-family deployment; the network
controls below limit the blast radius of a leak (a stolen key is useless from
outside the cluster or from a non-allowlisted pod).

### 3.2 Alternatives considered

- **homectl-auth client-credentials / service account.** Aivo obtains a token
  from `homectl-auth` and unforked validates it (JWKS). Architecturally the
  most "homectl-native" option and centralises revocation, but it requires new
  grant support in homectl-auth and still needs a mapping from "Aivo the
  client" to "acts as user X" — effectively reinventing the API key's
  user-binding. Worth revisiting if more machine clients appear.
- **Kubernetes ServiceAccount tokens (bound audience) + `TokenReview`.**
  Cryptographic *pod* identity with zero shared secrets: Aivo mounts a
  projected token with `audience: unforked`, unforked validates it against the
  API server. Elegant, but it authenticates the *workload*, not the *unforked
  user* — a separate table mapping service accounts to users would still be
  needed, and unforked would need RBAC to call `TokenReview`. Good candidate
  for a later hardening step, not the first version.
- **mTLS between pods.** Strongest transport-level guarantee but means
  certificate issuance/rotation machinery (cert-manager internal CA or a
  service mesh) for a two-pod integration. Overkill here.

## 4. Network isolation

### 4.1 Not on the ingress — by construction

The machine Service is simply never referenced by an Ingress resource. The
nginx ingress controller cannot route to it, and the endpoints don't exist on
8080/4180. No path-blocking rules to maintain, nothing to misconfigure later.

### 4.2 NetworkPolicy: allowlist callers of 8081

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: unforked-machine-api
  namespace: homectl
spec:
  podSelector:
    matchLabels:
      app: unforked
  policyTypes: [Ingress]
  ingress:
    # Human traffic: ingress-nginx → auth-proxy sidecar
    - ports: [{ port: 4180, protocol: TCP }]
      from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-nginx
    # Machine traffic: only Aivo may reach the machine API
    - ports: [{ port: 8081, protocol: TCP }]
      from:
        - podSelector:
            matchLabels:
              app: aivo
```

Things to be aware of:

- **NetworkPolicy is additive-deny:** the moment any policy selects the
  unforked pod, *all* unselected ingress is dropped. The policy must therefore
  also (re-)allow the existing 4180 path — and the ingress-controller
  namespace/labels above need verifying against the actual cluster before
  applying. Port 8080 gets no rule at all, which *improves* today's posture:
  currently any in-cluster pod can hit 8080 directly and forge identity
  headers; with this policy that hole closes.
- **CNI must enforce it.** Scaleway Kapsule's default CNI (Cilium) enforces
  `NetworkPolicy`; this is a requirement to verify on the actual cluster
  (`kubectl get pods -n kube-system | grep -i cilium`).
- If Aivo runs in a different namespace, add a `namespaceSelector` to the
  8081 rule.
- **Optional L7 tightening:** a `CiliumNetworkPolicy` could additionally
  restrict Aivo to `GET` on `/machine/v1/*`. Nice-to-have, Cilium-specific,
  not required for v1.

Defence in depth summary — an attacker needs **all three** to get data out:
be inside the cluster, be scheduled as/behind an `app: aivo` labelled pod, and
hold a valid API key.

## 5. The machine API surface

Versioned under `/machine/v1/` on the dedicated port. All responses JSON, all
routes require a valid API key, all data scoped to the key owner's family.

### 5.1 Meal plans

```
GET /machine/v1/meal-plans/{week}      # week = YYYY-Wnn | "current" | "next"
```

Response mirrors `MealPlanDoc` but resolves recipe details inline so Aivo can
answer in one round trip:

```json
{
  "weekIdentifier": "2026-W29",
  "assignments": [
    { "day": "MONDAY", "recipe": { "id": "…", "name": "Kikertsalat", "tags": ["vegetar"] }, "persons": 4 }
  ]
}
```

Accepting `current`/`next` aliases server-side keeps ISO-week arithmetic
(week 52/53 rollovers, week-start conventions) in unforked, where
`domain/weekIdentifier.ts` already lives, instead of re-implementing it in
Aivo's prompt or code.

### 5.2 Shopping lists

```
GET /machine/v1/shopping-lists/{week}  # same week aliases
```

Shopping lists are persisted and stateful (see §1), and the human API's GET
already does sync-on-read (`loadSyncedList` in `routes/shoppingLists.ts`):
it reconciles the stored doc with the current meal plan inside a transaction,
preserving checked state, category assignments and manual items. The machine
endpoint should reuse that exact path so Aivo sees what the family sees in
the UI — including what's already checked off and any manually added items —
rather than a fresh stateless aggregate. The response is the persisted shape
(`items[{id, name, quantity, unit, recipeIds, category, checked, manual}]`,
a superset of the old `ShoppingListDoc`), optionally with recipe names
resolved for readability in Discord.

One consequence to accept: the "read-only" machine GET performs the same
idempotent sync write the human GET does today. That's fine — sync never
destroys user state, it only reconciles with the plan (and skips creating
rows for empty weeks). *Mutating* the list from Discord ("cross off milk",
"add batteries") is a genuine write and stays behind the future `write`
scope (Phase 3).

### 5.3 Fridge-ingredient suggestions — the new capability

Two viable designs; they are not mutually exclusive.

**Option A — unforked ranks (server-side matching):**

```
POST /machine/v1/recipes/suggest
{ "ingredients": ["kyllinglår", "purre", "crème fraîche"], "limit": 5 }
```

Server normalises the input (lowercase, trim, singular/plural folding) and
matches against `recipes.doc->'ingredients'` names, e.g. Postgres `pg_trgm`
similarity or simple `ILIKE` containment, then ranks by *coverage* — the
fraction of a recipe's ingredients matched, so "you only need 2 more things"
sorts above "matches 3 of its 14 ingredients". Returns matched/missing
ingredients per recipe so Aivo can say *"you'd still need buttermilk"*.

- ✅ Deterministic, testable, cheap for Aivo (one call, small response).
- ⚠️ Ingredient-name matching in Norwegian free text (units mixed into names,
  synonyms, compound words) is genuinely fiddly; expect iteration.

**Option B — Aivo reasons (compact corpus endpoint):**

```
GET /machine/v1/recipes/compact
→ [ { "id": "…", "name": "…", "tags": […], "ingredients": ["kyllinglår", "purre", …] }, … ]
```

Unforked just serves the family's recipe corpus in a token-efficient shape;
Aivo's LLM does the matching — which is exactly what LLMs are good at
(synonyms, "chicken thighs ≈ kyllinglår", substitutions, "close enough").

- ✅ Trivial to implement; matching quality scales with Aivo's model, not with
  our string-matching code; also useful as a general "what recipes exist" tool.
- ⚠️ Response grows with the recipe collection (fine at family scale — hundreds
  of recipes ≈ tens of KB; revisit if it ever isn't).

**Recommendation:** ship **Option B first** (near-zero backend logic, best
match quality), keep Option A as a follow-up if token size or latency ever
becomes a problem.

### 5.4 Supporting endpoints

- `GET /machine/v1/recipes/{id}` — full recipe (ingredients + steps), for
  *"how do I make Tuesday's dinner?"* follow-ups.
- `GET /machine/v1/me` — echoes key owner (email, family), scopes, and expiry;
  lets Aivo health-check the credential at startup.

### 5.5 A step further: expose the machine API as an MCP server?

If Aivo consumes tools via the Model Context Protocol, unforked could expose
the same capabilities as MCP tools (`get_meal_plan`, `get_shopping_list`,
`suggest_recipes`) over streamable HTTP on the machine port — the tool schema
then travels with the server and Aivo needs no unforked-specific glue code.
This is additive: the REST surface above stands on its own, and an MCP layer
would be a thin wrapper over the same service functions. **Open question #2
below — depends on how Aivo's tool-calling is built.**

## 6. What happens on the Aivo side (for context)

Out of scope for this repo, but the contract Aivo needs:

- Config: `UNFORKED_BASE_URL=http://unforked-machine.homectl:80` and
  `UNFORKED_API_KEY` from a k8s Secret.
- Its pods carry the label the NetworkPolicy allowlists (`app: aivo`).
- Tool definitions (function calling or MCP) for: get meal plan (week),
  get shopping list (week), suggest recipes (ingredient list), get recipe by
  id — plus prompt guidance that weeks are ISO `YYYY-Wnn` and the aliases
  `current`/`next` exist.
- Discord UX is Aivo's: it turns *"what's for dinner Thursday?"* into
  `GET /machine/v1/meal-plans/current` and formats the answer.

## 7. Requirements

### Functional

- **F1** A logged-in user can create, list, and revoke named API keys for
  their own account in the unforked UI; plaintext shown exactly once.
- **F2** The machine API authenticates requests solely by API key and scopes
  all data to the key owner's family.
- **F3** Machine endpoints exist for: meal plan by week (with `current`/`next`
  aliases), shopping list by week, recipe by id, compact recipe corpus and/or
  ingredient-based suggestions, credential self-check (`/machine/v1/me`).
- **F4** v1 keys are read-only; write operations are rejected.
- **F5** Revoking a key takes effect immediately (next request fails 401).

### Security

- **S1** Machine routes are served on a dedicated port with its own Service;
  no Ingress references it.
- **S2** The machine listener never reads `X-Homectl-*` headers; the human
  listener never accepts API keys. No route exists on both.
- **S3** Keys stored only as SHA-256 hashes; plaintext never logged. Verified
  by grepping logs in tests.
- **S4** A NetworkPolicy restricts port 8081 ingress to allowlisted pods and
  preserves the ingress→4180 path; deployed together with the feature.
- **S5** Failed key auth returns a uniform 401 without oracle detail; repeated
  failures are logged (rate limiting is optional given S4, but cheap to add).
- **S6** `last_used_at` is tracked so stale keys are visible and revocable.

### Operational

- **O1** No new containers or infra components: second listener in the
  existing Node process; one Service + one NetworkPolicy added to
  `k8s/deployment.yml`.
- **O2** `/health` semantics unchanged; probes keep targeting 8080. The
  machine listener starts/stops with the same process lifecycle.
- **O3** Verify on the real cluster that the CNI enforces NetworkPolicy and
  capture the ingress-controller selector labels before applying (§4.2).
- **O4** Migration adds only the `api_keys` table; no changes to existing
  tables or the public API contract (`domain/types.ts` shapes are frozen).

### Testing

- **T1** Unit + integration tests (Vitest/Testcontainers, like existing
  routes): key lifecycle, hash verification, revocation, family scoping,
  header-trust isolation between the two listeners.
- **T2** A test asserting the machine app rejects requests carrying only
  `X-Homectl-*` headers (no key) — the impersonation regression test.

## 8. Suggested phasing

1. **Phase 1 — keys + read endpoints.** `api_keys` table, key management API +
   minimal UI, machine listener with meal-plan/shopping-list/recipe-by-id/
   `me`/compact-recipes endpoints, second Service, NetworkPolicy. This alone
   unlocks all three Discord use cases (Aivo matches ingredients itself).
2. **Phase 2 — server-side suggestions (optional).** `POST …/recipes/suggest`
   with normalisation + coverage ranking, if Option B's corpus approach shows
   its limits.
3. **Phase 3 — write scope (optional).** `write`-scoped keys and endpoints to
   assign a recipe to a day / tweak persons, and to check off or add
   shopping-list items (the persisted list makes *"cross off milk"* from
   Discord meaningful now). Needs a deliberate decision on confirmation UX in
   Aivo before any mutating endpoint exists.
4. **Later — MCP facade and/or ServiceAccount-token auth** as the ecosystem
   grows (more machine clients, more homectl apps talking to each other).

## 9. Open questions

1. **Where does Aivo run?** — **Answered** (aivo repo, `k8s/deployment.yml`):
   the `homectl` namespace, pods labelled `app: aivo`. Exactly what the §4.2
   policy assumes — the plain `podSelector` works, no `namespaceSelector`
   needed.
2. **How does Aivo consume tools?** — **Answered** (aivo repo,
   `backend/src/agent/`): bespoke in-house function calling — an
   OpenAI-compatible chat-completions provider (Scaleway generative API via
   the official OpenAI SDK) driving a hand-rolled tool loop with
   Zod-validated tools. No MCP anywhere. So plain REST is the right first
   interface; §5.5's MCP facade has no consumer today. Two contract details
   for the Aivo-side tool: tool schemas are advertised per turn via
   **bilingual keyword gates** (every gated tool lists English *and*
   Norwegian trigger words), so the unforked tool's gate must cover e.g.
   *middag, ukemeny, handleliste, oppskrift* alongside the English terms;
   and Aivo already provisions secrets via a k8s Secret
   (`aivo-terraform-secrets`), matching §6's `UNFORKED_API_KEY` assumption.
3. **Key expiry policy** — long-lived until revoked (simplest for a personal
   setup) or default `expires_at` with rotation reminders?
4. **User vs family semantics** — a key acts as its owning user and therefore
   sees that user's family data. Fine today (shared family plan); worth
   restating in the UI copy so a future multi-user family isn't surprised that
   "my key" exposes "our plan".
5. **Norwegian ingredient normalisation** — if/when Option A (server-side
   matching) is built: is `pg_trgm` similarity good enough, or do we want a
   small synonym table curated over time?

# Local-first workspace

The local store is the default path; the network reconciles it. Issue #136 work
packages 1–5 build on #84's IndexedDB store and durable outbox, and #135's bounded
fetches. WP6 (server cursors / per-entity dirty flags) is explicitly deferred.

## Domain screens and reconciliation

Today, Recipes, Weekly menu and Shopping list read through `useLocal`. Only the
IndexedDB read gates loading: missing local data is a valid empty state, not a
reason to wait for a pull. Domain edits update IndexedDB and enqueue durable
outbox operations immediately. Storage failures can still reject a local write;
network failures do not roll it back.

The continuous engine in `local/outboxSync.ts` separates two scopes. A catch-up
pass — push, then pull everything the profile still demands — belongs to
lifecycle moments: startup, leadership takeover, reconnect, focus, becoming
visible, a recovered session and the manual retry. Everything else reconciles
only what it names: `local/pullDemand.ts` registers a view's durable demand and
asks for that key alone, a realtime hint asks for its week, and a local write
pushes and then refreshes just the view it touched. Navigating therefore costs
the opened page's own GETs, never a replay of every week and recipe visited
before it. Demand stays tracked independently of navigation, so an unopened
route is still caught up in the background. Existing field-level merges and
transaction-scoped session guards protect pending work. The top-bar `SyncStatus`
is the single inspectable sync surface: state, pending count, reason and manual
retry. A whole serialized pass counts as one run, so a multi-key reconciliation
reads as one steady "syncing" instead of flickering once per GET. Transport timeouts are not mistaken for successful sync just because
`navigator.onLine` is true.

## Local identity is not server authorization

A cached identity mounts only its locally bound workspace (`user id + familyId`
in IndexedDB sync metadata). Reauthentication pauses reconciliation, never local
reads or edits. Transport failures, expired sessions and an empty outbox do not
clear that workspace or force navigation. No cached identity means there is no
trusted local workspace to mount.

A unique-query, no-store `/api/auth/me` proof enables live requests. Auth and
domain GETs remain service-worker NetworkOnly; IndexedDB, not a stale HTTP body,
is the source for offline domain reads. Owner mismatch retains the original
workspace and blocks live settings/sync; sign back into the original account and
family. There is no account-switch, migration or discard workflow here.

Explicit logout revokes access immediately while retaining ownership and queued
work; a durable logout marker prevents cached resurrection. Epoch checks and
abort signals reject stale responses at known boundaries, with transaction-level
checks before applying pulls or deleting queued operations. BroadcastChannel and
storage events redundantly propagate boundaries. If both transports fail, sync
fails closed. Aborting cannot retract an already-sent server write; atomically
binding cookie changes to writes would require a separate backend protocol.

## Server-owned settings fail independently

Family, API keys and invitation acceptance require a matching live session.
Family/API-key loading and failure states retain their heading, Profile back
link and the app shell. Dedicated states distinguish connection/timeout,
re-sign-in, account mismatch, HTTP permission failure and other server failures.
Initial live-session verification and retry are busy only within the settings
section. Retry is explicit and disabled while busy; requests retain the existing
bounded fetch budget. A failed settings read never clears local domain data. These
screens do not acquire an offline cache or queue server administration actions.
API-key plaintext exists only in component memory for its one-time display,
never in IndexedDB, localStorage or service-worker caches; key-list requests also
bypass the browser HTTP cache. Family reads contain pending invitation tokens,
so they also use no-store and unique-query probes. Family, users and API-key
service-worker routes are NetworkOnly. On activation, the worker deletes the
legacy `api-auth-sensitive` cache; clients still running an old worker need that
worker upgrade before its previous caching policy is retired.

Profile language/theme remain local. Only its notification section requires a
live session. Browser subscription lookup failures are caught, and transport
errors are translated rather than exposing an i18n key. Permission prompts and
browser push APIs remain browser-controlled, not background sync operations.

## Validation boundaries

Unit/integration regressions cover empty-local first paint, continuous scheduling,
transport status, ownership/epoch/logout races and online-only settings recovery
without clearing local data. Playwright exercises the existing browser journeys;
unit DOM assertions are not browser or visual evidence. Cursor sync, CRDTs,
backend auth protocol changes and new account-management features are out of scope.

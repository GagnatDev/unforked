# Agent instructions (this repository)

## Package manager

This repo uses **pnpm** exclusively (a pnpm workspace with `frontend` and `backend`; `pnpm-lock.yaml` is committed). Always use pnpm — never `npm` or `yarn`. Running `npm install`/`yarn install` writes a foreign lockfile and a non-pnpm `node_modules`, which must not be committed.

- Install: `pnpm install` (use `pnpm install --frozen-lockfile` in CI / to respect the committed lockfile).
- Run a workspace script: `pnpm --filter <package> run <script>`, or `pnpm -r run <script>` across all packages.
- Frontend unit tests: `pnpm --filter meal-planning-frontend run test:unit` (or `pnpm run test:unit` from `frontend/`).

## Testing

- **Run everything:** `pnpm -r run test` runs both packages' unit suites (backend Vitest + frontend Vitest). Add `pnpm -r run build` and `pnpm --filter @unforked/backend run typecheck` before committing.
- **Backend tests need a Postgres and can't use Testcontainers in the web/CI sandbox.** Docker Hub and the ECR blob CDNs are blocked by egress policy, so Testcontainers can't pull `postgres:16-alpine`. Use the built-in escape hatch instead — an apt-installed Postgres plus the `TEST_DATABASE_URL` override:
  ```sh
  sudo apt-get install -y postgresql          # Postgres 16
  # create a `test`/`test` superuser and an empty `test` database, then:
  TEST_DATABASE_URL=postgresql://test:test@localhost:5432/test pnpm -r run test
  ```
  For the Playwright backend, pass the same connection string as `E2E_DATABASE_URL` against an empty database.

## Playwright

For `*.spec.ts`, `playwright.config.*`, or `frontend/e2e/`, read [`.agents/skills/playwright-best-practices/SKILL.md`](.agents/skills/playwright-best-practices/SKILL.md) first and follow it.

**Browser-revision mismatch in the sandbox.** The preinstalled browsers under `/opt/pw-browsers` are revision **1194**, but `@playwright/test ^1.60` expects **1223**, and downloading browsers is discouraged by the egress policy. Symlink the expected revision onto the installed one rather than downloading:

```sh
cd /opt/pw-browsers
ln -s chromium-1194 chromium-1223
ln -s chromium-1194/chrome-linux/headless_shell \
      chrome-headless-shell-linux64/chrome-headless-shell   # adjust paths to match the installed layout
```

## Git

For a new feature or larger refactor, work on a separate branch branched from an up-to-date `main`, unless the user says otherwise.

### What "implement \<issue\>" means

When the user pastes a **GitHub issue URL** (with or without a verb like "implement", "do", "fix"), do **all** of the following:

1. **Fetch** the issue details from GitHub (via MCP or `gh`).
2. **`git fetch origin main`** to ensure the base is current.
3. Create a **git worktree** at `../<repo>-issue-<N>` on a new branch from `origin/main`. Name the branch descriptively (e.g. `feat/issue-30-shopping-list-service`, `fix/issue-12-login-redirect`).
4. **Implement** the change described in the issue inside the worktree.
5. **Run relevant tests** from the worktree before committing.
6. **Commit** following [Commit messages](#commit-messages), with `Closes #<N>` in the body.
7. **Push** the branch to `origin`.
8. **Create a PR** into `main` referencing the issue.

The main working tree is left untouched.

### What "create pr" means

When the user says **create pr** (or equivalent: create a pr, open pr, open a pull request, etc.), do **all** of the following unless they explicitly narrow the scope:

1. Ensure changes live on a **feature branch** (not directly on `main`). Create or use a branch from current `main` if needed.
2. **Commit** on that branch with a message that follows [Commit messages](#commit-messages) below.
3. **Push** the branch to `origin`.
4. Open a **pull request** into `main` with `gh pr create` (or the same steps the user would use in the GitHub UI).

This is **not** satisfied by a local commit only, or by committing on `main` without a PR, unless the user clearly says otherwise.

### Commit messages

- Use **[Conventional Commits](https://www.conventionalcommits.org/)**: a type prefix, optional scope in parentheses, then a short description.
  - Examples: `feat(frontend): …`, `fix(api): …`, `docs: …`, `refactor(meals): …`, `test(e2e): …`
- Keep the **subject line to the point** (about 50 characters or less when practical).
- **Describe behavior and outcomes** from the user or product perspective (what changed and why it matters), not implementation trivia.
- Add a **body** only when it helps: merge rationale, breaking changes, or follow-up notes.
- **Technical detail is appropriate** when it is the point of the change—for example fixing a specific bug, dependency, protocol, or build issue—so reviewers know what was wrong and what was fixed.

Bad (too vague or too internal): `wip`, `updates`, `fix stuff`, `refactor UserService.extractToken`.

Good (functional): `feat(nav): open app on Today and group secondary links in menus`

Good (technical when relevant): `fix(frontend): forward ref from Button for PopoverTrigger anchor`

## Cursor Cloud specific instructions

These are durable, non-obvious caveats for running this repo on a Cursor Cloud VM. The update script (`pnpm install`) refreshes workspace dependencies on startup; everything below is already provisioned in the VM image.

- **Node version.** The repo needs Node **>=24**, but the VM's default-PATH `/exec-daemon/node` is Node 22. Node 24 (via nvm) is symlinked into `/usr/local/cargo/bin` (the first `PATH` entry), so `node`/`pnpm` resolve to 24 in all shells — including the non-interactive shells the tools use. If a fresh clone ever reports Node 22, re-link with `ln -sf "$HOME/.nvm/versions/node/$(. "$HOME/.nvm/nvm.sh"; nvm version default)/bin/node" /usr/local/cargo/bin/node` (repeat for `pnpm`).
- **Postgres is local (apt), not Docker.** Docker isn't available; an apt-installed PostgreSQL 16 runs on `localhost:5432`. It is **not started automatically** on VM boot — run `sudo pg_ctlcluster 16 main start` if `/health` or tests can't connect. Two superuser roles/databases exist: `meals`/`meals` (db `meals`, for dev) and `test`/`test` (db `test`, for the Vitest `TEST_DATABASE_URL` escape hatch above).
- **Running the app in dev.** Backend: `DATABASE_URL=postgresql://meals:meals@localhost:5432/meals DISABLE_AUTH=true SEED_TEST_DATA=true pnpm --filter @unforked/backend run dev` (API on :8080, machine API on :8081, runs migrations + seeds ~21 recipes on boot). Frontend: `pnpm --filter meal-planning-frontend run dev` (Vite on :3000, proxies `/api` → :8080). `DISABLE_AUTH=true` is required locally — there is no login page; it resolves every request to a fixed seeded dev admin.

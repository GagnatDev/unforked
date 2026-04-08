# Agent instructions (this repository)

## Playwright

For `*.spec.ts`, `playwright.config.*`, or `frontend/e2e/`, read [`.agents/skills/playwright-best-practices/SKILL.md`](.agents/skills/playwright-best-practices/SKILL.md) first and follow it.

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

### Architecture overview

- **Frontend:** React 18 + TypeScript + Vite (port 3000), styled with Tailwind CSS + shadcn/ui. Located in `frontend/`.
- **Backend:** Kotlin + Ktor 2.3.9 (port 8080), JDK 21, Gradle wrapper. Located in `backend/`.
- **Database:** PostgreSQL 16, managed via `docker compose up -d postgres`. Flyway handles migrations automatically on backend startup.

### Starting the dev environment

1. **Docker must be running** (needed for PostgreSQL and backend tests via Testcontainers).
2. Start PostgreSQL: `docker compose up -d postgres` (from repo root).
3. Start backend: `cd backend && ./gradlew run --no-daemon` (env vars `DB_URL`, `DB_USER`, `DB_PASSWORD` default to `jdbc:postgresql://localhost:5432/meals` / `meals` / `meals`).
4. Start frontend: `cd frontend && pnpm run dev`.
5. App at http://localhost:3000, API at http://localhost:8080.

### Authentication gotchas

- The app uses JWT auth. On a fresh database, hit `POST /api/auth/setup` with `{"email":"...","password":"..."}` to create the first admin user. The frontend shows a setup screen when no users exist.
- Setting `DISABLE_AUTH=true` still requires a dev user (`DevAuth.USER_ID`) to exist in the DB; the auth-disabled provider auto-authenticates as that user but route handlers look up the user in the database. For local dev, it's simpler to use normal auth and create a user via the setup endpoint.
- `SEED_TEST_DATA=true` seeds sample recipes (only when recipe table is empty and a family exists).

### Running checks

- **Lint (TypeScript):** `cd frontend && npx tsc --noEmit`
- **Frontend unit tests:** `cd frontend && pnpm run test:unit`
- **Backend tests:** `cd backend && ./gradlew test` (requires Docker for Testcontainers)
- **Frontend build:** `cd frontend && pnpm run build`
- **E2E tests:** `cd frontend && pnpm run e2e` (auto-starts its own backend + Vite via Playwright config)

### Node version

The project requires Node >= 24 (see `.nvmrc`). Use `nvm install 24 && nvm use 24` if needed. `corepack enable` activates pnpm.

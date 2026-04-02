# Agent instructions (this repository)

## Playwright

For `*.spec.ts`, `playwright.config.*`, or `frontend/e2e/`, read [`.agents/skills/playwright-best-practices/SKILL.md`](.agents/skills/playwright-best-practices/SKILL.md) first and follow it.

## Git

For a new feature or larger refactor, work on a separate branch branched from an up-to-date `main`, unless the user says otherwise.

### What “ship it” means

When the user says **ship it** (or equivalent: ship work, ship this, etc.), do **all** of the following unless they explicitly narrow the scope:

1. Ensure changes live on a **feature branch** (not directly on `main`). Create or use a branch from current `main` if needed.
2. **Commit** on that branch with a message that follows [Commit messages](#commit-messages) below.
3. **Push** the branch to `origin`.
4. Open a **pull request** into `main` with `gh pr create` (or the same steps the user would use in the GitHub UI).

Shipping work is **not** satisfied by a local commit only, or by committing on `main` without a PR, unless the user clearly says otherwise.

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

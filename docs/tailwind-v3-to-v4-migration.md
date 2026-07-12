# Migrating the frontend from Tailwind CSS v3 to v4

A handoff guide for upgrading this repository's frontend from **Tailwind CSS 3.4.19** to **Tailwind CSS 4.3.x** (latest patch at migration time). This is a **major migration**, not a routine dependency bump.

Use this document when you have time to assign the work to an agent (or developer). It captures the current state, rationale, risks, and a concrete checklist.

---

## Summary

| Item | Current | Target |
| --- | --- | --- |
| Tailwind CSS | **3.4.19** (`frontend/package.json`, resolved in root `pnpm-lock.yaml`) | **4.3.x** (use latest patch, e.g. 4.3.2+) |
| Config style | `tailwind.config.js` + PostCSS | CSS-first (`@import "tailwindcss"`, `@theme`, `@source`) |
| Build integration | PostCSS (`tailwindcss` + `autoprefixer`) | `@tailwindcss/vite` (recommended for Vite) |
| Animation plugin | `tailwindcss-animate` (v3 plugin) | `tw-animate-css` (already imported; drop v3 plugin) |
| React | 18.3.x | 18.3.x is fine — React 19 is **not** required for Tailwind v4 |
| shadcn/ui CLI | `shadcn` ^4.0.0 | Re-init / reconfigure for v4 registry after Tailwind upgrade |

**Recommendation:** Upgrade when you can budget a focused migration pass. Staying on 3.4.19 is safe in the meantime — it is the latest v3 release and the app works today. The main reasons to migrate are faster builds, alignment with shadcn/ui's v4 component registry, and access to v4 utilities (scrollbars, `@container-size`, `zoom-*`, etc.).

---

## Current state (as of July 2026)

### Dependencies (`frontend/package.json`)

**Tailwind-related packages today:**

```json
"dependencies": {
  "shadcn": "^4.0.0",
  "tailwind-merge": "^3.5.0",
  "tw-animate-css": "^1.4.0"
},
"devDependencies": {
  "autoprefixer": "^10.4.27",
  "postcss": "^8.5.8",
  "tailwindcss": "^3.4.19",
  "tailwindcss-animate": "^1.0.7"
}
```

Verify the resolved version before starting:

```bash
cd frontend && pnpm ls tailwindcss
# Expected today: tailwindcss@3.4.19
```

### Configuration files

| File | Role |
| --- | --- |
| `frontend/tailwind.config.js` | v3 JS config: `darkMode: 'class'`, semantic color tokens via CSS variables, `tailwindcss-animate` plugin |
| `frontend/postcss.config.js` | PostCSS with `tailwindcss` + `autoprefixer` |
| `frontend/src/index.css` | v3 `@tailwind` directives, OKLCH design tokens, `@layer base` with `@apply` |
| `frontend/components.json` | shadcn config: style `base-nova`, points at `tailwind.config.js` |
| `frontend/vite.config.ts` | Vite 5 + React + PWA — **no** `@tailwindcss/vite` yet |

### CSS entry point (`frontend/src/index.css`)

The project is **partially modernized** already:

- `@import "tw-animate-css"` — v4-style animation package (good)
- `@import "shadcn/tailwind.css"` — shadcn v4 CSS entry (good)
- `@tailwind base/components/utilities` — **v3 pattern** (must change)
- OKLCH CSS variables in `:root` / `.dark` — modern token format (good; needs `@theme inline` migration per shadcn docs)
- `@apply` usage in `@layer base` for borders, focus rings, typography

All `@apply` / `@layer` usage is confined to `index.css` — no scattered `@apply` in TSX files.

### shadcn/ui components in tree

11 components under `frontend/src/components/ui/`:

- `badge.tsx`, `button.tsx`, `calendar.tsx`, `card.tsx`, `dialog.tsx`
- `dropdown-menu.tsx`, `input-group.tsx`, `input.tsx`, `popover.tsx`
- `select.tsx`, `textarea.tsx`

These were installed against the v3 registry and may need updating after migration (see [shadcn realignment](#6-realign-shadcn-cli-and-components) below).

### Package manager

The monorepo uses **pnpm** (root `pnpm-lock.yaml`). Run install/update commands from the repo root unless noted otherwise.

---

## Why migrate

### Benefits

1. **Build performance** — Tailwind v4's engine is significantly faster, especially incremental builds.
2. **Ecosystem alignment** — shadcn/ui's current docs, CLI defaults, and new components assume Tailwind v4.
3. **New utilities** — v4.3 adds scrollbar utilities, `@container-size`, `zoom-*`, `tab-*`, stacked/compound `@variant`, and more. See the [Tailwind v4.3 blog post](https://tailwindcss.com/blog/tailwindcss-v4-3).
4. **Partial head start** — `tw-animate-css`, `shadcn/tailwind.css`, and OKLCH tokens reduce some migration work.

### Costs / risks

1. **Major rewrite of tooling** — config moves from JS to CSS; PostCSS setup changes.
2. **shadcn component drift** — without reconfiguring `components.json`, `shadcn add` may keep pulling v3-style components.
3. **Browser support floor** — Tailwind v4 targets modern browsers: Safari 16.4+, Chrome 111+, Firefox 128+. Acceptable for this PWA unless you explicitly support older mobile browsers.
4. **Regression surface** — visual diffs in dark mode, focus rings, border colors, and component spacing are possible. E2e tests catch functional breaks but not all visual ones.

### When **not** to rush

- The app works fine on 3.4.19 today.
- You are mid-feature and cannot afford a styling regression pass.
- You must support browsers below the v4 floor.

---

## Prerequisites

Before starting the migration branch:

1. **Work on a feature branch** branched from current `main` (per `AGENTS.md`).
2. **Node.js >= 24** is already required by `frontend/package.json` — satisfies the Tailwind upgrade tool requirement (Node 20+).
3. **Commit a clean baseline** so diffs are easy to review.
4. **Read official guides first:**
   - [Tailwind CSS v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide)
   - [shadcn/ui — Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4)
5. **Skim Playwright skill** if e2e failures occur: `.agents/skills/playwright-best-practices/SKILL.md`.

---

## Migration checklist

Work through these steps in order. After each major step, run `pnpm --filter meal-planning-frontend build` (or `cd frontend && pnpm build`) to catch breakage early.

### 1. Create branch and run the official upgrade tool

```bash
git fetch origin main
git checkout -b cursor/tailwind-v4-migration-18e3 origin/main

cd frontend
npx @tailwindcss/upgrade@latest
```

The codemod should:

- Bump `tailwindcss` to v4.x
- Migrate `tailwind.config.js` settings into CSS
- Replace `@tailwind` directives with `@import "tailwindcss"`
- Update template files using deprecated utilities

**Review every codemod change manually.** Do not blindly commit.

### 2. Switch Vite to `@tailwindcss/vite`

Recommended integration for this project (Vite 5, not webpack).

**Add:**

```bash
cd frontend
pnpm add -D @tailwindcss/vite
```

**Update `frontend/vite.config.ts`:**

```ts
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({ /* existing config */ }),
  ],
  // ...
})
```

**PostCSS decision:**

- With `@tailwindcss/vite`, you typically **remove** `tailwindcss` from `postcss.config.js`.
- `autoprefixer` may no longer be needed — Tailwind v4 handles vendor prefixes. Try removing it; keep only if something breaks.

### 3. Migrate CSS configuration

**Replace v3 entry directives** in `frontend/src/index.css`:

```css
/* REMOVE (v3) */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ADD (v4) */
@import "tailwindcss";
```

**Move theme tokens** from `tailwind.config.js` into CSS using `@theme inline`, following [shadcn's Tailwind v4 CSS variable guide](https://ui.shadcn.com/docs/tailwind-v4):

1. Move `:root` and `.dark` blocks **out of** `@layer base` (if the codemod didn't already).
2. Add `@theme inline { ... }` mapping semantic colors (`--color-background`, `--color-primary`, etc.) to the existing CSS variables.
3. Preserve custom tokens already in use: `link`, `link-hover`, sidebar tokens, chart tokens, `--radius`.
4. Keep `darkMode: 'class'` behavior — in v4 this is typically `@custom-variant dark (&:is(.dark *));` or equivalent per upgrade guide.

**Current v3 theme extensions to preserve** (from `frontend/tailwind.config.js`):

- Semantic colors: `border`, `input`, `ring`, `background`, `foreground`, `primary`, `secondary`, `destructive`, `muted`, `accent`, `popover`, `card`, `link`, `link-hover`
- Border radii: `lg`, `md`, `sm` derived from `--radius`

**Keep existing imports at top of `index.css`:**

```css
@import "tw-animate-css";
@import "shadcn/tailwind.css";
@import "@fontsource-variable/geist";
@import "tailwindcss";
```

Order may matter — if build fails, follow the order in a fresh shadcn v4 project's `globals.css` as reference.

### 4. Remove v3-only artifacts

| Remove / replace | Reason |
| --- | --- |
| `frontend/tailwind.config.js` | Replaced by CSS `@theme` / `@source` (unless upgrade tool keeps a minimal compat file — prefer full CSS migration) |
| `tailwindcss-animate` devDependency | Replaced by `tw-animate-css` (already a dependency) |
| `tailwindcss` from PostCSS plugins | Handled by `@tailwindcss/vite` |
| `autoprefixer` (try removing) | Often redundant in v4 |

**Add `@source` directives** if the upgrade tool doesn't — ensure Tailwind scans:

- `frontend/index.html`
- `frontend/src/**/*.{js,ts,jsx,tsx}`

Example:

```css
@source "../index.html";
@source "../src/**/*.{js,ts,jsx,tsx}";
```

(Exact relative paths depend on where directives live — match upgrade tool output.)

### 5. Update `frontend/package.json` dependencies

Target state (versions are illustrative — use latest compatible at migration time):

```json
"dependencies": {
  "tw-animate-css": "^1.4.0",
  "tailwind-merge": "^3.5.0"
},
"devDependencies": {
  "@tailwindcss/vite": "^4.3.x",
  "tailwindcss": "^4.3.x"
}
```

**Remove:**

- `tailwindcss-animate`
- `autoprefixer` (if confirmed unnecessary)
- Possibly `postcss` itself if nothing else uses it

Run `pnpm install` from repo root and commit the lockfile.

### 6. Realign shadcn CLI and components

This step is easy to miss and causes silent drift.

1. **Re-run shadcn init** after Tailwind v4 is working:

   ```bash
   cd frontend
   pnpm dlx shadcn@latest init
   ```

   When prompted, confirm Tailwind v4 is detected.

2. **Update `frontend/components.json`:**
   - Ensure `tailwind.config` path reflects the new setup (may become `""` or a CSS path depending on CLI version).
   - Ensure `style` resolves to the **v4** registry for your preset (`base-nova` or successor). See [shadcn discussion #6714](https://github.com/shadcn-ui/ui/discussions/6714) — the CLI may detect v4 but leave `"style"` pointing at v3 components unless updated.

3. **Re-add or diff existing UI components** against the v4 registry:

   ```bash
   pnpm dlx shadcn@latest add button card dialog --overwrite
   ```

   Review overwrites carefully — v4 components drop `forwardRef`, add `data-slot` attributes, and may change class names.

4. **Reference implementation:** [shadcn/ui `apps/v4`](https://github.com/shadcn-ui/ui/tree/main/apps/v4) for canonical v4 `components.json`, CSS, and component patterns.

### 7. Fix breakages in app code

Search for patterns that commonly break across v3 → v4:

```bash
cd frontend
# Deprecated utilities the codemod might miss
rg "space-[xy]-" src/
rg "flex-shrink-|flex-grow-" src/
rg "w-\d+ h-\d+" src/   # consider size-* where width === height
rg "outline-none" src/   # v4 changes default outline behavior
```

**Project-specific notes:**

- `frontend/src/lib/utils.ts` uses `tailwind-merge` — v3.5+ supports `size-*`; no change expected.
- `@apply` in `index.css` should still work but verify focus ring and border utilities render correctly.
- PWA / service worker (`vite-plugin-pwa`) is unrelated to Tailwind — but run a production build to ensure CSS output is cached correctly.

### 8. Verify

#### Build and unit tests

```bash
cd frontend
pnpm build
pnpm test:unit
```

Fix all TypeScript and build errors before proceeding.

#### E2e tests

```bash
cd frontend
pnpm e2e
```

Existing specs under `frontend/e2e/`:

- `smoke.spec.ts`, `navigation.spec.ts`, `today-load.spec.ts`
- `recipes-list.spec.ts`, `recipe.spec.ts`, `recipe-tags-input.spec.ts`, `import-recipe.spec.ts`
- `weekly-flow.spec.ts`, `week-picker.spec.ts`, `meal-plan-persons.spec.ts`
- `shopping-list.spec.ts`, `route-states.spec.ts`

E2e catches routing and interaction regressions; supplement with manual visual checks.

#### Manual visual checklist

- [ ] Light mode: page background, card surfaces, text contrast
- [ ] Dark mode (`.dark` class): same checks
- [ ] Focus visible rings on buttons, inputs, links
- [ ] Dialog / popover / dropdown-menu layering (z-index, backdrop)
- [ ] Calendar and date picker styling
- [ ] Mobile viewport (PWA layout)

#### Dev server smoke test

```bash
cd frontend
pnpm dev
```

Confirm HMR works and CSS reloads without errors.

---

## Expected file diff summary

| File | Expected change |
| --- | --- |
| `frontend/package.json` | tailwindcss 4.x, add `@tailwindcss/vite`, remove `tailwindcss-animate` / possibly `autoprefixer` |
| `pnpm-lock.yaml` | Updated lockfile |
| `frontend/vite.config.ts` | Add `@tailwindcss/vite` plugin |
| `frontend/postcss.config.js` | Remove or simplify (may delete entirely) |
| `frontend/tailwind.config.js` | Delete or reduce to stub (prefer delete after CSS migration) |
| `frontend/src/index.css` | Major rewrite: `@import "tailwindcss"`, `@theme inline`, `@source`, restructured `:root` / `.dark` |
| `frontend/components.json` | Updated for v4 registry |
| `frontend/src/components/ui/*.tsx` | Possible updates from shadcn re-add |
| `docs/tailwind-v3-to-v4-migration.md` | Mark migration complete / add completion notes |

---

## Rollback plan

If the migration hits a wall:

1. Abandon the branch — `main` is unchanged.
2. If partially merged, revert the PR commit.
3. Tailwind v3.4.19 remains valid indefinitely for this codebase.

Do **not** leave a half-migrated state on `main` (v4 dependencies with v3 config, or vice versa).

---

## Completion criteria

The migration is **done** when:

1. `tailwindcss` resolves to 4.3.x (or latest 4.x patch).
2. `pnpm build` succeeds with no Tailwind/PostCSS warnings treated as errors.
3. `pnpm test:unit` and `pnpm e2e` pass.
4. `tailwind.config.js` and `tailwindcss-animate` are removed.
5. `shadcn add` installs v4-compatible components (verify by checking a component for `data-slot` attributes and no `forwardRef`).
6. Visual spot-check passes in light and dark mode.
7. A PR is opened into `main` with a conventional commit message, e.g. `build(frontend): migrate Tailwind CSS v3 to v4`.

---

## References

- [Tailwind CSS v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide)
- [Tailwind CSS v4.3 release blog](https://tailwindcss.com/blog/tailwindcss-v4-3)
- [Tailwind CSS v4.3 changelog](https://github.com/tailwindlabs/tailwindcss/blob/main/CHANGELOG.md)
- [shadcn/ui — Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4)
- [shadcn/ui v4 reference app (`apps/v4`)](https://github.com/shadcn-ui/ui/tree/main/apps/v4)
- [shadcn discussion: CLI registry path after v4 migration](https://github.com/shadcn-ui/ui/discussions/6714)
- [Playwright best practices (this repo)](../../.agents/skills/playwright-best-practices/SKILL.md)

---

## Agent handoff prompt (copy-paste)

When ready to execute, give an agent something like:

> Implement the Tailwind CSS v3 → v4 migration for this repo following `docs/tailwind-v3-to-v4-migration.md`. Work on branch `cursor/tailwind-v4-migration-18e3` from `origin/main`. Run build, unit tests, and e2e tests before opening a PR. Do not upgrade React to 19 unless required.

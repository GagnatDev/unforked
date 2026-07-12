---
name: verify
description: Build, launch, and drive this app to verify frontend changes end-to-end with a mocked API and screenshots.
---

# Verifying frontend changes (unforked)

The backend needs Testcontainers/Postgres, so for UI verification run the
frontend alone and mock the API with Playwright routes.

## Launch

```bash
cd frontend
pnpm install            # workspace root also works: pnpm install
pnpm exec vite --host 127.0.0.1 --port 4199 &   # dev server, any free port
```

## Drive

Write a Node ESM script that uses the project's own Playwright:

```js
import { createRequire } from 'module'
const require = createRequire('/abs/path/to/frontend/package.json')
const { chromium, devices } = require('@playwright/test')
// In the remote env the browser is preinstalled; do NOT run `playwright install`:
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
```

Mock these routes before `page.goto` (shapes: see `frontend/src/api.ts`,
`frontend/src/types.ts`):

- `**/api/auth/me` → `{ id, email, role, familyId }` (RequireAuth blocks the app without it)
- `**/api/recipes**` → `Recipe[]` (`{ id, doc: { name, servings, ingredients: [], steps: [], tags: [], description: '', sourceUrl: null, sourceName: null } }`)
- `**/api/meal-plans/current**` → `MealPlanDoc`; echo the body on PUT
- `**/api/family` → `{ defaultMealPlanPersons: number }`

Use `devices['iPhone 13']` for mobile checks and a 1200px viewport for the
desktop table (both layouts are always in the DOM; CSS hides one — scope
queries or take `[0]`).

## Gotchas

- Playwright e2e locators assume the desktop table (`getByRole('row')`) and
  the label "People (default for the week)" — keep those stable.
- Select popups: assert no horizontal overflow via
  `document.scrollingElement.scrollWidth === clientWidth`; the open popup is
  `[data-slot="select-content"][data-open]` (closed ones also match the slot).
- Tailwind here is **v3**: v4 class syntax like `w-(--var)` or `*:` variants
  silently compiles to nothing — check generated CSS when a layout constraint
  "doesn't work".

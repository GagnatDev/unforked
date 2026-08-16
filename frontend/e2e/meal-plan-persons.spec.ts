import { expect, test, type Page, type Request, type Route } from '@playwright/test'
import { selectMealPlanPeople, selectMealPlanRecipe } from './meal-plan-select'

/** Same frozen instant as week-picker.spec.ts → ISO week 2026-W25 in UTC. */
const FROZEN_NOW = new Date(Date.UTC(2026, 5, 15, 12, 0, 0))

/** June 22, 2026 → ISO week 2026-W26 (avoids DB clashes when integration tests run in parallel). */
const FROZEN_NOW_W26 = new Date(Date.UTC(2026, 5, 22, 12, 0, 0))

const MOCK_RECIPE_ID = '11111111-1111-1111-1111-111111111111'

/** Matches `mealPlan.defaultPeople` in en locale (Playwright config locks i18n to en). */
const MEAL_PLAN_DEFAULT_PEOPLE_LABEL = 'People (default for the week)'

/** Matches `recipeForm.ingredient*Aria` in en locale (distinct from recipe title "Name"). */
const INGREDIENT_NAME = 'Ingredient name'
const INGREDIENT_QTY = 'Ingredient quantity'
const INGREDIENT_UNIT = 'Ingredient unit'

type PlanPayload = {
  weekIdentifier: string
  defaultPersons: number | null
  assignments: {
    day: string
    recipeId?: string
    recipeName?: string
    persons?: number | null
  }[]
}

/**
 * The page saves every change on its own, so a run of edits produces a run of
 * PUTs. Wait for the one carrying the state the test is asserting about rather
 * than for "a save".
 */
function waitForPlanPut(page: Page, matches: (payload: PlanPayload) => boolean) {
  return page.waitForRequest((req: Request) => {
    if (req.method() !== 'PUT') return false
    if (!req.url().includes('/api/meal-plans/current')) return false
    const payload = req.postDataJSON() as PlanPayload | null
    return payload != null && matches(payload)
  })
}

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

/** Creates a recipe named `recipeName` with 400 g flour (servings default 4). Asserts POST succeeds. */
async function createFlourRecipe(page: Page, recipeName: string) {
  await page.goto('/recipes/new')
  await page.locator('form').getByRole('textbox').first().fill(recipeName)
  await page.getByRole('button', { name: 'Add ingredient' }).click()
  await page.getByRole('textbox', { name: INGREDIENT_NAME }).fill('flour')
  await page.getByRole('textbox', { name: INGREDIENT_QTY }).fill('400')
  await page.getByRole('textbox', { name: INGREDIENT_UNIT }).fill('g')

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/api/recipes')
  )
  await page.getByRole('button', { name: 'Create' }).click()
  const createResponse = await createResponsePromise
  expect(createResponse.ok()).toBeTruthy()
  return createResponse
}

test.describe('meal plan people (mocked)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: FROZEN_NOW })
    await page.route('**/api/recipes**', async (route) => {
      if (route.request().method() !== 'GET') {
        await route.continue()
        return
      }
      await fulfillJson(route, [
        {
          id: MOCK_RECIPE_ID,
          doc: {
            name: 'Mock soup',
            description: '',
            ingredients: [],
            steps: [],
            servings: 4,
            tags: [],
          },
        },
      ])
    })
  })

  test('shows week default and per-day overrides from API; edits save themselves', async ({
    page,
  }) => {
    // Stateful on purpose: each autosaved edit re-reads the plan before
    // merging onto it, so a frozen GET would hand the second save a doc that
    // predates the first.
    let storedPlan: PlanPayload = {
      weekIdentifier: '2026-W26',
      defaultPersons: 3,
      assignments: [
        {
          day: 'monday',
          recipeId: MOCK_RECIPE_ID,
          recipeName: 'Mock soup',
        },
        {
          day: 'tuesday',
          recipeId: MOCK_RECIPE_ID,
          recipeName: 'Mock soup',
          persons: 2,
        },
      ],
    }
    await page.route('**/api/meal-plans/current**', async (route) => {
      if (route.request().method() === 'PUT') {
        storedPlan = JSON.parse(route.request().postData() ?? '{}') as PlanPayload
        await fulfillJson(route, storedPlan)
        return
      }
      const week =
        new URL(route.request().url()).searchParams.get('week') ?? '2026-W26'
      await fulfillJson(route, { ...storedPlan, weekIdentifier: week })
    })

    await page.goto('/meal-plan')
    await expect(page.getByRole('heading', { name: "This week's dinners" })).toBeVisible()

    const defaultPeople = page.getByLabel(MEAL_PLAN_DEFAULT_PEOPLE_LABEL)
    await expect(defaultPeople).toHaveText('3')
    // Days without an override name the week default they fall back to.
    await expect(
      page.getByRole('combobox', { name: /People for Monday/i })
    ).toHaveText('Default (3)')
    await expect(
      page.getByRole('combobox', { name: /People for Tuesday/i })
    ).toHaveText('2')

    // Nothing to press: both edits save themselves.
    await expect(page.getByRole('button', { name: /save/i })).toHaveCount(0)

    const putPromise = waitForPlanPut(
      page,
      (payload) =>
        payload.defaultPersons === 5 &&
        payload.assignments.find((a) => a.day === 'tuesday')?.persons === 4
    )
    await selectMealPlanPeople(defaultPeople, '5')
    await selectMealPlanPeople(
      page.getByRole('combobox', { name: /People for Tuesday/i }),
      '4'
    )
    const payload = (await putPromise).postDataJSON() as PlanPayload

    expect(payload.weekIdentifier).toMatch(/^2026-W\d{2}$/)
    const monday = payload.assignments.find((a) => a.day === 'monday')
    expect(monday?.persons == null || monday.persons === undefined).toBe(true)
    await expect(page.getByRole('status')).toHaveText('Saved')
  })
})

test.describe('meal plan people and shopping list', { tag: '@integration' }, () => {
  test('scales shopping list from week default people and recipe servings', async ({ page }) => {
    let pageError: Error | undefined
    page.on('pageerror', (e) => {
      pageError = e
    })

    await page.clock.install({ time: FROZEN_NOW })

    const recipeName = `E2E scaled flour ${Date.now()}`
    await createFlourRecipe(page, recipeName)

    await page.goto('/meal-plan')
    await expect(page.getByRole('heading', { name: "This week's dinners" })).toBeVisible()

    await selectMealPlanPeople(page.getByLabel(MEAL_PLAN_DEFAULT_PEOPLE_LABEL), '2')

    const savedPlan = waitForPlanPut(
      page,
      (payload) =>
        payload.defaultPersons === 2 &&
        payload.assignments.some((a) => a.day === 'monday')
    )
    await selectMealPlanRecipe(page.getByRole('row', { name: /^Monday\b/i }), recipeName)
    expect((await (await savedPlan).response())?.ok()).toBeTruthy()

    await page.goto('/shopping-list')
    await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible()
    const flourLine = page.getByRole('listitem').filter({ hasText: /^Flour/i })
    await expect(flourLine).toBeVisible()
    await expect(flourLine).toContainText('200')
    await expect(flourLine).toContainText('g')
    expect(pageError).toBeUndefined()
  })

  test('per-day people override aggregates correctly on shopping list', async ({ page }) => {
    let pageError: Error | undefined
    page.on('pageerror', (e) => {
      pageError = e
    })

    await page.clock.install({ time: FROZEN_NOW_W26 })

    const recipeName = `E2E override flour ${Date.now()}`
    await createFlourRecipe(page, recipeName)

    await page.goto('/meal-plan')
    await selectMealPlanPeople(page.getByLabel(MEAL_PLAN_DEFAULT_PEOPLE_LABEL), '4')

    const mondayRow = page.getByRole('row', { name: /^Monday\b/i })
    const tuesdayRow = page.getByRole('row', { name: /^Tuesday\b/i })
    await selectMealPlanRecipe(mondayRow, recipeName)
    await selectMealPlanRecipe(tuesdayRow, recipeName)

    const savedPlan = waitForPlanPut(
      page,
      (payload) =>
        payload.defaultPersons === 4 &&
        payload.assignments.find((a) => a.day === 'monday')?.persons === 2 &&
        payload.assignments.some((a) => a.day === 'tuesday')
    )
    await selectMealPlanPeople(
      mondayRow.getByRole('combobox', { name: /People for Monday/i }),
      '2'
    )
    expect((await (await savedPlan).response())?.ok()).toBeTruthy()

    await page.goto('/shopping-list')
    const flourLine = page.getByRole('listitem').filter({ hasText: /^Flour/i })
    await expect(flourLine).toContainText('600')
    await expect(flourLine).toContainText('g')
    expect(pageError).toBeUndefined()
  })
})

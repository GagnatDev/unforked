import { expect, test, type Page, type Route } from '@playwright/test'
import { selectMealPlanRecipe } from './meal-plan-select'

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

  test('shows week default and per-day overrides from API; save sends updated plan', async ({
    page,
  }) => {
    await page.route('**/api/meal-plans/current**', async (route) => {
      if (route.request().method() === 'PUT') {
        const body = route.request().postData() ?? '{}'
        await fulfillJson(route, JSON.parse(body))
        return
      }
      const week =
        new URL(route.request().url()).searchParams.get('week') ?? '2026-W26'
      await fulfillJson(route, {
        weekIdentifier: week,
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
      })
    })

    await page.goto('/meal-plan')
    await expect(page.getByRole('heading', { name: "This week's dinners" })).toBeVisible()

    const defaultPeople = page.getByLabel(MEAL_PLAN_DEFAULT_PEOPLE_LABEL)
    await expect(defaultPeople).toHaveValue('3')
    await expect(
      page.getByRole('spinbutton', { name: /People for Monday/i })
    ).toHaveValue('')
    await expect(
      page.getByRole('spinbutton', { name: /People for Tuesday/i })
    ).toHaveValue('2')

    await defaultPeople.fill('5')
    await page.getByRole('spinbutton', { name: /People for Tuesday/i }).fill('4')

    const putPromise = page.waitForRequest(
      (req) =>
        req.method() === 'PUT' && req.url().includes('/api/meal-plans/current')
    )
    await page.getByRole('button', { name: 'Save plan' }).click()
    const putReq = await putPromise
    const payload = putReq.postDataJSON() as {
      weekIdentifier: string
      defaultPersons: number
      assignments: { day: string; persons?: number | null }[]
    }

    expect(payload.weekIdentifier).toMatch(/^2026-W\d{2}$/)
    expect(payload.defaultPersons).toBe(5)
    const tuesday = payload.assignments.find((a) => a.day === 'tuesday')
    expect(tuesday?.persons).toBe(4)
    const monday = payload.assignments.find((a) => a.day === 'monday')
    expect(monday?.persons == null || monday.persons === undefined).toBe(true)
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

    await page.getByLabel(MEAL_PLAN_DEFAULT_PEOPLE_LABEL).fill('2')
    await selectMealPlanRecipe(page.getByRole('row', { name: /^Monday\b/i }), recipeName)

    const savePlanResponse = page.waitForResponse((response) => {
      return response.request().method() === 'PUT' && response.url().includes('/api/meal-plans/current')
    })
    await page.getByRole('button', { name: 'Save plan' }).click()
    expect((await savePlanResponse).ok()).toBeTruthy()

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
    await page.getByLabel(MEAL_PLAN_DEFAULT_PEOPLE_LABEL).fill('4')

    const mondayRow = page.getByRole('row', { name: /^Monday\b/i })
    const tuesdayRow = page.getByRole('row', { name: /^Tuesday\b/i })
    await selectMealPlanRecipe(mondayRow, recipeName)
    await selectMealPlanRecipe(tuesdayRow, recipeName)

    await mondayRow.getByRole('spinbutton', { name: /People for Monday/i }).fill('2')

    const savePlanResponse = page.waitForResponse((response) => {
      return response.request().method() === 'PUT' && response.url().includes('/api/meal-plans/current')
    })
    await page.getByRole('button', { name: 'Save plan' }).click()
    expect((await savePlanResponse).ok()).toBeTruthy()

    await page.goto('/shopping-list')
    const flourLine = page.getByRole('listitem').filter({ hasText: /^Flour/i })
    await expect(flourLine).toContainText('600')
    await expect(flourLine).toContainText('g')
    expect(pageError).toBeUndefined()
  })
})

import { expect, test } from '@playwright/test'

import { swipeRowOpen } from './swipe'

/** Must match [playwright.config.ts](playwright.config.ts) e2e backend port (see `E2E_BACKEND_PORT`). */
const backendOrigin =
  process.env.PLAYWRIGHT_API_ORIGIN ??
  `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? '18080'}`

test.describe('recipes list (real API)', { tag: '@integration' }, () => {
  test('lists recipes from backend and navigates to edit form', async ({ page }) => {
    let pageError: Error | undefined
    page.on('pageerror', (e) => {
      pageError = e
    })

    const recipeName = `List Recipe ${Date.now()}`

    // Create a recipe via the same frontend flow used in other integration specs
    await page.goto('/recipes/new')
    await page.locator('form').getByRole('textbox').first().fill(recipeName)

    const createResponsePromise = page.waitForResponse((response) => {
      return response.request().method() === 'POST' && response.url().endsWith('/api/recipes')
    })
    await page.getByRole('button', { name: /create/i }).click()

    const createResponse = await createResponsePromise
    expect(createResponse.ok()).toBeTruthy()
    const created = await createResponse.json()
    expect(created.id).toBeTruthy()

    await page.goto('/recipes')
    await expect(page.getByRole('heading', { name: /recipes/i })).toBeVisible()

    const row = page.getByRole('link', { name: recipeName }).first()
    await expect(row).toBeVisible()

    await row.click()
    await expect(page).toHaveURL(new RegExp(`/recipes/${created.id}/edit$`))
    await expect(page.getByRole('heading', { name: /edit recipe/i })).toBeVisible()

    expect(pageError).toBeUndefined()
  })

  test('shows empty state when search has no matches', async ({ page }) => {
    let pageError: Error | undefined
    page.on('pageerror', (e) => {
      pageError = e
    })

    await page.goto('/recipes')

    await expect(
      page.getByRole('heading', { name: /recipes/i })
    ).toBeVisible()

    const searchInput = page.getByPlaceholder(/search/i)
    await expect(searchInput).toBeVisible()

    await searchInput.fill('no-such-recipe-name-e2e')

    await expect(page.getByText('No recipes yet.')).toBeVisible()

    expect(pageError).toBeUndefined()
  })

  test('deletes a recipe by swiping the row open and pressing the trash panel', async ({
    page,
    request,
  }) => {
    let pageError: Error | undefined
    page.on('pageerror', (e) => {
      pageError = e
    })

    const recipeName = `Swipe Delete ${Date.now()}`
    const createRes = await request.post(`${backendOrigin}/api/recipes`, {
      data: { name: recipeName, description: '', ingredients: [], steps: [], servings: 2, tags: [] },
    })
    expect(createRes.ok()).toBeTruthy()

    await page.goto('/recipes')

    // Narrow the list to this recipe alone: other specs add recipes in
    // parallel, and a growing list would shift the row mid-swipe.
    await page.getByPlaceholder(/search/i).fill(recipeName)

    const row = page.getByRole('listitem').filter({ hasText: recipeName })
    await expect(row).toHaveCount(1)

    await swipeRowOpen(page, row)

    // Revealing the panel is not itself destructive.
    await expect(row.locator('[data-swipe-state]')).toHaveAttribute('data-swipe-state', 'open')
    await expect(page.getByRole('link', { name: recipeName })).toBeVisible()

    const deleteResponse = page.waitForResponse(
      (response) => response.request().method() === 'DELETE' && response.url().includes('/api/recipes/'),
    )
    await row.getByRole('button', { name: `Delete ${recipeName}` }).click()

    await expect(page.getByRole('link', { name: recipeName })).toHaveCount(0)
    expect((await deleteResponse).ok()).toBeTruthy()

    // The row stays gone after a reload, so the delete really reached the API.
    await page.reload()
    await expect(page.getByRole('link', { name: recipeName })).toHaveCount(0)

    expect(pageError).toBeUndefined()
  })

  test('filters recipes by name using search input', async ({ page, request }) => {
    let pageError: Error | undefined
    page.on('pageerror', (e) => {
      pageError = e
    })

    const uniquePrefix = `Filter Recipe ${Date.now()}`
    const keepName = `${uniquePrefix} Keep`
    const hideName = `${uniquePrefix} Hide`

    for (const name of [keepName, hideName]) {
      const createRes = await request.post(`${backendOrigin}/api/recipes`, {
        data: {
          name,
          description: '',
          ingredients: [],
          steps: [],
          servings: 2,
          tags: [],
        },
      })
      expect(createRes.ok()).toBeTruthy()
    }

    await page.goto('/recipes')

    const searchInput = page.getByPlaceholder(/search/i)
    await expect(searchInput).toBeVisible()

    // Wait for the initial unfiltered list to include both recipes.
    await expect(page.getByRole('link', { name: keepName })).toBeVisible()
    await expect(page.getByRole('link', { name: hideName })).toBeVisible()

    await searchInput.fill('Keep')

    await expect(page.getByRole('link', { name: keepName })).toBeVisible()
    await expect(page.getByRole('link', { name: hideName })).toHaveCount(0)

    expect(pageError).toBeUndefined()
  })
})


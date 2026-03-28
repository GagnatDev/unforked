import { expect, test } from '@playwright/test'

/** Must match [playwright.config.ts](playwright.config.ts) e2e backend port (see `E2E_BACKEND_PORT`). */
const backendOrigin =
  process.env.PLAYWRIGHT_API_ORIGIN ??
  `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? '18080'}`

test.describe('recipe form (real API)', { tag: '@integration' }, () => {
  test('creates a recipe through the frontend form and persists via real backend', async ({ page }) => {
    let pageError: Error | undefined
    page.on('pageerror', (e) => {
      pageError = e
    })

    const recipeName = `Playwright Recipe ${Date.now()}`
    await page.goto('/recipes/new')
    await page.locator('form').getByRole('textbox').first().fill(recipeName)

    const createResponsePromise = page.waitForResponse((response) => {
      return response.request().method() === 'POST' && response.url().endsWith('/api/recipes')
    })
    await page.getByRole('button', { name: 'Create' }).click()

    const createResponse = await createResponsePromise
    expect(createResponse.ok()).toBeTruthy()
    const payload = await createResponse.json()
    expect(payload.id).toBeTruthy()
    expect(payload.doc?.name).toBe(recipeName)

    await expect(page).toHaveURL(new RegExp(`/recipes/${payload.id}/edit$`))
    await expect(page.getByRole('heading', { name: 'Edit recipe' })).toBeVisible()
    expect(pageError).toBeUndefined()
  })

  test('adds multiple tags with Enter (no comma required)', async ({ page }) => {
    let pageError: Error | undefined
    page.on('pageerror', (e) => {
      pageError = e
    })

    const recipeName = `Tagged Recipe ${Date.now()}`
    await page.goto('/recipes/new')
    await page.locator('form').getByRole('textbox').first().fill(recipeName)

    const tags = page.getByRole('combobox', { name: /^Tags$/i })
    await tags.pressSequentially('dinner', { delay: 25 })
    await tags.press('Enter')
    await tags.pressSequentially('quick', { delay: 25 })
    await tags.press('Enter')

    const createResponsePromise = page.waitForResponse((response) => {
      return response.request().method() === 'POST' && response.url().endsWith('/api/recipes')
    })
    await page.getByRole('button', { name: 'Create' }).click()

    const createResponse = await createResponsePromise
    expect(createResponse.ok()).toBeTruthy()
    const payload = await createResponse.json()
    const savedTags = [...(payload.doc?.tags ?? [])]
    expect(savedTags).toHaveLength(2)
    expect(savedTags).toEqual(expect.arrayContaining(['dinner', 'quick']))
    expect(pageError).toBeUndefined()
  })

  test('suggests tags from other recipes and saves the chosen tag', async ({ page, request }) => {
    let pageError: Error | undefined
    page.on('pageerror', (e) => {
      pageError = e
    })

    const seedName = `Tag seed ${Date.now()}`
    const seedRes = await request.post(`${backendOrigin}/api/recipes`, {
      data: {
        name: seedName,
        description: '',
        ingredients: [],
        steps: [],
        servings: 2,
        tags: ['vegetarian'],
      },
    })
    expect(seedRes.ok()).toBeTruthy()

    const recipeName = `Autocomplete Recipe ${Date.now()}`
    await page.goto('/recipes/new')
    await page.locator('form').getByRole('textbox').first().fill(recipeName)

    const tags = page.getByRole('combobox', { name: /^Tags$/i })
    await tags.fill('veg')
    const option = page.getByRole('option', { name: 'vegetarian' })
    await expect(option).toBeVisible({ timeout: 10_000 })
    await option.click()

    const createResponsePromise = page.waitForResponse((response) => {
      return response.request().method() === 'POST' && response.url().endsWith('/api/recipes')
    })
    await page.getByRole('button', { name: 'Create' }).click()

    const createResponse = await createResponsePromise
    expect(createResponse.ok()).toBeTruthy()
    const payload = await createResponse.json()
    expect(payload.doc?.tags ?? []).toContain('vegetarian')
    expect(pageError).toBeUndefined()
  })

  test('edit form shows chips and persists an added tag on update', async ({ page, request }) => {
    let pageError: Error | undefined
    page.on('pageerror', (e) => {
      pageError = e
    })

    const createRes = await request.post(`${backendOrigin}/api/recipes`, {
      data: {
        name: `Edit tags ${Date.now()}`,
        description: '',
        ingredients: [],
        steps: [],
        servings: 2,
        tags: ['dinner'],
      },
    })
    expect(createRes.ok()).toBeTruthy()
    const { id } = (await createRes.json()) as { id: string }

    await page.goto(`/recipes/${id}/edit`)
    await expect(page.getByText('dinner', { exact: true })).toBeVisible()

    const tags = page.getByRole('combobox', { name: /^Tags$/i })
    await tags.pressSequentially('quick', { delay: 25 })
    await tags.press('Enter')

    const updatePromise = page.waitForResponse(
      (response) => response.request().method() === 'PUT' && response.url().endsWith(`/api/recipes/${id}`)
    )
    await page.getByRole('button', { name: 'Update' }).click()
    const updateResponse = await updatePromise
    expect(updateResponse.ok()).toBeTruthy()
    const updated = await updateResponse.json()
    const savedTags = [...(updated.doc?.tags ?? [])]
    expect(savedTags).toHaveLength(2)
    expect(savedTags).toEqual(expect.arrayContaining(['dinner', 'quick']))
    expect(pageError).toBeUndefined()
  })
})

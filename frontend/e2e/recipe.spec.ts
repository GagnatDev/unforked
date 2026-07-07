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

    await test.step('fill in the new recipe form', async () => {
      await page.goto('/recipes/new')
      await page.locator('form').getByRole('textbox').first().fill(recipeName)
    })

    const payload = await test.step('submit and persist via POST /api/recipes', async () => {
      const createResponsePromise = page.waitForResponse((response) => {
        return response.request().method() === 'POST' && response.url().endsWith('/api/recipes')
      })
      await page.getByRole('button', { name: 'Create' }).click()

      const createResponse = await createResponsePromise
      expect(createResponse.ok()).toBeTruthy()
      const body = await createResponse.json()
      expect(body.id).toBeTruthy()
      expect(body.doc?.name).toBe(recipeName)
      return body
    })

    await test.step('redirect to the edit page for the created recipe', async () => {
      await expect(page).toHaveURL(new RegExp(`/recipes/${payload.id}/edit$`))
      await expect(page.getByRole('heading', { name: 'Edit recipe' })).toBeVisible()
    })

    expect(pageError).toBeUndefined()
  })

  test('adds multiple tags with Enter (no comma required)', async ({ page }) => {
    let pageError: Error | undefined
    page.on('pageerror', (e) => {
      pageError = e
    })

    const recipeName = `Tagged Recipe ${Date.now()}`

    await test.step('fill in the new recipe form', async () => {
      await page.goto('/recipes/new')
      await page.locator('form').getByRole('textbox').first().fill(recipeName)
    })

    await test.step('add two tags with Enter', async () => {
      const tags = page.getByRole('combobox', { name: /^Tags$/i })
      await tags.pressSequentially('dinner', { delay: 25 })
      await tags.press('Enter')
      await tags.pressSequentially('quick', { delay: 25 })
      await tags.press('Enter')
    })

    await test.step('submit and assert both tags are persisted', async () => {
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
    })

    expect(pageError).toBeUndefined()
  })

  test('suggests tags from other recipes and saves the chosen tag', async ({ page, request }) => {
    let pageError: Error | undefined
    page.on('pageerror', (e) => {
      pageError = e
    })

    await test.step('seed a recipe tagged "vegetarian" via the API', async () => {
      const seedRes = await request.post(`${backendOrigin}/api/recipes`, {
        data: {
          name: `Tag seed ${Date.now()}`,
          description: '',
          ingredients: [],
          steps: [],
          servings: 2,
          tags: ['vegetarian'],
        },
      })
      expect(seedRes.ok()).toBeTruthy()
    })

    await test.step('fill in the new recipe form', async () => {
      const recipeName = `Autocomplete Recipe ${Date.now()}`
      await page.goto('/recipes/new')
      await page.locator('form').getByRole('textbox').first().fill(recipeName)
    })

    await test.step('pick the suggested "vegetarian" tag', async () => {
      const tags = page.getByRole('combobox', { name: /^Tags$/i })
      await tags.fill('veg')
      const option = page.getByRole('option', { name: 'vegetarian' })
      await expect(option).toBeVisible({ timeout: 10_000 })
      await option.click()
    })

    await test.step('submit and assert the chosen tag is persisted', async () => {
      const createResponsePromise = page.waitForResponse((response) => {
        return response.request().method() === 'POST' && response.url().endsWith('/api/recipes')
      })
      await page.getByRole('button', { name: 'Create' }).click()

      const createResponse = await createResponsePromise
      expect(createResponse.ok()).toBeTruthy()
      const payload = await createResponse.json()
      expect(payload.doc?.tags ?? []).toContain('vegetarian')
    })

    expect(pageError).toBeUndefined()
  })

  test('edit form shows chips and persists an added tag on update', async ({ page, request }) => {
    let pageError: Error | undefined
    page.on('pageerror', (e) => {
      pageError = e
    })

    const id = await test.step('seed a recipe tagged "dinner" via the API', async () => {
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
      const body = (await createRes.json()) as { id: string }
      return body.id
    })

    await test.step('open the edit form and see the existing tag chip', async () => {
      await page.goto(`/recipes/${id}/edit`)
      await expect(page.getByText('dinner', { exact: true })).toBeVisible()
    })

    await test.step('add a second tag', async () => {
      const tags = page.getByRole('combobox', { name: /^Tags$/i })
      await tags.pressSequentially('quick', { delay: 25 })
      await tags.press('Enter')
    })

    await test.step('update and assert both tags are persisted', async () => {
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
    })

    expect(pageError).toBeUndefined()
  })
})

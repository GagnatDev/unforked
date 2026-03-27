import { expect, test } from '@playwright/test'

test('creates a recipe through the frontend form and persists via real backend', async ({ page }) => {
  let pageError: Error | undefined
  page.on('pageerror', (e) => {
    pageError = e
  })

  const recipeName = `Playwright Recipe ${Date.now()}`
  await page.goto('/recipes/new')
  await page.locator('form input').first().fill(recipeName)

  const createResponsePromise = page.waitForResponse((response) => {
    return response.request().method() === 'POST' && response.url().endsWith('/api/recipes')
  })
  await page.locator('form button[type="submit"]').click()

  const createResponse = await createResponsePromise
  expect(createResponse.ok()).toBeTruthy()
  const payload = await createResponse.json()
  expect(payload.id).toBeTruthy()
  expect(payload.doc?.name).toBe(recipeName)

  await expect(page).toHaveURL(new RegExp(`/recipes/${payload.id}/edit$`))
  await expect(page.locator('form')).toBeVisible()
  expect(pageError).toBeUndefined()
})

test('accepts multiple comma-separated tags typed keystroke by keystroke', async ({ page }) => {
  const recipeName = `Tagged Recipe ${Date.now()}`
  await page.goto('/recipes/new')
  await page.locator('form input').first().fill(recipeName)

  const tags = page.getByRole('textbox', { name: /Tags/i })
  await tags.pressSequentially('dinner', { delay: 15 })
  await tags.pressSequentially(', ', { delay: 15 })
  await tags.pressSequentially('quick', { delay: 15 })

  const createResponsePromise = page.waitForResponse((response) => {
    return response.request().method() === 'POST' && response.url().endsWith('/api/recipes')
  })
  await page.locator('form button[type="submit"]').click()

  const createResponse = await createResponsePromise
  expect(createResponse.ok()).toBeTruthy()
  const payload = await createResponse.json()
  const savedTags = [...(payload.doc?.tags ?? [])]
  expect(savedTags).toHaveLength(2)
  expect(savedTags).toEqual(expect.arrayContaining(['dinner', 'quick']))
})

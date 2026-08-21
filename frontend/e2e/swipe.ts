import type { Locator, Page } from '@playwright/test'

/**
 * Drag a list row to the left, far enough that its delete panel stays open on
 * release. Moves in several steps so the row's axis lock sees a horizontal
 * gesture rather than a jump, the same way a real thumb (or mouse) would.
 */
export async function swipeRowOpen(page: Page, row: Locator): Promise<void> {
  const box = await row.boundingBox()
  if (!box) throw new Error('cannot swipe a row that is not visible')

  const y = box.y + box.height / 2
  const startX = box.x + box.width - 8

  await page.mouse.move(startX, y)
  await page.mouse.down()
  for (const travelled of [12, 40, 70, 100]) {
    await page.mouse.move(startX - travelled, y)
  }
  await page.mouse.up()
}

/**
 * Swipe a component horizontally by `dx` px (negative goes left), from the
 * centre of its box. Stepped like {@link swipeRowOpen} so an axis lock reads a
 * horizontal gesture, and used for gestures that commit on release.
 */
export async function swipeHorizontally(
  page: Page,
  target: Locator,
  dx: number,
): Promise<void> {
  const box = await target.boundingBox()
  if (!box) throw new Error('cannot swipe an element that is not visible')

  const startX = box.x + box.width / 2
  const y = box.y + box.height / 2

  await page.mouse.move(startX, y)
  await page.mouse.down()
  for (const fraction of [0.15, 0.5, 0.8, 1]) {
    await page.mouse.move(startX + dx * fraction, y)
  }
  await page.mouse.up()
}

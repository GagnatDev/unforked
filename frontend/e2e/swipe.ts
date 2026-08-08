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

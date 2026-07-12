import type { CategoryGroup } from '@/lib/shoppingCategories'
import type { ShoppingListEntry } from '@/types'

/** Plain-text export, grouped under category headers in store-walk order. */
export function buildShoppingListTxt(
  title: string,
  groups: CategoryGroup[],
  categoryLabel: (group: CategoryGroup) => string,
): string {
  const lines: string[] = [title]
  for (const group of groups) {
    lines.push('', `${categoryLabel(group)}:`)
    for (const item of group.items) {
      lines.push(`- ${item.name} ${item.quantity} ${item.unit}`.trim())
    }
  }
  return lines.join('\n')
}

/** CSV export with the store category as a fourth column. */
export function buildShoppingListCsv(items: ShoppingListEntry[]): string {
  const header = 'name,quantity,unit,category'
  const rows = items.map(
    (i) => `"${i.name}","${i.quantity}","${i.unit}","${i.category}"`,
  )
  return [header, ...rows].join('\n')
}

export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

import { useTranslation } from 'react-i18next'
import { Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ShoppingCategory, ShoppingListEntry } from '@/types'
import { CategoryPicker } from './CategoryPicker'

type ShoppingItemRowProps = {
  item: ShoppingListEntry
  onToggle: () => void
  onChangeCategory: (category: ShoppingCategory) => void
  onDelete: () => void
}

/**
 * One list row, sized for thumbs in the store aisle. The toggle area is a
 * sibling of the category/delete buttons (no nested buttons), and checked
 * items dim in place instead of jumping around mid-shop.
 */
export function ShoppingItemRow({ item, onToggle, onChangeCategory, onDelete }: ShoppingItemRowProps) {
  const { t } = useTranslation()
  const quantityLabel = `${item.quantity} ${item.unit}`.trim()

  return (
    <li
      className={cn(
        'flex min-h-12 items-center gap-1 rounded-lg border border-border bg-card pl-3 pr-1 text-card-foreground',
        item.checked && 'opacity-70'
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex min-h-11 flex-1 items-center gap-3 py-1 text-left"
        aria-pressed={item.checked}
      >
        <input
          type="checkbox"
          checked={item.checked}
          readOnly
          tabIndex={-1}
          className="h-5 w-5 shrink-0"
          aria-label={t('shoppingList.itemCheckboxAria', { name: item.name })}
        />
        <span
          className={cn(
            'flex-1 font-medium',
            item.checked && 'text-muted-foreground line-through'
          )}
        >
          {item.name}
        </span>
        {quantityLabel && (
          <span className="whitespace-nowrap text-sm text-muted-foreground">{quantityLabel}</span>
        )}
      </button>
      <CategoryPicker itemName={item.name} value={item.category} onChange={onChangeCategory} />
      {item.manual && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          aria-label={t('shoppingList.deleteItem', { name: item.name })}
        >
          <Trash2Icon className="size-4 text-destructive" />
        </Button>
      )}
    </li>
  )
}

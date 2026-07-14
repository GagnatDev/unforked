import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PencilIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLongPress } from '@/hooks/useLongPress'
import { cn } from '@/lib/utils'
import type { ShoppingCategory, ShoppingListEntry } from '@/types'
import { CategoryPicker } from './CategoryPicker'
import { EditItemForm } from './EditItemForm'

type ShoppingItemRowProps = {
  item: ShoppingListEntry
  onToggle: () => void
  onChangeCategory: (category: ShoppingCategory) => void
  onEdit: (patch: { name: string; quantity: string; unit: string }) => void
  onDelete: () => void
}

/**
 * One list row, sized for thumbs in the store aisle. The toggle area is a
 * sibling of the category/edit/delete buttons (no nested buttons), and checked
 * items dim in place instead of jumping around mid-shop. Manual items can be
 * edited via the pencil button or by long-pressing the row.
 */
export function ShoppingItemRow({
  item,
  onToggle,
  onChangeCategory,
  onEdit,
  onDelete,
}: ShoppingItemRowProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const quantityLabel = `${item.quantity} ${item.unit}`.trim()

  const longPress = useLongPress(() => setEditing(true), { enabled: item.manual })

  if (item.manual && editing) {
    return (
      <EditItemForm
        item={item}
        onSave={(patch) => {
          onEdit(patch)
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <li
      className={cn(
        'flex min-h-12 items-center gap-1 rounded-lg border border-border bg-card pl-3 pr-1 text-card-foreground',
        item.checked && 'opacity-70'
      )}
    >
      <button
        type="button"
        onClick={() => {
          // A long-press already opened the editor; don't also toggle.
          if (longPress.consumeTriggered()) return
          onToggle()
        }}
        onPointerDown={longPress.onPointerDown}
        onPointerUp={longPress.onPointerUp}
        onPointerLeave={longPress.onPointerLeave}
        onPointerMove={longPress.onPointerMove}
        onPointerCancel={longPress.onPointerCancel}
        onContextMenu={(e) => {
          // Suppress the browser's long-press context menu so our gesture wins.
          if (item.manual) e.preventDefault()
        }}
        className="flex min-h-11 flex-1 items-center gap-3 py-1 text-left [touch-action:manipulation]"
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
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setEditing(true)}
            aria-label={t('shoppingList.editItem', { name: item.name })}
          >
            <PencilIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label={t('shoppingList.deleteItem', { name: item.name })}
          >
            <Trash2Icon className="size-4 text-destructive" />
          </Button>
        </>
      )}
    </li>
  )
}

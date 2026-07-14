import { useId, useRef, useState, type FocusEvent, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ShoppingListEntry } from '@/types'

type EditItemFormProps = {
  item: ShoppingListEntry
  onSave: (patch: { name: string; quantity: string; unit: string }) => void
  onCancel: () => void
}

/**
 * Inline editor for a manual item's name, quantity and unit. Replaces the row
 * in place so nothing shifts around it, stacks name over quantity/unit on
 * narrow screens, and keeps every control keyboard- and screen-reader-reachable.
 * Enter saves, Escape cancels; the name field takes focus on open.
 */
export function EditItemForm({ item, onSave, onCancel }: EditItemFormProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(item.name)
  const [quantity, setQuantity] = useState(item.quantity)
  const [unit, setUnit] = useState(item.unit)
  const selectedOnce = useRef(false)
  const headingId = useId()

  // Select the existing name once on open so a retype replaces it; leave later
  // focuses (tabbing back) alone.
  const selectNameOnFirstFocus = (e: FocusEvent<HTMLInputElement>) => {
    if (selectedOnce.current) return
    selectedOnce.current = true
    e.currentTarget.select()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return
    onSave({ name: trimmedName, quantity: quantity.trim(), unit: unit.trim() })
  }

  return (
    <li className="rounded-lg border border-border bg-card p-3 text-card-foreground">
      <form
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
        }}
        aria-labelledby={headingId}
        className="flex flex-col gap-3"
      >
        <span id={headingId} className="sr-only">
          {t('shoppingList.editItemHeading', { name: item.name })}
        </span>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
            {t('shoppingList.editName')}
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={selectNameOnFirstFocus}
              className="h-11"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium sm:w-24">
            {t('shoppingList.editQuantity')}
            <Input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputMode="decimal"
              className="h-11"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium sm:w-24">
            {t('shoppingList.editUnit')}
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="h-11"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="lg" className="h-11" onClick={onCancel}>
            <XIcon data-icon="inline-start" />
            {t('shoppingList.editCancel')}
          </Button>
          <Button type="submit" size="lg" className="h-11" disabled={!name.trim()}>
            <CheckIcon data-icon="inline-start" />
            {t('shoppingList.editSave')}
          </Button>
        </div>
      </form>
    </li>
  )
}

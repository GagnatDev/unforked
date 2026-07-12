import { useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { GripVerticalIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Ingredient } from '@/types'

/** Pointer must travel this far before a press on the handle becomes a drag. */
const DRAG_THRESHOLD_PX = 8
/** Distance from the viewport edge where dragging auto-scrolls the page. */
const EDGE_SCROLL_ZONE_PX = 56

function indexFromPoint(x: number, y: number): number | null {
  const host = document.elementFromPoint(x, y)?.closest('[data-ingredient-row]')
  const raw = host?.getAttribute('data-ingredient-row')
  if (raw == null) return null
  const index = Number(raw)
  return Number.isInteger(index) && index >= 0 ? index : null
}

type Props = {
  ingredients: Ingredient[]
  onAdd: () => void
  onUpdate: (index: number, patch: Partial<Ingredient>) => void
  onRemove: (index: number) => void
  onMove: (from: number, to: number) => void
}

export function IngredientListEditor({
  ingredients,
  onAdd,
  onUpdate,
  onRemove,
  onMove,
}: Props) {
  const { t } = useTranslation()
  // Armed via tap: the first ingredient of a tap-tap move, waiting for its target.
  const [armedIndex, setArmedIndex] = useState<number | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const didDrag = useRef(false)
  const handleRefs = useRef<(HTMLElement | null)[]>([])

  const move = (from: number, to: number) => {
    if (from === to) return
    onMove(from, to)
    // Rows are keyed by index, so keep focus on the moved ingredient's handle.
    requestAnimationFrame(() => handleRefs.current[to]?.focus())
  }

  const handleProps = (index: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      pointerStart.current = { x: e.clientX, y: e.clientY }
      didDrag.current = false
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => {
      const start = pointerStart.current
      if (!start) return
      if (!didDrag.current) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD_PX) {
          return
        }
        didDrag.current = true
        setDragIndex(index)
        setArmedIndex(null)
      }
      const target = indexFromPoint(e.clientX, e.clientY)
      setDropIndex(target !== index ? target : null)
      if (e.clientY > window.innerHeight - EDGE_SCROLL_ZONE_PX) {
        window.scrollBy(0, 10)
      } else if (e.clientY < EDGE_SCROLL_ZONE_PX) {
        window.scrollBy(0, -10)
      }
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      pointerStart.current = null
      if (didDrag.current) {
        const target = indexFromPoint(e.clientX, e.clientY)
        if (target != null && target !== index) move(index, target)
      }
      setDragIndex(null)
      setDropIndex(null)
    },
    onPointerCancel: () => {
      pointerStart.current = null
      didDrag.current = false
      setDragIndex(null)
      setDropIndex(null)
    },
    onClick: () => {
      if (didDrag.current) {
        didDrag.current = false
        return
      }
      if (armedIndex == null) {
        setArmedIndex(index)
      } else {
        if (armedIndex !== index) move(armedIndex, index)
        setArmedIndex(null)
      }
    },
    onKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Escape') setArmedIndex(null)
      if (e.key === 'ArrowUp' && index > 0) {
        e.preventDefault()
        move(index, index - 1)
      }
      if (e.key === 'ArrowDown' && index < ingredients.length - 1) {
        e.preventDefault()
        move(index, index + 1)
      }
    },
  })

  return (
    <>
      <h3>{t('recipeForm.ingredients')}</h3>
      {ingredients.length >= 2 && (
        <p className="mb-2 min-h-4 text-xs text-muted-foreground" aria-live="polite">
          {armedIndex != null
            ? t('recipeForm.reorderArmedHint', { position: armedIndex + 1 })
            : t('recipeForm.reorderHint')}
        </p>
      )}
      {ingredients.map((ing, i) => {
        const isTarget = armedIndex != null && armedIndex !== i
        return (
          <div
            key={i}
            data-ingredient-row={i}
            className={cn(
              'mb-2 flex items-center gap-1.5 rounded-lg transition-colors sm:gap-2',
              (armedIndex === i || dragIndex === i) && 'bg-accent/50',
              dropIndex === i && 'bg-accent'
            )}
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              ref={(el) => {
                handleRefs.current[i] = el
              }}
              aria-pressed={armedIndex === i}
              aria-label={
                isTarget
                  ? t('recipeForm.reorderTargetAria', { position: i + 1 })
                  : t('recipeForm.reorderIngredientAria', { position: i + 1 })
              }
              className={cn(
                'shrink-0 touch-none text-muted-foreground',
                (armedIndex === i || dragIndex === i) && 'bg-accent text-accent-foreground',
                isTarget && 'text-foreground'
              )}
              {...handleProps(i)}
            >
              <GripVerticalIcon />
            </Button>
            <Input
              placeholder={t('recipeForm.placeholderName')}
              aria-label={t('recipeForm.ingredientNameAria')}
              autoCapitalize="none"
              value={ing.name}
              onChange={(e) => onUpdate(i, { name: e.target.value })}
              className="min-w-0 flex-1"
            />
            <Input
              placeholder={t('recipeForm.placeholderQty')}
              aria-label={t('recipeForm.ingredientQtyAria')}
              autoCapitalize="none"
              value={ing.quantity}
              onChange={(e) => onUpdate(i, { quantity: e.target.value })}
              className="w-14 shrink-0 sm:w-20"
            />
            <Input
              placeholder={t('recipeForm.placeholderUnit')}
              aria-label={t('recipeForm.ingredientUnitAria')}
              autoCapitalize="none"
              value={ing.unit}
              onChange={(e) => onUpdate(i, { unit: e.target.value })}
              className="w-14 shrink-0 sm:w-20"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('recipeForm.removeIngredientAria', { position: i + 1 })}
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => {
                setArmedIndex(null)
                onRemove(i)
              }}
            >
              <XIcon />
            </Button>
          </div>
        )
      })}
      <Button type="button" variant="secondary" size="sm" onClick={onAdd}>
        {t('recipeForm.addIngredient')}
      </Button>
    </>
  )
}

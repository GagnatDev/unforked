import { useCallback, useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'

import { formatWeekId, formatWeekRange } from '@/lib/format'
import { cn, getCurrentWeekId, getNextWeekId } from '@/lib/utils'
import { mondayOfWeekId, parseWeekId, shiftWeekId } from '@/lib/week-id'

/** Pointer travel before a drag counts as a swipe rather than a page scroll. */
const AXIS_LOCK_PX = 8
/** How far the strip must be dragged for a release to switch weeks. */
const SWIPE_COMMIT_PX = 48
/** Cap on how far the strip follows the finger, so the drag reads as elastic. */
const DRAG_MAX_PX = 24
/** The strip always shows the week before, the selected week and the one after. */
const OFFSETS = [-1, 0, 1] as const

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

export type WeekPickerProps = {
  value: string
  onChange: (weekId: string) => void
  locale: string
  id?: string
  disabled?: boolean
}

/**
 * Week switcher: a single line with the previous, selected and next week —
 * the selected one raised in the middle. A week is a step away, not a trip
 * through a month calendar, which is all these pages ever need.
 *
 * Three ways to move, all equivalent: tap a neighbouring week, swipe the strip
 * left/right (touch-first, but works with a mouse drag too), or press the
 * arrow keys while the strip has focus. Vertical drags are left to the browser
 * (`touch-action: pan-y` plus an axis lock) so scrolling the page never
 * switches weeks by accident.
 */
export function WeekPicker({ value, onChange, locale, id, disabled }: WeekPickerProps) {
  const { t } = useTranslation()
  const [drag, setDrag] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; y: number } | null>(null)
  const axis = useRef<'undecided' | 'horizontal'>('undecided')
  /** Last horizontal travel, so a release (or cancel) can commit without it. */
  const lastDx = useRef(0)
  // A swipe ends with a click on whichever tile was under the finger; that
  // click must not switch the week a second time.
  const swallowClick = useRef(false)

  const currentWeek = getCurrentWeekId()
  const nextWeek = getNextWeekId()
  // A stale or malformed week (e.g. a hand-edited ?week=) shows this week
  // rather than an empty strip, and stepping from there stays sensible.
  const selected = mondayOfWeekId(value) ? value : currentWeek

  const shift = useCallback(
    (weeks: number) => {
      if (disabled || weeks === 0) return
      const next = shiftWeekId(selected, weeks)
      if (next && next !== value) onChange(next)
    },
    [disabled, onChange, selected, value],
  )

  const onPointerDown = (event: ReactPointerEvent) => {
    swallowClick.current = false
    if (disabled) return
    // Ignore right/middle clicks and any secondary pointer mid-gesture.
    if (event.button != null && event.button !== 0) return
    start.current = { x: event.clientX, y: event.clientY }
    axis.current = 'undecided'
    lastDx.current = 0
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const from = start.current
    if (from == null) return
    const dx = event.clientX - from.x
    const dy = event.clientY - from.y

    if (axis.current === 'undecided') {
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return
      // A mostly-vertical drag is the browser's to scroll with; let it go.
      if (Math.abs(dy) >= Math.abs(dx)) {
        start.current = null
        return
      }
      axis.current = 'horizontal'
      setDragging(true)
      try {
        ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
      } catch {
        // Pointer capture is a nicety; the gesture works without it.
      }
    }

    lastDx.current = dx
    // Follows the finger at a fraction of its travel and gives up well before
    // a tile's width: the strip acknowledges the gesture, it doesn't pretend
    // to scroll — the weeks change on release, not under the finger.
    setDrag(clamp(dx * 0.35, -DRAG_MAX_PX, DRAG_MAX_PX))
  }

  const endDrag = (event: ReactPointerEvent) => {
    const wasHorizontal = axis.current === 'horizontal'
    const dx = lastDx.current
    start.current = null
    axis.current = 'undecided'
    lastDx.current = 0
    if (!wasHorizontal) return

    try {
      ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
    } catch {
      // Already released (or never captured) — nothing to undo.
    }
    setDragging(false)
    setDrag(0)
    swallowClick.current = true
    // Swiping left pulls the next week in from the right, and vice versa.
    if (dx <= -SWIPE_COMMIT_PX) shift(1)
    else if (dx >= SWIPE_COMMIT_PX) shift(-1)
  }

  const onClickCapture = (event: ReactMouseEvent) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    shift(event.key === 'ArrowLeft' ? -1 : 1)
  }

  const weeks = OFFSETS.map((offset) => {
    const weekId = shiftWeekId(selected, offset) ?? selected
    const week = parseWeekId(weekId)?.week
    const name =
      weekId === currentWeek
        ? t('weekPicker.thisWeek')
        : weekId === nextWeek
          ? t('weekPicker.nextWeek')
          : t('weekPicker.weekNumber', { week })
    return { offset, weekId, name, range: formatWeekRange(weekId, locale) }
  })

  const selectedWeek = weeks[1]

  return (
    <div id={id} className="max-w-md">
      <div
        role="group"
        aria-label={t('common.selectWeek')}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        className={cn('touch-pan-y select-none', disabled && 'opacity-60')}
      >
        <div
          style={{ transform: `translate3d(${drag}px, 0, 0)` }}
          className={cn(
            'flex items-center gap-1 rounded-2xl border border-border bg-muted/40 p-1',
            !dragging && 'transition-transform duration-200 ease-out',
          )}
        >
          {weeks.map(({ offset, weekId, name, range }) => {
            const isSelected = offset === 0
            return (
              <button
                key={offset}
                type="button"
                disabled={disabled}
                aria-current={isSelected ? 'true' : undefined}
                aria-label={
                  isSelected
                    ? `${formatWeekId(weekId, locale)}, ${range}`
                    : `${offset < 0 ? t('weekPicker.previousWeek') : t('weekPicker.nextWeek')}: ${formatWeekId(weekId, locale)}, ${range}`
                }
                onClick={() => shift(offset)}
                className={cn(
                  'flex min-w-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl px-1.5',
                  'outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50',
                  // The selected week is taller than the strip and reaches past
                  // its padding — raised out of the line rather than widened
                  // into its neighbours, which keeps every label readable.
                  isSelected
                    ? 'z-10 -my-1 flex-[1.3] bg-primary py-3.5 text-primary-foreground shadow-lg'
                    : 'flex-1 py-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    // Full width so a long label ellipsises inside its own
                    // tile instead of spilling over the ones beside it.
                    'w-full truncate text-center text-[0.625rem] uppercase tracking-wide',
                    isSelected ? 'text-[0.6875rem] opacity-80' : 'opacity-70',
                  )}
                >
                  {name}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    // A week that straddles two months is a long label; let it
                    // wrap inside its tile (the strip grows a line) rather than
                    // cut the second month off.
                    'w-full text-center leading-tight',
                    isSelected ? 'text-sm font-semibold' : 'text-[0.6875rem] font-medium',
                  )}
                >
                  {range}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {/* Swiping moves the selection without moving focus, so the new week is
          announced here instead of by the button that was pressed. */}
      <p role="status" className="sr-only">
        {`${selectedWeek.name}, ${selectedWeek.range}`}
      </p>
    </div>
  )
}

import { useRef, useState } from 'react'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import { GripVerticalIcon } from 'lucide-react'
import type { DayAssignment, Recipe } from '@/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DAYS, type DayKey } from './constants'
import { MealPlanDayPeopleSelect } from './MealPlanDayPeopleSelect'
import { MealPlanRecipeSelect } from './MealPlanRecipeSelect'

/** Pointer must travel this far before a press on the handle becomes a drag. */
const DRAG_THRESHOLD_PX = 8
/** Distance from the viewport edge where dragging auto-scrolls the page. */
const EDGE_SCROLL_ZONE_PX = 56

function dayFromPoint(x: number, y: number): DayKey | null {
  const host = document.elementFromPoint(x, y)?.closest('[data-swap-day]')
  const day = host?.getAttribute('data-swap-day')
  return day != null && (DAYS as readonly string[]).includes(day)
    ? (day as DayKey)
    : null
}

export function MealPlanWeekAssignments({
  byDay,
  recipes,
  defaultPersons,
  setAssignment,
  setDayPeople,
  onSwapDays,
}: {
  byDay: Record<string, DayAssignment | undefined>
  recipes: Recipe[]
  defaultPersons: number | null
  setAssignment: (day: string, recipeId: string | null, recipeName: string) => void
  setDayPeople: (day: string, persons: number | null) => void
  onSwapDays: (dayA: string, dayB: string) => void
}) {
  const { t } = useTranslation()
  // Armed via tap: the first day of a tap-tap swap, waiting for its partner.
  const [armedDay, setArmedDay] = useState<DayKey | null>(null)
  const [dragDay, setDragDay] = useState<DayKey | null>(null)
  const [dropDay, setDropDay] = useState<DayKey | null>(null)
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const didDrag = useRef(false)

  const assignedCount = DAYS.filter((d) => byDay[d]?.recipeId).length

  const handleProps = (day: DayKey) => ({
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
        setDragDay(day)
        setArmedDay(null)
      }
      const target = dayFromPoint(e.clientX, e.clientY)
      setDropDay(target !== day ? target : null)
      if (e.clientY > window.innerHeight - EDGE_SCROLL_ZONE_PX) {
        window.scrollBy(0, 10)
      } else if (e.clientY < EDGE_SCROLL_ZONE_PX) {
        window.scrollBy(0, -10)
      }
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      pointerStart.current = null
      if (didDrag.current) {
        const target = dayFromPoint(e.clientX, e.clientY)
        if (target && target !== day) onSwapDays(day, target)
      }
      setDragDay(null)
      setDropDay(null)
    },
    onPointerCancel: () => {
      pointerStart.current = null
      didDrag.current = false
      setDragDay(null)
      setDropDay(null)
    },
    onClick: () => {
      if (didDrag.current) {
        didDrag.current = false
        return
      }
      if (armedDay == null) {
        setArmedDay(day)
      } else {
        if (armedDay !== day) onSwapDays(armedDay, day)
        setArmedDay(null)
      }
    },
    onKeyDown: (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Escape') setArmedDay(null)
    },
  })

  const swapHandle = (day: DayKey) => {
    const dayLabel = t(`mealPlan.days.${day}`)
    const isTarget = armedDay != null && armedDay !== day
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={!byDay[day]?.recipeId && armedDay == null}
        aria-pressed={armedDay === day}
        aria-label={
          isTarget
            ? t('mealPlan.swapTargetAria', { day: dayLabel })
            : t('mealPlan.swapAria', { day: dayLabel })
        }
        className={cn(
          'shrink-0 touch-none text-muted-foreground',
          (armedDay === day || dragDay === day) && 'bg-accent text-accent-foreground',
          isTarget && 'text-foreground'
        )}
        {...handleProps(day)}
      >
        <GripVerticalIcon />
      </Button>
    )
  }

  const rowHighlight = (day: DayKey) =>
    cn(
      'transition-colors',
      (armedDay === day || dragDay === day) && 'bg-accent/50',
      dropDay === day && 'bg-accent'
    )

  return (
    <>
      <p className="mb-2 min-h-4 text-xs text-muted-foreground" aria-live="polite">
        {armedDay != null
          ? t('mealPlan.swapArmedHint', { day: t(`mealPlan.days.${armedDay}`) })
          : assignedCount >= 1
            ? t('mealPlan.swapHint')
            : ''}
      </p>
      <div className="overflow-hidden rounded-2xl bg-card text-card-foreground">
        <div className="divide-y divide-border/60 md:hidden">
          {DAYS.map((day) => (
            <div key={day} data-swap-day={day} className={cn('p-4', rowHighlight(day))}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">
                  {t(`mealPlan.days.${day}`)}
                </span>
                {swapHandle(day)}
              </div>
              <div className="mt-2">
                <MealPlanRecipeSelect
                  day={day}
                  byDay={byDay}
                  recipes={recipes}
                  setAssignment={setAssignment}
                  className="h-11 w-full rounded-xl"
                  idSuffix="mobile"
                />
              </div>
              {byDay[day]?.recipeId && (
                <div className="mt-3 flex items-center justify-between gap-3">
                  {/* A plain span, not a <label>: the dropdown trigger is a
                      button, which `for=` cannot label — it carries its own
                      per-day aria-label instead. */}
                  <span className="text-sm text-muted-foreground">
                    {t('mealPlan.dayPeople')}
                  </span>
                  <MealPlanDayPeopleSelect
                    id={`meal-plan-people-mobile-${day}`}
                    day={day}
                    byDay={byDay}
                    defaultPersons={defaultPersons}
                    setDayPeople={setDayPeople}
                    className="h-11 w-32 shrink-0 rounded-xl"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <table className="hidden w-full table-fixed border-collapse text-foreground md:table">
          <thead>
            <tr className="border-b border-border/60">
              <th className="w-44 px-4 pt-4 pb-2 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {t('mealPlan.day')}
              </th>
              <th className="px-4 pt-4 pb-2 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {t('mealPlan.recipe')}
              </th>
              <th className="w-40 px-4 pt-4 pb-2 text-left text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {t('mealPlan.people')}
              </th>
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day) => (
              <tr
                key={day}
                data-swap-day={day}
                className={cn('not-last:border-b not-last:border-border/60', rowHighlight(day))}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-medium">{t(`mealPlan.days.${day}`)}</span>
                    {swapHandle(day)}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <MealPlanRecipeSelect
                    day={day}
                    byDay={byDay}
                    recipes={recipes}
                    setAssignment={setAssignment}
                    className="h-10 w-full rounded-xl"
                    idSuffix="desktop"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <MealPlanDayPeopleSelect
                    day={day}
                    byDay={byDay}
                    defaultPersons={defaultPersons}
                    setDayPeople={setDayPeople}
                    className="h-10 w-full min-w-0 rounded-xl"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

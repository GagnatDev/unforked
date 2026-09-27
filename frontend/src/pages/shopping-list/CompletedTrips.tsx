import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckIcon, ChevronDownIcon, PencilIcon, ReceiptTextIcon, Undo2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLocale } from '@/hooks/useLocale'
import { formatIsoDayDateTime, formatKroner } from '@/lib/format'
import { kronerInputValue, parseKroner } from '@/lib/kroner'
import type { ShoppingTrip } from '@/types'

type CompletedTripsProps = {
  trips: ShoppingTrip[]
  onUndo: (tripId: string) => void
  /** Record (or clear, with null) what a trip cost, in kroner. */
  onSetCost: (tripId: string, totalCost: number | null) => void
}

/** Sum of the amounts that were recorded; null when no trip has one. */
export function totalSpent(trips: readonly ShoppingTrip[]): number | null {
  const known = trips.filter((trip) => trip.totalCost !== undefined)
  if (known.length === 0) return null
  return known.reduce((sum, trip) => sum + (trip.totalCost ?? 0), 0)
}

/**
 * The week's shopping history: one row per completed trip, newest first,
 * each unfolding to what went into the cart. It sits below the open list as
 * a record, not a task — nothing here is green except the ticks, which mark
 * things already done. Each trip carries the day it happened and what it
 * came to; the receipt total can be added or corrected here whenever it turns
 * up. The other action is undoing a "Shopping done" pressed too early, which
 * puts that trip's items back on the list, still checked.
 */
export function CompletedTrips({ trips, onUndo, onSetCost }: CompletedTripsProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  if (trips.length === 0) return null

  // Number trips in the order they happened; show the latest at the top.
  const numbered = trips.map((trip, index) => ({ trip, n: index + 1 })).reverse()
  const itemCount = trips.reduce((sum, trip) => sum + trip.items.length, 0)
  const spent = totalSpent(trips)

  return (
    <section
      className="rounded-2xl bg-card p-1.5 text-card-foreground"
      aria-label={t('shoppingList.trips.title')}
    >
      <div className="flex items-baseline justify-between gap-3 px-3 pt-2.5 pb-1.5">
        <h2 className="text-base font-semibold">{t('shoppingList.trips.title')}</h2>
        <span className="text-sm tabular-nums text-muted-foreground">
          {[t('shoppingList.trips.itemCount', { count: itemCount }), spent !== null ? formatKroner(spent, locale) : null]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <ul className="m-0 list-none p-0">
        {numbered.map(({ trip, n }) => (
          <li key={trip.id}>
            <details className="group rounded-xl open:bg-muted">
              <summary
                className="flex min-h-13 cursor-pointer list-none items-center gap-3 rounded-xl px-3 py-2 [&::-webkit-details-marker]:hidden"
                aria-label={t('shoppingList.trips.toggleAria', { n })}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CheckIcon className="size-4" strokeWidth={2.5} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{t('shoppingList.trips.trip', { n })}</span>
                  {/* The day sits directly under the heading, ahead of who
                      shopped: a record is read back later, when "14:32" alone
                      would say nothing. */}
                  <span className="block truncate text-sm text-muted-foreground">
                    <time dateTime={trip.completedAt}>
                      {formatIsoDayDateTime(trip.completedAt, locale)}
                    </time>
                    {' · '}
                    {trip.completedByEmail}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end text-sm tabular-nums text-muted-foreground">
                  {trip.totalCost !== undefined && (
                    <span className="font-semibold text-foreground">
                      {formatKroner(trip.totalCost, locale)}
                    </span>
                  )}
                  <span>{t('shoppingList.trips.itemCount', { count: trip.items.length })}</span>
                </span>
                <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-open:rotate-180" />
              </summary>
              <div className="px-3 pb-3">
                <ul className="m-0 list-none p-0">
                  {trip.items.map((item) => {
                    const quantityLabel = `${item.quantity} ${item.unit}`.trim()
                    return (
                      <li
                        key={item.id}
                        className="flex min-h-9 items-center gap-3 text-sm text-muted-foreground"
                      >
                        <CheckIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                        <span className="flex-1 line-through decoration-1">{item.name}</span>
                        {quantityLabel && (
                          <span className="whitespace-nowrap tabular-nums">{quantityLabel}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
                <TripCost trip={trip} n={n} onSetCost={onSetCost} />
                <Button
                  variant="ghost"
                  onClick={() => onUndo(trip.id)}
                  aria-label={t('shoppingList.trips.undoAria', { n })}
                  className="mt-2 h-10 rounded-full px-4"
                >
                  <Undo2Icon className="size-4" />
                  {t('shoppingList.trips.undo')}
                </Button>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  )
}

type TripCostProps = {
  trip: ShoppingTrip
  n: number
  onSetCost: (tripId: string, totalCost: number | null) => void
}

/**
 * What the trip cost, as one quiet line under its items — with a way to add
 * the amount when it was skipped, or to correct it against the receipt.
 */
function TripCost({ trip, n, onSetCost }: TripCostProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState('')
  const [invalid, setInvalid] = useState(false)
  const fieldId = useId()

  const startEditing = () => {
    setAmount(kronerInputValue(trip.totalCost))
    setInvalid(false)
    setEditing(true)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = amount.trim()
    if (trimmed === '') {
      // Emptying the field takes a recorded amount back off the trip.
      if (trip.totalCost !== undefined) onSetCost(trip.id, null)
      setEditing(false)
      return
    }
    const parsed = parseKroner(trimmed)
    if (parsed === null) {
      setInvalid(true)
      return
    }
    if (parsed !== trip.totalCost) onSetCost(trip.id, parsed)
    setEditing(false)
  }

  if (editing) {
    return (
      <form
        onSubmit={submit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setEditing(false)
        }}
        className="mt-3 flex flex-col gap-2 border-t border-foreground/10 pt-3"
      >
        <label htmlFor={fieldId} className="text-sm font-medium">
          {t('shoppingList.trips.costLabel')}
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id={fieldId}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setInvalid(false)
              }}
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              placeholder="0"
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? `${fieldId}-error` : undefined}
              className="h-11 rounded-xl bg-card pr-10 tabular-nums"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
            >
              kr
            </span>
          </div>
          <Button type="submit" className="h-11 rounded-full px-4">
            {t('shoppingList.trips.costSave')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setEditing(false)}
            className="h-11 rounded-full px-4"
          >
            {t('shoppingList.editCancel')}
          </Button>
        </div>
        {invalid && (
          <p id={`${fieldId}-error`} role="alert" className="text-sm text-destructive">
            {t('shoppingList.completeDialog.amountInvalid')}
          </p>
        )}
      </form>
    )
  }

  return (
    <div className="mt-3 flex min-h-10 items-center gap-3 border-t border-foreground/10 pt-3 text-sm">
      <ReceiptTextIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="flex-1 text-muted-foreground">
        {trip.totalCost !== undefined ? (
          <>
            {t('shoppingList.trips.costLabel')}{' '}
            <span className="font-semibold tabular-nums text-foreground">
              {formatKroner(trip.totalCost, locale)}
            </span>
          </>
        ) : (
          t('shoppingList.trips.costMissing')
        )}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={startEditing}
        aria-label={t(
          trip.totalCost !== undefined ? 'shoppingList.trips.costEditAria' : 'shoppingList.trips.costAddAria',
          { n },
        )}
        className="h-9 rounded-full px-3"
      >
        <PencilIcon className="size-3.5" />
        {t(trip.totalCost !== undefined ? 'shoppingList.trips.costEdit' : 'shoppingList.trips.costAdd')}
      </Button>
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import { CheckIcon, ChevronDownIcon, Undo2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocale } from '@/hooks/useLocale'
import { formatIsoTimeOrDateTime } from '@/lib/format'
import type { ShoppingTrip } from '@/types'

type CompletedTripsProps = {
  trips: ShoppingTrip[]
  onUndo: (tripId: string) => void
}

/**
 * The week's shopping history: one row per completed trip, newest first,
 * each unfolding to what went into the cart. It sits below the open list as
 * a record, not a task — nothing here is green except the ticks, which mark
 * things already done. The one action is undoing a "Shopping done" pressed
 * too early, which puts that trip's items back on the list, still checked.
 */
export function CompletedTrips({ trips, onUndo }: CompletedTripsProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  if (trips.length === 0) return null

  // Number trips in the order they happened; show the latest at the top.
  const numbered = trips.map((trip, index) => ({ trip, n: index + 1 })).reverse()

  return (
    <section
      className="rounded-2xl bg-card p-1.5 text-card-foreground"
      aria-label={t('shoppingList.trips.title')}
    >
      <div className="flex items-baseline justify-between gap-3 px-3 pt-2.5 pb-1.5">
        <h2 className="text-base font-semibold">{t('shoppingList.trips.title')}</h2>
        <span className="text-sm tabular-nums text-muted-foreground">
          {t('shoppingList.trips.itemCount', {
            count: trips.reduce((sum, trip) => sum + trip.items.length, 0),
          })}
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
                  <span className="block truncate text-sm text-muted-foreground">
                    {t('shoppingList.trips.summary', {
                      email: trip.completedByEmail,
                      time: formatIsoTimeOrDateTime(trip.completedAt, locale),
                    })}
                  </span>
                </span>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                  {t('shoppingList.trips.itemCount', { count: trip.items.length })}
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

import { useTranslation } from 'react-i18next'
import { ChevronDownIcon, ShoppingCartIcon, UtensilsIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useLocale } from '@/hooks/useLocale'
import { formatIsoDayDateTime, formatKroner } from '@/lib/format'
import type { Period } from './aggregate'

type PeriodRowProps = {
  period: Period
  /** Heading — "Week 39" or "September 2026". */
  title: string
  /** Second line — the days the period covers; omitted for months. */
  subtitle?: string
}

/**
 * One week or month of the record, folded: what it came to and how many
 * trips and dinners, unfolding to each trip (with its list week to jump
 * to) and each planned dinner. Empty periods stay quiet but present.
 */
export function PeriodRow({ period, title, subtitle }: PeriodRowProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const empty = period.trips.length === 0 && period.meals.length === 0

  const counts = [
    period.trips.length > 0 ? t('insights.tripCount', { count: period.trips.length }) : null,
    period.meals.length > 0 ? t('insights.mealCount', { count: period.meals.length }) : null,
  ].filter(Boolean)

  return (
    <li>
      <details className="group rounded-xl open:bg-muted">
        <summary
          className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-xl px-3 py-2.5 [&::-webkit-details-marker]:hidden"
          aria-label={t('insights.toggleAria', { period: title })}
        >
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{title}</span>
            <span className="block text-sm text-muted-foreground">
              {[subtitle, empty ? t('insights.nothingRecorded') : counts.join(' · ')]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end text-sm tabular-nums">
            {/* "0 kr" would misread as "spent nothing" when the truth is
                "amount not recorded", so the total only shows once known. */}
            {(period.spent > 0 || (period.trips.length > 0 && period.unpricedTrips === 0)) && (
              <span className="font-semibold text-foreground">
                {formatKroner(period.spent, locale)}
              </span>
            )}
            {period.unpricedTrips > 0 && (
              <span className="text-muted-foreground">
                {t('insights.unpricedShort', { count: period.unpricedTrips })}
              </span>
            )}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-open:rotate-180" />
        </summary>

        {!empty && (
          <div className="grid gap-4 px-3 pb-3 sm:grid-cols-2">
            {period.trips.length > 0 && (
              <section aria-label={t('insights.trips')}>
                <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                  <ShoppingCartIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                  {t('insights.trips')}
                </h3>
                <ul className="m-0 list-none p-0">
                  {period.trips.map((trip) => (
                    <li key={trip.id} className="flex min-h-10 items-center gap-3 text-sm">
                      <span className="min-w-0 flex-1">
                        <Link
                          to={`/shopping-list?week=${encodeURIComponent(trip.weekId)}`}
                          className="block truncate text-foreground"
                        >
                          <time dateTime={trip.completedAt}>
                            {formatIsoDayDateTime(trip.completedAt, locale)}
                          </time>
                        </Link>
                        <span className="block truncate text-muted-foreground">
                          {trip.completedByEmail} ·{' '}
                          {t('shoppingList.trips.itemCount', { count: trip.itemCount })}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {trip.totalCost !== undefined ? (
                          <span className="font-medium">{formatKroner(trip.totalCost, locale)}</span>
                        ) : (
                          <span className="text-muted-foreground">{t('insights.noAmount')}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {period.meals.length > 0 && (
              <section aria-label={t('insights.meals')}>
                <h3 className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                  <UtensilsIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                  {t('insights.meals')}
                </h3>
                <ul className="m-0 list-none p-0">
                  {period.meals.map((meal) => (
                    <li
                      key={`${meal.weekId}-${meal.day}-${meal.recipeId}`}
                      className="flex min-h-9 items-center gap-3 text-sm"
                    >
                      <time
                        dateTime={meal.date.toISOString().slice(0, 10)}
                        className="w-16 shrink-0 tabular-nums text-muted-foreground"
                      >
                        {new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' }).format(
                          meal.date,
                        )}
                      </time>
                      <span className="min-w-0 flex-1 truncate">{meal.recipeName}</span>
                      {meal.persons != null && (
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {t('insights.persons', { count: meal.persons })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </details>
    </li>
  )
}

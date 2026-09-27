import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { api } from '@/api'
import { SettingsUnavailable } from '@/components/SettingsUnavailable'
import { useAsync } from '@/hooks/useAsync'
import { useLocale } from '@/hooks/useLocale'
import { usePersistedFlag } from '@/hooks/usePersistedFlag'
import { formatKroner, formatMonth, formatWeekRange } from '@/lib/format'
import { COULD_NOT_REACH_SERVER_I18N_KEY } from '@/lib/loadErrors'
import { parseWeekId } from '@/lib/week-id'
import { cn } from '@/lib/utils'
import {
  buildPeriods,
  fetchRange,
  hasAnyRecord,
  PERIOD_COUNT,
  summarize,
  type Granularity,
  type Period,
} from './insights/aggregate'
import { PeriodRow } from './insights/PeriodRow'
import { SpendChart } from './insights/SpendChart'

const MONTHS_KEY = 'insights.months'

/**
 * The family's record over time: what the shopping came to, how many trips
 * it took and how many dinners were planned — by week or by month, twelve
 * at a time. Read straight from the server (it spans far more weeks than the
 * local store keeps), so like the other server-owned pages it needs a live
 * session and says so plainly when it cannot get one.
 */
export default function Insights() {
  const { t } = useTranslation()
  const locale = useLocale()
  const [months, setMonths] = usePersistedFlag(MONTHS_KEY)
  const granularity: Granularity = months ? 'month' : 'week'
  const [reloadKey, setReloadKey] = useState(0)
  // One window of "now" per mount so the range and the grouping agree.
  const [now] = useState(() => new Date())
  const range = useMemo(() => fetchRange(now), [now])
  const { data, loading, error, errorStatus } = useAsync(
    (signal) => api.insights.get(range, signal),
    [range, reloadKey],
    { keepPreviousData: true },
  )

  const periods = useMemo(
    () => (data ? buildPeriods(data.weeks, granularity, now) : []),
    [data, granularity, now],
  )
  const summary = useMemo(() => summarize(periods), [periods])

  if ((loading && !data) || (error && !data)) {
    return (
      <SettingsUnavailable
        titleKey="insights.title"
        busy={loading}
        reason={
          error === COULD_NOT_REACH_SERVER_I18N_KEY
            ? 'connection'
            : errorStatus === 403
              ? 'permission'
              : 'server'
        }
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    )
  }

  const titleFor = (period: Period) =>
    granularity === 'week'
      ? t('insights.weekTitle', { week: parseWeekId(period.key)?.week ?? period.key })
      : formatMonth(period.start, locale)
  const subtitleFor = (period: Period) =>
    granularity === 'week' ? formatWeekRange(period.key, locale) : undefined
  // Bare week numbers: twelve "W39"s do not fit a phone; the heading says "week".
  const axisLabelFor = (period: Period) =>
    granularity === 'week'
      ? String(parseWeekId(period.key)?.week ?? period.key)
      : new Intl.DateTimeFormat(locale, { month: 'short' }).format(period.start)

  const rangeLabel = t(granularity === 'week' ? 'insights.lastWeeks' : 'insights.lastMonths', {
    count: PERIOD_COUNT,
  })

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="mb-0">{t('insights.title')}</h1>
          <p className="mt-1 mb-0 text-sm text-muted-foreground">{t('insights.subtitle')}</p>
        </div>
        {/* Weeks or months: one switch, remembered, that re-cuts the same data. */}
        <div
          role="group"
          aria-label={t('insights.granularity')}
          className="flex rounded-full bg-card p-1 text-sm ring-1 ring-foreground/10"
        >
          {(['week', 'month'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={granularity === option}
              onClick={() => setMonths(option === 'month')}
              className={cn(
                'min-h-9 rounded-full px-4 font-medium transition-colors',
                granularity === option
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(option === 'week' ? 'insights.byWeek' : 'insights.byMonth')}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <p role="status" className="rounded-2xl bg-card px-4 py-3 text-sm text-muted-foreground">
          {t(COULD_NOT_REACH_SERVER_I18N_KEY)}
        </p>
      )}

      {data && !hasAnyRecord(data.weeks) ? (
        <section className="space-y-3 rounded-2xl bg-card p-4 text-card-foreground">
          <h2 className="text-base font-semibold">{t('insights.emptyTitle')}</h2>
          <p className="max-w-prose text-sm text-muted-foreground">{t('insights.emptyBody')}</p>
          <p className="text-sm">
            <Link to="/shopping-list">{t('nav.shoppingList')}</Link>
          </p>
        </section>
      ) : (
        <>
          {/* The headline is the money: one big number for the window, then
              the three counts that explain it. Nothing here is green — this is
              a record, not an action. */}
          <section
            className="rounded-2xl bg-card p-4 text-card-foreground"
            aria-label={t('insights.summary')}
          >
            <p className="mb-0 text-sm text-muted-foreground">
              {t('insights.spent')} · {rangeLabel}
            </p>
            <p className="mt-1 mb-0 text-3xl font-semibold tabular-nums">
              {formatKroner(summary.spent, locale)}
            </p>
            {summary.unpricedTrips > 0 && (
              <p className="mt-1 mb-0 text-sm text-muted-foreground">
                {t('insights.unpricedNote', { count: summary.unpricedTrips })}
              </p>
            )}
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-foreground/10 pt-4">
              <div>
                <dt className="text-xs text-muted-foreground">{t('insights.trips')}</dt>
                <dd className="m-0 text-lg font-semibold tabular-nums">{summary.trips}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{t('insights.meals')}</dt>
                <dd className="m-0 text-lg font-semibold tabular-nums">{summary.meals}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {t(granularity === 'week' ? 'insights.perWeek' : 'insights.perMonth')}
                </dt>
                <dd className="m-0 text-lg font-semibold tabular-nums">
                  {formatKroner(Math.round(summary.averagePerPeriod), locale)}
                </dd>
              </div>
            </dl>
            {summary.spent > 0 && (
              <div className="mt-5">
                <SpendChart periods={periods} labelFor={axisLabelFor} titleFor={titleFor} />
              </div>
            )}
          </section>

          <section
            className="rounded-2xl bg-card p-1.5 text-card-foreground"
            aria-label={t(granularity === 'week' ? 'insights.byWeek' : 'insights.byMonth')}
          >
            <h2 className="px-3 pt-2.5 pb-1.5 text-base font-semibold">
              {t(granularity === 'week' ? 'insights.weeksHeading' : 'insights.monthsHeading')}
            </h2>
            <ul className="m-0 list-none p-0">
              {periods.map((period) => (
                <PeriodRow
                  key={period.key}
                  period={period}
                  title={titleFor(period)}
                  subtitle={subtitleFor(period)}
                />
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}

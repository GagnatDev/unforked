import { useTranslation } from 'react-i18next'
import { useLocale } from '@/hooks/useLocale'
import { formatKroner } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Period } from './aggregate'

type SpendChartProps = {
  /** Newest first, as `buildPeriods` returns them. */
  periods: Period[]
  /** Short axis label for a period — "39" or "Sep"; twelve must fit a phone. */
  labelFor: (period: Period) => string
  /** Full name for tooltips and assistive tech — "Week 39" or "September 2026". */
  titleFor: (period: Period) => string
}

/**
 * Spend per period as a row of bars, oldest on the left. Plain elements, no
 * chart library: twelve bars and a baseline are all this needs. Bars are
 * green because they record something done — money spent in the shop — and
 * the current period is the only one at full strength, so the eye lands on
 * now. Values are exposed as text on each bar; the list below carries the
 * full detail, so the chart is decorative for assistive tech.
 */
export function SpendChart({ periods, labelFor, titleFor }: SpendChartProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const ordered = [...periods].reverse()
  const max = Math.max(0, ...ordered.map((p) => p.spent))
  if (max === 0) return null

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{t('insights.chartCaption')}</figcaption>
      <ol
        className="m-0 grid h-36 list-none items-end gap-1.5 p-0 sm:gap-2"
        style={{ gridTemplateColumns: `repeat(${ordered.length}, minmax(0, 1fr))` }}
      >
        {ordered.map((period, index) => {
          const current = index === ordered.length - 1
          const height = period.spent > 0 ? Math.max(4, (period.spent / max) * 100) : 0
          return (
            <li
              key={period.key}
              className="flex h-full min-w-0 flex-col justify-end gap-1.5"
              title={`${titleFor(period)}: ${formatKroner(period.spent, locale)}`}
            >
              <span className="sr-only">
                {titleFor(period)}: {formatKroner(period.spent, locale)}
              </span>
              <div className="flex flex-1 items-end">
                <div
                  aria-hidden="true"
                  className={cn(
                    'w-full rounded-t-md transition-[height] duration-300 ease-out',
                    period.spent === 0
                      ? 'h-px bg-foreground/15'
                      : current
                        ? 'bg-primary'
                        : 'bg-primary/45',
                  )}
                  style={period.spent > 0 ? { height: `${height}%` } : undefined}
                />
              </div>
              <span
                aria-hidden="true"
                className={cn(
                  'text-center text-[0.6875rem] leading-none tabular-nums',
                  current ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {labelFor(period)}
              </span>
            </li>
          )
        })}
      </ol>
    </figure>
  )
}

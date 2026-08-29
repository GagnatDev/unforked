import { useTranslation } from 'react-i18next'
import { CheckboxField } from '@/components/CheckboxField'

type TodayMealCardProps = {
  plannedPeople: number | null | undefined
  servings: number
  keepAwake: boolean
  onKeepAwakeChange: (next: boolean) => void
  wakeLockSupported: boolean
}

/**
 * The facts you check before starting to cook — how many are eating, what the
 * recipe yields — and the one setting that matters with busy hands. The recipe
 * name is the page heading, so it is not repeated here.
 */
export function TodayMealCard({
  plannedPeople,
  servings,
  keepAwake,
  onKeepAwakeChange,
  wakeLockSupported,
}: TodayMealCardProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3">
      {(plannedPeople != null || servings > 0) && (
        <div className="flex flex-wrap gap-2">
          {plannedPeople != null && (
            <span className="rounded-full bg-card px-3.5 py-1.5 text-sm font-medium">
              {t('mealPlan.people')}: {plannedPeople}
            </span>
          )}
          {servings > 0 && (
            <span className="rounded-full bg-card px-3.5 py-1.5 text-sm font-medium text-muted-foreground">
              {t('recipes.serves', { count: servings })}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-card px-4 py-3.5 text-card-foreground">
        <CheckboxField
          label={t('today.keepAwake')}
          checked={keepAwake}
          onCheckedChange={onKeepAwakeChange}
          disabled={!wakeLockSupported}
        />
        {!wakeLockSupported && (
          <span className="text-sm text-muted-foreground">{t('today.keepAwakeUnsupported')}</span>
        )}
      </div>
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import { CheckboxField } from '@/components/CheckboxField'

type TodayMealCardProps = {
  recipeName: string
  plannedPeople: number | null | undefined
  servings: number
  keepAwake: boolean
  onKeepAwakeChange: (next: boolean) => void
  wakeLockSupported: boolean
}

export function TodayMealCard({
  recipeName,
  plannedPeople,
  servings,
  keepAwake,
  onKeepAwakeChange,
  wakeLockSupported,
}: TodayMealCardProps) {
  const { t } = useTranslation()

  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 text-card-foreground">
      <div>
        <div className="text-lg font-semibold">{recipeName}</div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {plannedPeople != null && (
            <span>
              {t('mealPlan.people')}: {plannedPeople}
            </span>
          )}
          {servings > 0 && <span>{t('recipes.serves', { count: servings })}</span>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
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

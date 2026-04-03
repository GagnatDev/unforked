import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type TodayStepChecklistProps = {
  steps: string[]
  checkedSteps: boolean[]
  onToggleStep: (idx: number) => void
  onResetProgress: () => void
}

export function TodayStepChecklist({
  steps,
  checkedSteps,
  onToggleStep,
  onResetProgress,
}: TodayStepChecklistProps) {
  const { t } = useTranslation()

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t('today.steps')}</h2>
        <Button variant="outline" size="sm" onClick={onResetProgress} disabled={steps.length === 0}>
          {t('today.resetProgress')}
        </Button>
      </div>

      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ol className="list-none p-0 space-y-2">
          {steps.map((step, i) => {
            const checked = Boolean(checkedSteps[i])
            return (
              <li
                key={i}
                className={cn(
                  'rounded-lg border border-border bg-card px-3 py-3 text-card-foreground',
                  checked && 'opacity-70'
                )}
              >
                <button
                  type="button"
                  onClick={() => onToggleStep(i)}
                  className="flex w-full items-start gap-3 text-left"
                  aria-pressed={checked}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    className="mt-1 h-5 w-5"
                    aria-label={`${t('today.steps')} ${i + 1}`}
                  />
                  <div className="flex-1 whitespace-pre-wrap">
                    <span className="mr-2 font-medium text-muted-foreground">{i + 1}.</span>
                    {step}
                  </div>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

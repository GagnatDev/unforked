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
    <section className="rounded-2xl bg-card p-1.5 text-card-foreground">
      <div className="flex items-center justify-between gap-3 px-3 pt-2 pb-1.5">
        <h2 className="text-base font-semibold">{t('today.steps')}</h2>
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full"
          onClick={onResetProgress}
          disabled={steps.length === 0}
        >
          {t('today.resetProgress')}
        </Button>
      </div>

      {steps.length === 0 ? (
        <p className="px-3 pb-2 text-sm text-muted-foreground">—</p>
      ) : (
        <ol className="m-0 list-none p-0">
          {steps.map((step, i) => {
            const checked = Boolean(checkedSteps[i])
            return (
              <li
                key={i}
                className={cn(
                  'rounded-xl',
                  // A done step tints and strikes through; it stays readable
                  // and in place, because you may need to look back at it.
                  checked && 'bg-muted'
                )}
              >
                <button
                  type="button"
                  onClick={() => onToggleStep(i)}
                  className="flex w-full items-start gap-3 px-3 py-3 text-left"
                  aria-pressed={checked}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
                    aria-label={`${t('today.steps')} ${i + 1}`}
                  />
                  <div
                    className={cn(
                      'flex-1 whitespace-pre-wrap',
                      checked && 'text-muted-foreground line-through decoration-1'
                    )}
                  >
                    <span className="mr-2 font-semibold tabular-nums">{i + 1}.</span>
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

import { useTranslation } from 'react-i18next'
import { PlusIcon, XIcon } from 'lucide-react'
import { AutoGrowTextarea } from '@/components/AutoGrowTextarea'
import { Button } from '@/components/ui/button'

type Props = {
  steps: string[]
  onAdd: () => void
  onUpdate: (index: number, value: string) => void
  onRemove: (index: number) => void
}

export function StepListEditor({ steps, onAdd, onUpdate, onRemove }: Props) {
  const { t } = useTranslation()

  return (
    <section className="rounded-2xl bg-card p-4 text-card-foreground">
      <h3 className="mb-2 text-base font-semibold">{t('recipeForm.steps')}</h3>
      {steps.map((step, i) => (
        <div key={i} className="mb-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-muted-foreground">
              {t('recipeForm.stepLabel', { position: i + 1 })}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('recipeForm.removeStepAria', { position: i + 1 })}
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(i)}
            >
              <XIcon />
            </Button>
          </div>
          <AutoGrowTextarea
            aria-label={t('recipeForm.stepLabel', { position: i + 1 })}
            value={step}
            onChange={(e) => onUpdate(i, e.target.value)}
            rows={2}
            className="w-full rounded-xl"
          />
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        className="mt-1 h-10 rounded-full px-4"
        onClick={onAdd}
      >
        <PlusIcon data-icon="inline-start" />
        {t('recipeForm.addStep')}
      </Button>
    </section>
  )
}

import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type Props = {
  steps: string[]
  onAdd: () => void
  onUpdate: (index: number, value: string) => void
  onRemove: (index: number) => void
}

export function StepListEditor({ steps, onAdd, onUpdate, onRemove }: Props) {
  const { t } = useTranslation()

  return (
    <>
      <h3>{t('recipeForm.steps')}</h3>
      {steps.map((step, i) => (
        <div key={i} className="mb-2">
          <Textarea
            value={step}
            onChange={(e) => onUpdate(i, e.target.value)}
            rows={2}
            className="w-full"
          />
          <Button type="button" variant="outline" size="sm" className="mt-1" onClick={() => onRemove(i)}>
            {t('recipeForm.remove')}
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={onAdd}>
        {t('recipeForm.addStep')}
      </Button>
    </>
  )
}

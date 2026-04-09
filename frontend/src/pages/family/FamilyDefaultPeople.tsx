import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type FamilyDefaultPeopleProps = {
  value: string
  saving: boolean
  onChange: (next: string) => void
  onSave: () => void
}

export function FamilyDefaultPeople({ value, saving, onChange, onSave }: FamilyDefaultPeopleProps) {
  const { t } = useTranslation()

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-medium">{t('family.defaultMealPlanning')}</h2>
      <p className="text-sm text-muted-foreground">{t('family.defaultMealPlanningHint')}</p>
      <div className="flex max-w-xs flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="family-default-people" className="mb-1 block text-sm font-medium">
            {t('family.defaultPeople')}
          </label>
          <Input
            id="family-default-people"
            type="number"
            min={1}
            max={50}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving ? t('common.loading') : t('family.save')}
        </Button>
      </div>
    </section>
  )
}

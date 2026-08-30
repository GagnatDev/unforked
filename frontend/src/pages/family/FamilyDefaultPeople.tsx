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
    <section className="space-y-3 rounded-2xl bg-card p-4 text-card-foreground">
      <div>
        <h2 className="text-base font-semibold">{t('family.defaultMealPlanning')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('family.defaultMealPlanningHint')}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="family-default-people" className="mb-1.5 block text-sm font-medium">
            {t('family.defaultPeople')}
          </label>
          <Input
            id="family-default-people"
            type="number"
            min={1}
            max={50}
            inputMode="numeric"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-11 w-24 rounded-xl tabular-nums"
          />
        </div>
        <Button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="h-11 rounded-full px-5"
        >
          {saving ? t('common.loading') : t('family.save')}
        </Button>
      </div>
    </section>
  )
}

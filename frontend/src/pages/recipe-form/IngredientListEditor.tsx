import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Ingredient } from '@/types'

type Props = {
  ingredients: Ingredient[]
  onAdd: () => void
  onUpdate: (index: number, patch: Partial<Ingredient>) => void
  onRemove: (index: number) => void
}

export function IngredientListEditor({
  ingredients,
  onAdd,
  onUpdate,
  onRemove,
}: Props) {
  const { t } = useTranslation()

  return (
    <>
      <h3>{t('recipeForm.ingredients')}</h3>
      {ingredients.map((ing, i) => (
        <div key={i} className="mb-2 flex flex-wrap gap-2">
          <Input
            placeholder={t('recipeForm.placeholderName')}
            aria-label={t('recipeForm.ingredientNameAria')}
            value={ing.name}
            onChange={(e) => onUpdate(i, { name: e.target.value })}
            className="min-w-32 flex-1"
          />
          <Input
            placeholder={t('recipeForm.placeholderQty')}
            aria-label={t('recipeForm.ingredientQtyAria')}
            value={ing.quantity}
            onChange={(e) => onUpdate(i, { quantity: e.target.value })}
            className="w-20"
          />
          <Input
            placeholder={t('recipeForm.placeholderUnit')}
            aria-label={t('recipeForm.ingredientUnitAria')}
            value={ing.unit}
            onChange={(e) => onUpdate(i, { unit: e.target.value })}
            className="w-20"
          />
          <Button type="button" variant="outline" size="sm" onClick={() => onRemove(i)}>
            {t('recipeForm.remove')}
          </Button>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={onAdd}>
        {t('recipeForm.addIngredient')}
      </Button>
    </>
  )
}

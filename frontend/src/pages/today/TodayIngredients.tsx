import { useTranslation } from 'react-i18next'
import type { Ingredient } from '../../types'

type TodayIngredientsProps = {
  ingredients: Ingredient[]
}

export function TodayIngredients({ ingredients }: TodayIngredientsProps) {
  const { t } = useTranslation()

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{t('today.ingredients')}</h2>
      {ingredients.length === 0 ? (
        <p className="text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="list-none p-0 space-y-2">
          {ingredients.map((ing, i) => {
            const left = [ing.quantity, ing.unit].filter(Boolean).join(' ').trim()
            const text = `${left ? `${left} ` : ''}${ing.name}`.trim()
            return (
              <li
                key={i}
                className="rounded-lg border border-border bg-card px-3 py-2 text-card-foreground"
              >
                {text}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

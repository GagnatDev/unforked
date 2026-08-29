import { useTranslation } from 'react-i18next'
import type { Ingredient } from '@/types'

type TodayIngredientsProps = {
  ingredients: Ingredient[]
}

export function TodayIngredients({ ingredients }: TodayIngredientsProps) {
  const { t } = useTranslation()

  return (
    <section className="rounded-2xl bg-card p-1.5 text-card-foreground">
      <h2 className="px-3 pt-2.5 pb-1.5 text-base font-semibold">{t('today.ingredients')}</h2>
      {ingredients.length === 0 ? (
        <p className="px-3 pb-2 text-sm text-muted-foreground">—</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {ingredients.map((ing, i) => {
            const amount = [ing.quantity, ing.unit].filter(Boolean).join(' ').trim()
            return (
              <li
                key={i}
                // Quantity trails the name in its own colour: cooking reads the
                // ingredient first, then how much of it.
                className="flex min-h-12 items-center gap-3 px-3 not-last:border-b not-last:border-border/60"
              >
                <span className="flex-1 font-medium">{ing.name}</span>
                {amount && (
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-primary">
                    {amount}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

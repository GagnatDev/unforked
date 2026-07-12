import { useTranslation } from 'react-i18next'
import type { CategoryGroup } from '@/lib/shoppingCategories'
import type { ShoppingCategory } from '@/types'
import { ShoppingItemRow } from './ShoppingItemRow'

type CategorySectionProps = {
  group: CategoryGroup
  onToggle: (id: string) => void
  onChangeCategory: (id: string, category: ShoppingCategory) => void
  onDelete: (id: string) => void
}

/** One store section: header with picked/total progress, then its item rows. */
export function CategorySection({
  group,
  onToggle,
  onChangeCategory,
  onDelete,
}: CategorySectionProps) {
  const { t } = useTranslation()

  return (
    <section className="space-y-2" aria-label={t(`shoppingList.categories.${group.category}`)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{t(`shoppingList.categories.${group.category}`)}</h2>
        <span className="text-sm tabular-nums text-muted-foreground">
          {t('shoppingList.progress', {
            checked: group.checkedCount,
            total: group.items.length,
          })}
        </span>
      </div>
      <ul className="m-0 list-none space-y-2 p-0">
        {group.items.map((item) => (
          <ShoppingItemRow
            key={item.id}
            item={item}
            onToggle={() => onToggle(item.id)}
            onChangeCategory={(category) => onChangeCategory(item.id, category)}
            onDelete={() => onDelete(item.id)}
          />
        ))}
      </ul>
    </section>
  )
}

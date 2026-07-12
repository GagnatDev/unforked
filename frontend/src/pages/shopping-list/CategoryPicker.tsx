import { useTranslation } from 'react-i18next'
import { TagIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SHOPPING_CATEGORY_ORDER } from '@/lib/shoppingCategories'
import { cn } from '@/lib/utils'
import type { ShoppingCategory } from '@/types'

type CategoryPickerProps = {
  itemName: string
  value: ShoppingCategory
  onChange: (category: ShoppingCategory) => void
}

/** Per-item store-category menu, listing all categories in store-walk order. */
export function CategoryPicker({ itemName, value, onChange }: CategoryPickerProps) {
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: 'ghost', size: 'icon' }),
          'aria-expanded:bg-muted'
        )}
        aria-label={t('shoppingList.changeCategoryAria', { name: itemName })}
      >
        <TagIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-44">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            if (SHOPPING_CATEGORY_ORDER.includes(next as ShoppingCategory)) {
              onChange(next as ShoppingCategory)
            }
          }}
        >
          {SHOPPING_CATEGORY_ORDER.map((category) => (
            <DropdownMenuRadioItem key={category} value={category}>
              {t(`shoppingList.categories.${category}`)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

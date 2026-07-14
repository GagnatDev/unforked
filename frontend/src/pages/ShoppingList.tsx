import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { WeekPicker } from '@/components/WeekPicker'
import { Button } from '@/components/ui/button'
import { groupItemsByCategory } from '@/lib/shoppingCategories'
import { formatLoadErrorMessage } from '@/lib/loadErrors'
import { getNextWeekId } from '@/lib/utils'
import { AddItemForm } from './shopping-list/AddItemForm'
import { CategorySection } from './shopping-list/CategorySection'
import {
  buildShoppingListCsv,
  buildShoppingListTxt,
  downloadFile,
} from './shopping-list/exportShoppingList'
import { useShoppingList } from './shopping-list/useShoppingList'

function getInitialWeekId(): string {
  return getNextWeekId()
}

export default function ShoppingList() {
  const { t, i18n } = useTranslation()
  const [weekId, setWeekId] = useState(getInitialWeekId())
  const {
    items,
    loading,
    error,
    mutationFailed,
    adding,
    toggleChecked,
    changeCategory,
    editItem,
    addItem,
    deleteItem,
  } = useShoppingList(weekId)

  const groups = items ? groupItemsByCategory(items) : []

  const exportText = () => {
    downloadFile(
      `shopping-list-${weekId}.txt`,
      buildShoppingListTxt(t('shoppingList.exportTitle', { weekId }), groups, (group) =>
        t(`shoppingList.categories.${group.category}`),
      ),
      'text/plain',
    )
  }

  const exportCsv = () => {
    if (!items) return
    downloadFile(`shopping-list-${weekId}.csv`, buildShoppingListCsv(items), 'text/csv')
  }

  return (
    <div>
      <h1>{t('shoppingList.title')}</h1>
      <div className="mb-4">
        <WeekPicker
          value={weekId}
          onChange={setWeekId}
          locale={i18n.resolvedLanguage ?? i18n.language}
        />
      </div>
      {mutationFailed && <p className="mb-2 text-destructive">{t('shoppingList.updateFailed')}</p>}
      {loading && !items ? (
        <p>{t('shoppingList.loading')}</p>
      ) : error ? (
        <p className="text-destructive">{formatLoadErrorMessage(error, t)}</p>
      ) : (
        <div className="space-y-6">
          {groups.length > 0 ? (
            groups.map((group) => (
              <CategorySection
                key={group.category}
                group={group}
                onToggle={toggleChecked}
                onChangeCategory={changeCategory}
                onEdit={editItem}
                onDelete={deleteItem}
              />
            ))
          ) : (
            <p>
              <Trans
                i18nKey="shoppingList.noIngredients"
                components={{ 1: <Link to="/meal-plan" /> }}
              />
            </p>
          )}
          <AddItemForm onAdd={addItem} adding={adding} />
          {groups.length > 0 && (
            <p className="flex gap-2">
              <Button onClick={exportText} variant="secondary">
                {t('shoppingList.exportTxt')}
              </Button>
              <Button onClick={exportCsv} variant="secondary">
                {t('shoppingList.exportCsv')}
              </Button>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

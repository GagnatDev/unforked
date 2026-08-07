import { Link, useSearchParams } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { CheckboxField } from '@/components/CheckboxField'
import { WeekPicker } from '@/components/WeekPicker'
import { Button } from '@/components/ui/button'
import { usePersistedFlag } from '@/hooks/usePersistedFlag'
import { groupItemsByCategory, hideCheckedItems } from '@/lib/shoppingCategories'
import { formatIsoTimeOrDateTime } from '@/lib/format'
import { formatLoadErrorMessage } from '@/lib/loadErrors'
import { getNextWeekId } from '@/lib/utils'
import { isWeekId } from '@/lib/week-id'
import { AddItemForm } from './shopping-list/AddItemForm'
import { CategorySection } from './shopping-list/CategorySection'
import {
  buildShoppingListCsv,
  buildShoppingListTxt,
  downloadFile,
} from './shopping-list/exportShoppingList'
import { useShoppingList } from './shopping-list/useShoppingList'

const HIDE_CHECKED_KEY = 'shoppingList.hideChecked'

export default function ShoppingList() {
  const { t, i18n } = useTranslation()
  // The viewed week lives in the URL (?week=) so push-notification deep links
  // land on the right list (design #104 D5/D6); without a valid param the
  // page defaults to the upcoming week as before.
  const [searchParams, setSearchParams] = useSearchParams()
  const paramWeek = searchParams.get('week')
  const weekId = isWeekId(paramWeek) ? paramWeek : getNextWeekId()
  const setWeekId = (week: string) => setSearchParams({ week }, { replace: true })
  const [hideChecked, setHideChecked] = usePersistedFlag(HIDE_CHECKED_KEY)
  const {
    items,
    loading,
    error,
    adding,
    status,
    approvedByEmail,
    approvedAt,
    toggleChecked,
    changeCategory,
    editItem,
    addItem,
    deleteItem,
    approve,
    reopen,
  } = useShoppingList(weekId)

  const groups = items ? groupItemsByCategory(items) : []
  // Exports always cover the full list; only the rendered sections are filtered.
  const visibleGroups = hideChecked ? hideCheckedItems(groups) : groups

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
      {/* Approved / "shopping now" state (design #104 D4): a persistent banner
          while someone is shopping, with "Done" to reopen; otherwise the
          "I'm going shopping" action. Both go through the optimistic outbox. */}
      {status === 'approved' ? (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted p-3"
        >
          <span>
            {t('shoppingList.approvedBanner', {
              email: approvedByEmail ?? '',
              time: approvedAt
                ? formatIsoTimeOrDateTime(approvedAt, i18n.resolvedLanguage ?? i18n.language)
                : '',
            })}
          </span>
          <Button onClick={reopen} variant="secondary">
            {t('shoppingList.done')}
          </Button>
        </div>
      ) : items && items.length > 0 ? (
        <p className="mb-4">
          <Button onClick={approve}>{t('shoppingList.goShopping')}</Button>
        </p>
      ) : null}
      {loading && !items ? (
        <p>{t('shoppingList.loading')}</p>
      ) : error ? (
        <p className="text-destructive">{formatLoadErrorMessage(error, t)}</p>
      ) : (
        <div className="space-y-6">
          {groups.length > 0 ? (
            <>
              <CheckboxField
                label={t('shoppingList.hideChecked')}
                checked={hideChecked}
                onCheckedChange={setHideChecked}
              />
              {visibleGroups.length > 0 ? (
                visibleGroups.map((group) => (
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
                <p>{t('shoppingList.allCheckedHidden')}</p>
              )}
            </>
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

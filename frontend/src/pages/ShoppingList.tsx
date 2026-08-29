import { Link, useSearchParams } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { ShoppingCartIcon } from 'lucide-react'
import { CheckboxField } from '@/components/CheckboxField'
import { WeekPicker } from '@/components/WeekPicker'
import { Button } from '@/components/ui/button'
import { useLocale } from '@/hooks/useLocale'
import { usePersistedFlag } from '@/hooks/usePersistedFlag'
import { groupItemsByCategory, hideCheckedItems } from '@/lib/shoppingCategories'
import { formatIsoTimeOrDateTime } from '@/lib/format'
import { formatLoadErrorMessage } from '@/lib/loadErrors'
import { isWeekId } from '@/lib/week-id'
import { AddItemForm } from './shopping-list/AddItemForm'
import { CategorySection } from './shopping-list/CategorySection'
import {
  buildShoppingListCsv,
  buildShoppingListTxt,
  downloadFile,
} from './shopping-list/exportShoppingList'
import { useShoppingList } from './shopping-list/useShoppingList'
import { useShoppingWeek } from './shopping-list/useShoppingWeek'

const HIDE_CHECKED_KEY = 'shoppingList.hideChecked'

export default function ShoppingList() {
  const { t } = useTranslation()
  const locale = useLocale()
  // The viewed week lives in the URL (?week=) so push-notification deep links
  // land on the right list (design #104 D5/D6); without a valid param the page
  // picks the week itself — next week, or this week when next week is empty.
  const [searchParams, setSearchParams] = useSearchParams()
  const paramWeek = searchParams.get('week')
  const pinnedWeek = isWeekId(paramWeek) ? paramWeek : null
  const { weekId, resolving } = useShoppingWeek(pinnedWeek)
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

  const total = items?.length ?? 0
  const checkedCount = items?.filter((item) => item.checked).length ?? 0
  const shopping = status === 'approved'

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <h1 className="mb-1">{t('shoppingList.title')}</h1>
          {total > 0 && (
            <p className="text-sm text-muted-foreground">
              {t('shoppingList.itemCount', { count: total })}
            </p>
          )}
        </div>
        <WeekPicker value={weekId} onChange={setWeekId} locale={locale} />
      </div>

      {/* One green card carries the whole shared state of the trip: how far the
          list has got, and who — if anyone — is in the shop right now
          (design #104 D4). Both actions go through the optimistic outbox. */}
      {total > 0 && (
        <section
          role={shopping ? 'status' : undefined}
          className="mb-5 flex flex-col gap-4 rounded-2xl bg-primary p-4 text-primary-foreground"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
              <ShoppingCartIcon className="size-5" />
            </span>
            <p className="min-w-0 flex-1 font-semibold">{t('shoppingList.inCart')}</p>
            <span className="shrink-0 text-lg font-semibold tabular-nums">
              {t('shoppingList.progress', { checked: checkedCount, total })}
            </span>
          </div>

          {/* Who is out shopping reads as a second line, so a long name can
              never push the counter around. */}
          {shopping && (
            <p className="-mt-2 text-sm text-primary-foreground/85">
              {t('shoppingList.approvedBanner', {
                email: approvedByEmail ?? '',
                time: approvedAt ? formatIsoTimeOrDateTime(approvedAt, locale) : '',
              })}
            </p>
          )}

          <div
            className="h-1.5 overflow-hidden rounded-full bg-primary-foreground/25"
            role="progressbar"
            aria-valuenow={checkedCount}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label={t('shoppingList.inCart')}
          >
            <div
              className="h-full rounded-full bg-primary-foreground transition-[width] duration-300 ease-out"
              style={{ width: `${total > 0 ? (checkedCount / total) * 100 : 0}%` }}
            />
          </div>

          <Button
            onClick={shopping ? reopen : approve}
            className="h-11 w-full rounded-full bg-primary-foreground px-6 text-primary hover:bg-primary-foreground/90 sm:w-fit sm:self-start"
          >
            {shopping ? t('shoppingList.done') : t('shoppingList.goShopping')}
          </Button>
        </section>
      )}

      {resolving || (loading && !items) ? (
        <p>{t('shoppingList.loading')}</p>
      ) : error ? (
        <p className="text-destructive">{formatLoadErrorMessage(error, t)}</p>
      ) : (
        <div className="space-y-4">
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
          {/* Add item sits at the end of the list, where you can see where the
              new row will land — not behind a button in the tab bar. */}
          <AddItemForm onAdd={addItem} adding={adding} />
          {groups.length > 0 && (
            <p className="flex flex-wrap gap-2">
              <Button onClick={exportText} variant="secondary" className="h-10 rounded-full px-4">
                {t('shoppingList.exportTxt')}
              </Button>
              <Button onClick={exportCsv} variant="secondary" className="h-10 rounded-full px-4">
                {t('shoppingList.exportCsv')}
              </Button>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

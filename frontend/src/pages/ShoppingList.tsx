import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { WeekPicker } from '@/components/WeekPicker'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/hooks/useAsync'
import { getNextWeekId } from '@/lib/utils'
import { api } from '../api'

function getInitialWeekId(): string {
  return getNextWeekId()
}

export default function ShoppingList() {
  const { t, i18n } = useTranslation()
  const [weekId, setWeekId] = useState(getInitialWeekId())
  const { data, loading, error } = useAsync(
    (_signal) => api.shoppingList(weekId),
    [weekId],
  )

  const exportText = () => {
    if (!data) return
    const lines = [
      t('shoppingList.exportTitle', { weekId: data.weekIdentifier }),
      '',
      ...data.items.map((i) => `- ${i.name} ${i.quantity} ${i.unit}`.trim()),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shopping-list-${data.weekIdentifier}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportCsv = () => {
    if (!data) return
    const header = 'name,quantity,unit'
    const rows = data.items.map((i) => `"${i.name}","${i.quantity}","${i.unit}"`)
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shopping-list-${data.weekIdentifier}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
      {loading ? (
        <p>{t('shoppingList.loading')}</p>
      ) : error ? (
        <p className="text-destructive">{error}</p>
      ) : data && data.items.length > 0 ? (
        <>
          <ul className="list-none p-4 m-0 rounded-lg border border-border bg-card text-card-foreground">
            {data.items.map((item, i) => (
              <li key={i} className="py-2 border-b border-border last:border-b-0">
                <strong>{item.name}</strong> {item.quantity} {item.unit}
              </li>
            ))}
          </ul>
          <p className="mt-4 flex gap-2">
            <Button onClick={exportText} variant="secondary">{t('shoppingList.exportTxt')}</Button>
            <Button onClick={exportCsv} variant="secondary">{t('shoppingList.exportCsv')}</Button>
          </p>
        </>
      ) : (
        <p>
          <Trans i18nKey="shoppingList.noIngredients" components={{ 1: <Link to="/meal-plan" /> }} />
        </p>
      )}
    </div>
  )
}

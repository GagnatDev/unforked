import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { api } from '../api'
import type { ShoppingListDoc } from '../types'

function getCurrentWeekId(): string {
  const now = new Date()
  const start = new Date(now)
  start.setDate(now.getDate() - now.getDay() + 1)
  const oneJan = new Date(start.getFullYear(), 0, 1)
  const week = Math.ceil(((start.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7)
  return `${start.getFullYear()}-W${String(week).padStart(2, '0')}`
}

export default function ShoppingList() {
  const [weekId, setWeekId] = useState(getCurrentWeekId())
  const [data, setData] = useState<ShoppingListDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api
      .shoppingList(weekId)
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [weekId])

  const exportText = () => {
    if (!data) return
    const lines = [
      `Shopping list – ${data.weekIdentifier}`,
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

  if (loading) return <p>Loading…</p>
  if (error) return <p style={{ color: 'crimson' }}>{error}</p>

  return (
    <div>
      <h1>Shopping list</h1>
      <p>
        <label>
          Week{' '}
          <input
            type="text"
            value={weekId}
            onChange={(e) => setWeekId(e.target.value)}
            placeholder="e.g. 2025-W10"
            style={{ padding: 8 }}
          />
        </label>
      </p>
      {data && data.items.length > 0 ? (
        <>
          <ul style={{ listStyle: 'none', padding: 16, margin: 0, background: '#fff', borderRadius: 8 }}>
            {data.items.map((item, i) => (
              <li key={i} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
                <strong>{item.name}</strong> {item.quantity} {item.unit}
              </li>
            ))}
          </ul>
          <p className="mt-4 flex gap-2">
            <Button onClick={exportText} variant="secondary">Export as TXT</Button>
            <Button onClick={exportCsv} variant="secondary">Export as CSV</Button>
          </p>
        </>
      ) : (
        <p>No ingredients for this week. Assign recipes in <Link to="/meal-plan">This week</Link> first.</p>
      )}
    </div>
  )
}

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { InsightsResponse } from '@/types'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('@/api', () => ({ api: { insights: { get: mocks.get } } }))

import Insights from './Insights'

// A Saturday in ISO week 39 of 2026; the page groups relative to "now".
const NOW = new Date(2026, 8, 26, 16, 0)

const record: InsightsResponse = {
  from: '2025-W40',
  to: '2026-W40',
  weeks: [
    {
      weekId: '2026-W38',
      meals: [
        { day: 'monday', recipeId: 'r1', recipeName: 'Tacos', persons: 3 },
        { day: 'wednesday', recipeId: 'r2', recipeName: 'Fish soup' },
      ],
      trips: [
        {
          id: 't1',
          completedAt: '2026-09-13T15:04:00',
          completedByEmail: 'ann@example.com',
          itemCount: 14,
          totalCost: 1249.5,
        },
      ],
    },
    {
      weekId: '2026-W39',
      meals: [{ day: 'friday', recipeId: 'r1', recipeName: 'Tacos' }],
      trips: [
        { id: 't2', completedAt: '2026-09-22T17:30:00', completedByEmail: 'bo@example.com', itemCount: 4 },
        {
          id: 't3',
          completedAt: '2026-09-25T12:00:00',
          completedByEmail: 'ann@example.com',
          itemCount: 9,
          totalCost: 620,
        },
      ],
    },
  ],
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <Insights />
    </MemoryRouter>,
  )
}

describe('Insights', () => {
  it('asks the server for the past year and sums what the family spent, by week', async () => {
    mocks.get.mockResolvedValue(record)
    renderPage()

    await screen.findByRole('heading', { name: 'Insights' })
    expect(mocks.get).toHaveBeenCalledWith({ from: '2025-W40', to: '2026-W40' }, expect.any(AbortSignal))

    const summary = within(await screen.findByRole('region', { name: 'Summary' }))
    expect(summary.getByText('Spent in the shop · last 12 weeks')).toBeTruthy()
    expect(summary.getByText('1,869.5 kr')).toBeTruthy()
    expect(summary.getByText(/1 trip has no amount recorded/)).toBeTruthy()
    expect(summary.getByText('Shopping trips').nextElementSibling?.textContent).toBe('3')
    expect(summary.getByText('Dinners planned').nextElementSibling?.textContent).toBe('3')
    // 1,869.5 / 12 weeks, rounded to whole kroner.
    expect(summary.getByText('Per week').nextElementSibling?.textContent).toBe('156 kr')

    const weeks = within(screen.getByRole('region', { name: 'Weeks' }))
    const rows = weeks.getAllByText(/^Week \d+$/).map((el) => el.textContent)
    expect(rows).toHaveLength(12)
    expect(rows.slice(0, 3)).toEqual(['Week 39', 'Week 38', 'Week 37'])

    // The Sunday-the-13th trip was paid in W37, not the W38 it shopped for.
    const w37 = weeks.getByText('Week 37').closest('details')!
    expect(w37.textContent).toContain('1 trip')
    expect(w37.textContent).toContain('1,249.5 kr')
    const w38 = weeks.getByText('Week 38').closest('details')!
    expect(w38.textContent).toContain('2 dinners')
    expect(w38.textContent).not.toContain('kr')
    const w39 = weeks.getByText('Week 39').closest('details')!
    expect(w39.textContent).toContain('2 trips · 1 dinner')
    expect(w39.textContent).toContain('620 kr')
    expect(w39.textContent).toContain('1 without amount')
    expect(within(w39).getByRole('link', { name: /Fri, Sep 25/ }).getAttribute('href')).toBe(
      '/shopping-list?week=2026-W39',
    )
    expect(within(w39).getByText('No amount')).toBeTruthy()
    expect(within(w39).getByText('Tacos')).toBeTruthy()
    expect(weeks.getByText('Week 30').closest('details')!.textContent).toContain('Nothing recorded')
  })

  it('regroups the same record by month and remembers the choice', async () => {
    mocks.get.mockResolvedValue(record)
    const first = renderPage()
    await screen.findByRole('heading', { name: 'Insights' })

    fireEvent.click(screen.getByRole('button', { name: 'Months' }))
    expect(screen.getByRole('button', { name: 'Months' }).getAttribute('aria-pressed')).toBe('true')
    const summary = within(screen.getByRole('region', { name: 'Summary' }))
    expect(summary.getByText('Spent in the shop · last 12 months')).toBeTruthy()
    expect(summary.getByText('Per month')).toBeTruthy()

    const months = within(screen.getByRole('region', { name: 'Months' }))
    const september = months.getByText('September 2026').closest('details')!
    expect(september.textContent).toContain('3 trips · 3 dinners')
    expect(september.textContent).toContain('1,869.5 kr')
    expect(months.getByText('October 2025')).toBeTruthy()
    expect(mocks.get).toHaveBeenCalledTimes(1)

    first.unmount()
    renderPage()
    await screen.findByRole('heading', { name: 'Insights' })
    expect(screen.getByRole('button', { name: 'Months' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('explains an empty record and points to the shopping list', async () => {
    mocks.get.mockResolvedValue({ from: '2025-W40', to: '2026-W40', weeks: [] })
    renderPage()

    expect(await screen.findByText('Nothing to sum up yet')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Shopping list' }).getAttribute('href')).toBe('/shopping-list')
    expect(screen.queryByRole('region', { name: 'Summary' })).toBeNull()
  })

  it('shows the unavailable card when the server cannot be reached, with a retry', async () => {
    mocks.get.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(record)
    renderPage()

    expect(await screen.findByText('Connection needed')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('region', { name: 'Summary' })).toBeTruthy()
  })
})

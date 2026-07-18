import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { startPushMessages, type InPagePushPayload } from '@/lib/pushMessages'
import { PushToaster } from './PushToaster'

type MessageHandler = (event: { data: unknown }) => void
let emitSwMessage: MessageHandler

function wireServiceWorkerMessages(): void {
  const handlers: MessageHandler[] = []
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      addEventListener: (_type: string, fn: MessageHandler) => handlers.push(fn),
    },
    configurable: true,
  })
  startPushMessages()
  emitSwMessage = (event) => handlers.forEach((fn) => fn(event))
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

function pushArrives(payload: InPagePushPayload): void {
  act(() => {
    emitSwMessage({ data: { type: 'push', payload } })
  })
}

const payload: InPagePushPayload = {
  title: 'Shopping list updated (week 30)',
  body: 'Aivo added 3 items to the shopping list.',
  url: '/shopping-list?week=2026-W30',
  tag: 'shopping-list-fam-2026-W30',
}

beforeEach(() => {
  vi.useFakeTimers()
  wireServiceWorkerMessages()
  render(
    <MemoryRouter initialEntries={['/']}>
      <PushToaster />
      <LocationProbe />
    </MemoryRouter>
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('PushToaster', () => {
  it('shows a focused-window push as a toast and auto-dismisses it', () => {
    pushArrives(payload)
    expect(screen.getByText(payload.title)).toBeTruthy()
    expect(screen.getByText(payload.body)).toBeTruthy()

    act(() => {
      vi.advanceTimersByTime(8000)
    })
    expect(screen.queryByText(payload.title)).toBeNull()
  })

  it('navigates to the deep link when the toast is tapped', () => {
    pushArrives(payload)
    fireEvent.click(screen.getByText(payload.title))
    expect(screen.getByTestId('location').textContent).toBe('/shopping-list?week=2026-W30')
    expect(screen.queryByText(payload.title)).toBeNull()
  })

  it('dismisses without navigating via the close button', () => {
    pushArrives(payload)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText(payload.title)).toBeNull()
    expect(screen.getByTestId('location').textContent).toBe('/')
  })

  it('replaces a toast carrying the same tag (coalescing) but stacks different tags', () => {
    pushArrives(payload)
    pushArrives({ ...payload, body: 'Aivo added 5 items to the shopping list.' })
    expect(screen.queryByText(payload.body)).toBeNull()
    expect(screen.getByText('Aivo added 5 items to the shopping list.')).toBeTruthy()

    pushArrives({ ...payload, title: 'Other week', tag: 'shopping-list-fam-2026-W31' })
    expect(screen.getByText('Aivo added 5 items to the shopping list.')).toBeTruthy()
    expect(screen.getByText('Other week')).toBeTruthy()
  })
})

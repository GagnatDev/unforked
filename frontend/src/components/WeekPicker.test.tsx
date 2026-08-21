import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'

import { WeekPicker } from './WeekPicker'

/** Frozen "now": 15 June 2026 is in ISO week 2026-W25, so next week is W26. */
const FROZEN_NOW = new Date(2026, 5, 15, 12, 0, 0)

/**
 * jsdom has no PointerEvent, but React dispatches by event *name*, so a
 * MouseEvent named `pointerdown` reaches `onPointerDown` and carries the
 * clientX/clientY the gesture reads.
 */
function pointer(type: string, x: number, y: number) {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })
}

function strip() {
  return screen.getByRole('group', { name: 'Select week' })
}

function swipe(from: number, to: number, y = 0) {
  const target = strip()
  fireEvent(target, pointer('pointerdown', from, y))
  fireEvent(target, pointer('pointermove', to, y))
  fireEvent(target, pointer('pointerup', to, y))
}

function renderPicker(value = '2026-W26', locale = 'en') {
  const onChange = vi.fn()
  render(<WeekPicker value={value} onChange={onChange} locale={locale} />)
  return { onChange }
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(FROZEN_NOW)
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('WeekPicker', () => {
  it('shows the previous, selected and next week as one line', () => {
    renderPicker()

    expect(
      screen.getByRole('button', { name: /^Week 26, 2026/ }).getAttribute('aria-current'),
    ).toBe('true')
    expect(screen.getByRole('button', { name: /^Previous week: Week 25, 2026/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Next week: Week 27, 2026/ })).toBeTruthy()
  })

  it('labels the weeks by the days they cover, and by name when they are near', () => {
    renderPicker()

    // W25 is the calendar week we are in, W26 the one after it.
    const tiles = within(strip())
    expect(tiles.getByText('This week')).toBeTruthy()
    expect(tiles.getByText('Next week')).toBeTruthy()
    expect(tiles.getByText(/Jun 22.+28/)).toBeTruthy()
    expect(tiles.getByText('Week 27')).toBeTruthy()
  })

  it('formats the days in the given locale', () => {
    renderPicker('2026-W26', 'nb')

    expect(within(strip()).getByText(/22\..+28\. juni/)).toBeTruthy()
  })

  it('selects the week before on a tap to the left', () => {
    const { onChange } = renderPicker()

    fireEvent.click(screen.getByRole('button', { name: /^Previous week/ }))

    expect(onChange).toHaveBeenCalledWith('2026-W25')
  })

  it('selects the week after on a tap to the right', () => {
    const { onChange } = renderPicker()

    fireEvent.click(screen.getByRole('button', { name: /^Next week/ }))

    expect(onChange).toHaveBeenCalledWith('2026-W27')
  })

  it('does nothing when the selected week is tapped', () => {
    const { onChange } = renderPicker()

    fireEvent.click(screen.getByRole('button', { name: /^Week 26, 2026/ }))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('moves to the next week on a swipe to the left', () => {
    const { onChange } = renderPicker()

    swipe(200, 100)

    expect(onChange).toHaveBeenCalledWith('2026-W27')
  })

  it('moves to the previous week on a swipe to the right', () => {
    const { onChange } = renderPicker()

    swipe(100, 200)

    expect(onChange).toHaveBeenCalledWith('2026-W25')
  })

  it('ignores a swipe too short to be meant as one', () => {
    const { onChange } = renderPicker()

    swipe(100, 120)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('leaves a vertical drag to the page, so scrolling never switches weeks', () => {
    const { onChange } = renderPicker()

    const target = strip()
    fireEvent(target, pointer('pointerdown', 100, 100))
    fireEvent(target, pointer('pointermove', 90, 220))
    fireEvent(target, pointer('pointerup', 90, 220))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('switches the week only once when a swipe ends on a tile', () => {
    const { onChange } = renderPicker()

    const tile = screen.getByRole('button', { name: /^Previous week/ })
    fireEvent(tile, pointer('pointerdown', 200, 0))
    fireEvent(tile, pointer('pointermove', 100, 0))
    fireEvent(tile, pointer('pointerup', 100, 0))
    fireEvent.click(tile)

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('2026-W27')
  })

  it('steps a week on the arrow keys', () => {
    const { onChange } = renderPicker()

    fireEvent.keyDown(strip(), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith('2026-W27')

    fireEvent.keyDown(strip(), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith('2026-W25')
  })

  it('steps across a year boundary', () => {
    const { onChange } = renderPicker('2026-W53')

    fireEvent.keyDown(strip(), { key: 'ArrowRight' })

    expect(onChange).toHaveBeenCalledWith('2027-W01')
  })

  it('falls back to the current week when the given one is not a week', () => {
    renderPicker('whenever')

    expect(
      screen.getByRole('button', { name: /^Week 25, 2026/ }).getAttribute('aria-current'),
    ).toBe('true')
  })

  it('announces the selected week for screen readers', () => {
    renderPicker()

    expect(screen.getByRole('status').textContent).toMatch(/^Next week, Jun 22/)
  })

  it('cannot be moved while disabled', () => {
    const onChange = vi.fn()
    render(<WeekPicker value="2026-W26" onChange={onChange} locale="en" disabled />)

    fireEvent.click(screen.getByRole('button', { name: /^Next week/ }))
    swipe(200, 100)
    fireEvent.keyDown(strip(), { key: 'ArrowRight' })

    expect(onChange).not.toHaveBeenCalled()
  })
})

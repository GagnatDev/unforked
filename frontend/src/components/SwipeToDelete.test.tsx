import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SwipeToDelete } from './SwipeToDelete'

/**
 * jsdom has no PointerEvent, but React dispatches by event *name*, so a
 * MouseEvent named `pointerdown` reaches `onPointerDown` and carries the
 * clientX/clientY the gesture reads.
 */
function pointer(type: string, x: number, y: number) {
  return new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })
}

function row() {
  return screen.getByText('Lasagne').parentElement as HTMLElement
}

function swipe(from: number, to: number, y = 0) {
  const sheet = row()
  fireEvent(sheet, pointer('pointerdown', from, y))
  fireEvent(sheet, pointer('pointermove', to, y))
  fireEvent(sheet, pointer('pointerup', to, y))
}

function offsetOf(el: HTMLElement) {
  const match = /translate3d\((-?\d+(?:\.\d+)?)px/.exec(el.style.transform)
  return match ? Math.abs(Number(match[1])) : 0
}

afterEach(() => {
  cleanup()
})

describe('SwipeToDelete', () => {
  const renderRow = (props: Partial<Parameters<typeof SwipeToDelete>[0]> = {}) => {
    const onDelete = props.onDelete ?? vi.fn()
    const onActivate = vi.fn()
    render(
      <SwipeToDelete onDelete={onDelete} deleteLabel="Delete Lasagne" {...props}>
        <button type="button" onClick={onActivate}>
          Lasagne
        </button>
      </SwipeToDelete>,
    )
    return { onDelete, onActivate }
  }

  it('keeps the row closed until it is swiped', () => {
    renderRow()

    expect(screen.getByRole('button', { name: 'Delete Lasagne' })).toBeTruthy()
    expect(offsetOf(row())).toBe(0)
  })

  it('opens the trash panel on a leftward swipe', () => {
    renderRow()

    swipe(200, 100)

    expect(offsetOf(row())).toBeGreaterThan(0)
    expect(
      screen.getByText('Lasagne').closest('[data-swipe-state]')?.getAttribute('data-swipe-state'),
    ).toBe('open')
  })

  it('snaps shut again when the swipe is too short to count', () => {
    renderRow()

    swipe(200, 185)

    expect(offsetOf(row())).toBe(0)
  })

  it('leaves a mostly-vertical drag alone so the list can scroll', () => {
    renderRow()

    const sheet = row()
    fireEvent(sheet, pointer('pointerdown', 200, 200))
    fireEvent(sheet, pointer('pointermove', 190, 140))
    fireEvent(sheet, pointer('pointerup', 190, 140))

    expect(offsetOf(sheet)).toBe(0)
  })

  it('deletes only when the revealed trash button is pressed', () => {
    const { onDelete } = renderRow()

    swipe(200, 100)
    expect(onDelete).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Lasagne' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('does not activate the row content with the tap that ends a swipe', () => {
    const { onActivate } = renderRow()

    swipe(200, 100)
    fireEvent.click(screen.getByText('Lasagne'))

    expect(onActivate).not.toHaveBeenCalled()
  })

  it('closes on the next tap instead of activating the row', () => {
    const { onActivate } = renderRow()

    swipe(200, 100)
    // The click that ends the swipe is swallowed; this is the follow-up tap.
    fireEvent.click(screen.getByText('Lasagne'))
    fireEvent.click(screen.getByText('Lasagne'))

    expect(onActivate).not.toHaveBeenCalled()
    expect(offsetOf(row())).toBe(0)

    // With the panel away, the row works normally again.
    fireEvent.click(screen.getByText('Lasagne'))
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('reveals the panel when the trash button takes keyboard focus', () => {
    renderRow()

    const trash = screen.getByRole('button', { name: 'Delete Lasagne' })
    fireEvent.focus(trash)
    expect(offsetOf(row())).toBeGreaterThan(0)

    fireEvent.blur(trash)
    expect(offsetOf(row())).toBe(0)
  })

  it('renders no delete affordance when disabled', () => {
    renderRow({ disabled: true })

    expect(screen.queryByRole('button', { name: 'Delete Lasagne' })).toBeNull()
    swipe(200, 100)
    expect(screen.getByText('Lasagne').parentElement?.style.transform).toBe('')
  })
})

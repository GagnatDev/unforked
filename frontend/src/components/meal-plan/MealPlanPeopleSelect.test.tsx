import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openOptions, selectOption } from '@/test/selectOption'
import { MealPlanPeopleSelect } from './MealPlanPeopleSelect'

function renderSelect(
  props: Partial<Parameters<typeof MealPlanPeopleSelect>[0]> = {},
) {
  const onValueChange = vi.fn()
  render(
    <MealPlanPeopleSelect
      value={null}
      onValueChange={onValueChange}
      ariaLabel="People"
      emptyLabel="—"
      {...props}
    />,
  )
  return { onValueChange, trigger: screen.getByRole('combobox', { name: 'People' }) }
}

describe('MealPlanPeopleSelect', () => {
  afterEach(() => cleanup())

  it('offers 1–10 people plus an entry that leaves the count unset', async () => {
    const { trigger } = renderSelect()

    expect(await openOptions(trigger)).toEqual([
      '—',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
    ])
  })

  it('reports the chosen head count as a number', async () => {
    const { trigger, onValueChange } = renderSelect()

    await selectOption(trigger, '4')

    expect(onValueChange).toHaveBeenCalledWith(4)
  })

  it('reports null when the empty entry is chosen', async () => {
    const { trigger, onValueChange } = renderSelect({ value: 4 })

    await selectOption(trigger, '—')

    expect(onValueChange).toHaveBeenCalledWith(null)
  })

  it('shows the current count in the trigger', () => {
    const { trigger } = renderSelect({ value: 3 })

    expect(trigger.textContent).toContain('3')
  })

  it('keeps a stored count above the offered range selectable', async () => {
    const { trigger } = renderSelect({ value: 12 })

    expect(trigger.textContent).toContain('12')
    // Sorted into place rather than appended after 10.
    expect(await openOptions(trigger)).toEqual([
      '—',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
      '12',
    ])
  })

  it('cannot be opened while disabled', () => {
    const { trigger } = renderSelect({ disabled: true })

    expect((trigger as HTMLButtonElement).disabled).toBe(true)
  })
})

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CheckboxField } from './CheckboxField'

afterEach(() => {
  cleanup()
})

describe('CheckboxField', () => {
  it('exposes the label as the checkbox accessible name', () => {
    render(<CheckboxField label="Hide checked items" checked onCheckedChange={() => {}} />)

    const box = screen.getByLabelText('Hide checked items') as HTMLInputElement
    expect(box.type).toBe('checkbox')
    expect(box.checked).toBe(true)
  })

  it('reports the next checked state on click', () => {
    const onCheckedChange = vi.fn()
    render(<CheckboxField label="Keep awake" checked={false} onCheckedChange={onCheckedChange} />)

    screen.getByLabelText('Keep awake').click()

    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('does not fire while disabled', () => {
    const onCheckedChange = vi.fn()
    render(
      <CheckboxField
        label="Keep awake"
        checked={false}
        disabled
        onCheckedChange={onCheckedChange}
      />,
    )

    screen.getByLabelText('Keep awake').click()

    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})

import { act, fireEvent, screen, within } from '@testing-library/react'
import { expect } from 'vitest'

/** Let the dropdown's effects (open state, item registration) settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

/** Open a shared Base UI `Select` and return its option labels, in order. */
export async function openOptions(trigger: HTMLElement): Promise<string[]> {
  fireEvent.click(trigger)
  await settle()
  return within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((o) => o.textContent ?? '')
}

/**
 * Pick an option from one of the shared Base UI `Select` dropdowns.
 *
 * The popup only commits a choice for the item the pointer last moved onto, so
 * a bare `click` on the option silently does nothing — move first, then click.
 */
export async function selectOption(
  trigger: HTMLElement,
  optionLabel: string,
): Promise<void> {
  fireEvent.click(trigger)
  await settle()

  const option = within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .find((o) => o.textContent === optionLabel)
  expect(option, `no option labelled "${optionLabel}"`).toBeTruthy()

  fireEvent.mouseMove(option!)
  fireEvent.pointerMove(option!, { pointerType: 'mouse' })
  await settle()
  fireEvent.click(option!)
  await settle()
}

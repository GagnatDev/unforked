import 'fake-indexeddb/auto'
import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { __resetUnsavedWorkForTests, hasUnsavedWork } from '@/lib/unsavedWork'
import { useRecipeFormState } from './useRecipeFormState'

afterEach(() => __resetUnsavedWorkForTests())

// A draft lives only in component state, so silent re-auth must know it is there.
it('holds unsaved work from the first edit until the form is left', () => {
  const { result, unmount } = renderHook(() => useRecipeFormState(undefined))
  expect(hasUnsavedWork()).toBe(false)

  act(() => result.current.update({ name: 'Soup' }))
  expect(hasUnsavedWork()).toBe(true)

  act(() => result.current.update({ servings: 6 }))
  expect(hasUnsavedWork()).toBe(true)

  unmount()
  expect(hasUnsavedWork()).toBe(false)
})

it('releases the hold once the draft is saved', () => {
  const { result } = renderHook(() => useRecipeFormState(undefined))
  act(() => result.current.update({ name: 'Soup' }))

  act(() => result.current.releaseUnsaved())
  expect(hasUnsavedWork()).toBe(false)

  // Editing again after the save re-claims it.
  act(() => result.current.update({ name: 'Stew' }))
  expect(hasUnsavedWork()).toBe(true)
})

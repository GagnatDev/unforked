import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Recipe } from '@/types'
import { __resetLocalDbForTests, listLocalRecipes, putLocalRecipe, replaceLocalRecipes } from './db'
import { useLocal } from './useLocal'

function recipe(id: string, name: string): Recipe {
  return {
    id,
    doc: {
      name,
      description: '',
      sourceUrl: null,
      sourceName: null,
      ingredients: [],
      steps: [],
      servings: 4,
      tags: [],
    },
  }
}

beforeEach(async () => {
  await __resetLocalDbForTests()
  globalThis.indexedDB = new IDBFactory()
})

describe('useLocal', () => {
  it('loads from the store and clears loading', async () => {
    await replaceLocalRecipes([recipe('r1', 'Soup')])
    const { result } = renderHook(() => useLocal(() => listLocalRecipes(), ['recipes'], []))

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toHaveLength(1)
  })

  it('re-reads when a subscribed store is written', async () => {
    await replaceLocalRecipes([])
    const { result } = renderHook(() => useLocal(() => listLocalRecipes(), ['recipes'], []))
    await waitFor(() => expect(result.current.data).toEqual([]))

    await putLocalRecipe(recipe('r1', 'Soup'))
    await waitFor(() => expect(result.current.data).toHaveLength(1))
  })

  it('does not re-read for writes to other stores', async () => {
    let reads = 0
    const { result } = renderHook(() =>
      useLocal(
        async () => {
          reads += 1
          return listLocalRecipes()
        },
        ['mealPlans'],
        [],
      ),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    const readsAfterLoad = reads

    await putLocalRecipe(recipe('r1', 'Soup'))
    // Give any (incorrect) notification a chance to run.
    await new Promise((r) => setTimeout(r, 10))
    expect(reads).toBe(readsAfterLoad)
  })

  it('re-runs the read when deps change', async () => {
    await replaceLocalRecipes([recipe('r1', 'Soup'), recipe('r2', 'Stew')])
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) =>
        useLocal(
          async () => (await listLocalRecipes())?.find((r) => r.id === id) ?? null,
          ['recipes'],
          [id],
        ),
      { initialProps: { id: 'r1' } },
    )
    await waitFor(() => expect(result.current.data?.id).toBe('r1'))

    rerender({ id: 'r2' })
    await waitFor(() => expect(result.current.data?.id).toBe('r2'))
  })

  it('returns nothing while disabled', async () => {
    await replaceLocalRecipes([recipe('r1', 'Soup')])
    const { result } = renderHook(() =>
      useLocal(() => listLocalRecipes(), ['recipes'], [], { enabled: false }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBeNull()
  })
})

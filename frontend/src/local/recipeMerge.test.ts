import { describe, expect, it } from 'vitest'
import type { RecipeDoc } from '@/types'
import { mergeRecipe } from './recipeMerge'

function doc(overrides: Partial<RecipeDoc> = {}): RecipeDoc {
  return {
    name: 'Pasta',
    description: 'tasty',
    sourceUrl: null,
    sourceName: null,
    ingredients: [{ name: 'flour', quantity: '200', unit: 'g' }],
    steps: ['mix'],
    servings: 4,
    tags: ['dinner'],
    ...overrides,
  }
}

describe('mergeRecipe', () => {
  it('keeps disjoint edits from both sides', () => {
    const base = doc()
    const ours = doc({ name: 'Pesto Pasta' }) // we renamed
    const server = doc({ servings: 8 }) // they rescaled
    const merged = mergeRecipe(base, ours, server)
    expect(merged.name).toBe('Pesto Pasta')
    expect(merged.servings).toBe(8)
  })

  it('prefers our value when we changed the same field (last writer wins)', () => {
    const base = doc({ name: 'Pasta' })
    const ours = doc({ name: 'Ours' })
    const server = doc({ name: 'Theirs' })
    expect(mergeRecipe(base, ours, server).name).toBe('Ours')
  })

  it('takes the server value for fields we did not touch', () => {
    const base = doc({ tags: ['dinner'] })
    const ours = doc({ tags: ['dinner'], name: 'Renamed' })
    const server = doc({ tags: ['dinner', 'quick'] })
    const merged = mergeRecipe(base, ours, server)
    expect(merged.tags).toEqual(['dinner', 'quick'])
    expect(merged.name).toBe('Renamed')
  })

  it('deep-compares array/object fields (unchanged arrays keep the server copy)', () => {
    const base = doc()
    const ours = doc() // identical to base — we changed nothing
    const server = doc({ ingredients: [{ name: 'water', quantity: '1', unit: 'l' }] })
    expect(mergeRecipe(base, ours, server).ingredients).toEqual(server.ingredients)
  })
})

import { describe, expect, it } from 'vitest'

import { categorizeIngredient } from './categorize'

describe('categorizeIngredient (offline heuristic)', () => {
  it('categorizes common English and Norwegian ingredients', () => {
    expect(categorizeIngredient('Tomato')).toBe('produce')
    expect(categorizeIngredient('kylling')).toBe('meat')
    expect(categorizeIngredient('Laks')).toBe('fish')
    expect(categorizeIngredient('milk')).toBe('dairy')
    expect(categorizeIngredient('brød')).toBe('bakery')
    expect(categorizeIngredient('kaffe')).toBe('beverages')
  })

  it('prefers the longest matching keyword', () => {
    expect(categorizeIngredient('coconut milk')).toBe('pantry')
    expect(categorizeIngredient('bell pepper')).toBe('produce')
  })

  it('matches short keywords only across a whole word (plural-ish suffixes ok)', () => {
    expect(categorizeIngredient('eggs')).toBe('dairy')
    expect(categorizeIngredient('tomater')).toBe('produce')
    // "te" (tea) must not fire inside an unrelated word.
    expect(categorizeIngredient('steak')).toBe('other')
  })

  it('falls back to "other" for unknown names', () => {
    expect(categorizeIngredient('unobtanium')).toBe('other')
  })
})

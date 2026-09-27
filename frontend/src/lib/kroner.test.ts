import { describe, expect, it } from 'vitest'

import { kronerInputValue, parseKroner } from './kroner'

describe('parseKroner', () => {
  it('reads whole and decimal amounts with either decimal mark', () => {
    expect(parseKroner('349')).toBe(349)
    expect(parseKroner('349,50')).toBe(349.5)
    expect(parseKroner('349.5')).toBe(349.5)
    expect(parseKroner('0')).toBe(0)
  })

  it('ignores grouping spaces and the ways a receipt writes the unit', () => {
    expect(parseKroner('1 249,50')).toBe(1249.5)
    expect(parseKroner(' 1249 ')).toBe(1249)
    expect(parseKroner('kr 349')).toBe(349)
    expect(parseKroner('349 kr')).toBe(349)
    expect(parseKroner('349,-')).toBe(349)
  })

  it('rejects anything that is not one non-negative amount', () => {
    expect(parseKroner('')).toBeNull()
    expect(parseKroner('-5')).toBeNull()
    expect(parseKroner('abc')).toBeNull()
    expect(parseKroner('1.234,56')).toBeNull()
    expect(parseKroner('12.345')).toBeNull()
    expect(parseKroner('3 + 4')).toBeNull()
  })
})

describe('kronerInputValue', () => {
  it('turns a stored amount back into something editable', () => {
    expect(kronerInputValue(undefined)).toBe('')
    expect(kronerInputValue(349)).toBe('349')
    expect(kronerInputValue(349.5)).toBe('349.5')
  })
})

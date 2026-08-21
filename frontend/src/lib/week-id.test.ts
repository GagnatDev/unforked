import { describe, expect, it } from 'vitest'
import { isWeekId, mondayOfWeekId, parseWeekId, shiftWeekId, weekIdFromDate } from './week-id'

describe('parseWeekId', () => {
  it('reads year and week', () => {
    expect(parseWeekId('2026-W03')).toEqual({ year: 2026, week: 3 })
  })

  it('rejects anything not shaped like a week id', () => {
    for (const value of ['2026-W3', '26-W03', '2026W03', 'next week', '']) {
      expect(parseWeekId(value)).toBeNull()
    }
  })
})

describe('isWeekId', () => {
  it('accepts a week id and rejects missing or malformed values', () => {
    expect(isWeekId('2026-W13')).toBe(true)
    expect(isWeekId('2026-13')).toBe(false)
    expect(isWeekId(null)).toBe(false)
    expect(isWeekId(undefined)).toBe(false)
  })
})

describe('mondayOfWeekId', () => {
  it('returns the Monday of a real ISO week', () => {
    const monday = mondayOfWeekId('2026-W13')
    expect(monday).not.toBeNull()
    expect(monday!.getDay()).toBe(1)
    expect(weekIdFromDate(monday!)).toBe('2026-W13')
  })

  it('rejects week numbers outside the ISO range', () => {
    expect(mondayOfWeekId('2026-W00')).toBeNull()
    expect(mondayOfWeekId('2026-W54')).toBeNull()
    // 2025 is a 52-week ISO year, so W53 is not a real week there.
    expect(mondayOfWeekId('2025-W53')).toBeNull()
    // 2026 is a 53-week ISO year, so W53 is.
    expect(mondayOfWeekId('2026-W53')).not.toBeNull()
  })
})

describe('shiftWeekId', () => {
  it('steps forwards and backwards within a year', () => {
    expect(shiftWeekId('2026-W13', 1)).toBe('2026-W14')
    expect(shiftWeekId('2026-W13', -1)).toBe('2026-W12')
    expect(shiftWeekId('2026-W13', 0)).toBe('2026-W13')
  })

  it('crosses the year boundary onto the right ISO week', () => {
    // 2026 is a 53-week ISO year, 2025 a 52-week one.
    expect(shiftWeekId('2026-W53', 1)).toBe('2027-W01')
    expect(shiftWeekId('2026-W01', -1)).toBe('2025-W52')
  })

  it('returns null for anything that is not a week id', () => {
    expect(shiftWeekId('next week', 1)).toBeNull()
    expect(shiftWeekId('2025-W53', 1)).toBeNull()
  })
})

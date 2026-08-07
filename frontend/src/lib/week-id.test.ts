import { describe, expect, it } from 'vitest'
import { isWeekId, mondayOfWeekId, parseWeekId, weekIdFromDate } from './week-id'

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

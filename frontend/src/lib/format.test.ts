import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatIsoDate,
  formatIsoDateTime,
  formatIsoTimeOrDateTime,
  formatWeekId,
  formatWeekRange,
} from './format'

/** 24 March 2026, 14:32 in the runner's own timezone — assertions stay TZ-safe. */
const LOCAL_AFTERNOON = new Date(2026, 2, 24, 14, 32).toISOString()

afterEach(() => {
  vi.useRealTimers()
})

describe('formatIsoDate / formatIsoDateTime', () => {
  it('formats in the given locale', () => {
    expect(formatIsoDate(LOCAL_AFTERNOON, 'en-GB')).toBe('24/03/2026')
    expect(formatIsoDateTime(LOCAL_AFTERNOON, 'en-GB')).toBe('24/03/2026, 14:32')
  })

  it('returns an empty string for a timestamp that is not a date', () => {
    expect(formatIsoDate('not-a-date', 'en')).toBe('')
    expect(formatIsoDateTime('', 'en')).toBe('')
  })
})

describe('formatIsoTimeOrDateTime', () => {
  it('shows only the time for today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 24, 18, 0))

    expect(formatIsoTimeOrDateTime(LOCAL_AFTERNOON, 'en-GB')).toBe('14:32')
  })

  it('includes the date for another day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 25, 18, 0))

    expect(formatIsoTimeOrDateTime(LOCAL_AFTERNOON, 'en-GB')).toBe('24/03/2026, 14:32')
  })

  it('returns an empty string for a timestamp that is not a date', () => {
    expect(formatIsoTimeOrDateTime('nope', 'en')).toBe('')
  })
})

describe('formatWeekId', () => {
  it('formats per language and passes through non-week-ids', () => {
    expect(formatWeekId('2026-W03', 'en')).toBe('Week 3, 2026')
    expect(formatWeekId('2026-W03', 'nb-NO')).toBe('Uke 3, 2026')
    expect(formatWeekId('whenever', 'en')).toBe('whenever')
  })
})

describe('formatWeekRange', () => {
  it('formats the days a week covers, in the given locale', () => {
    // 2026-W26 runs Monday 22 June to Sunday 28 June.
    expect(formatWeekRange('2026-W26', 'en-US')).toMatch(/^Jun 22.+28$/)
    expect(formatWeekRange('2026-W26', 'nb-NO')).toMatch(/^22\..+28\. juni$/)
  })

  it('names both months when the week straddles them', () => {
    // 2026-W36 runs Monday 31 August to Sunday 6 September.
    expect(formatWeekRange('2026-W36', 'en-US')).toMatch(/^Aug 31.+Sep 6$/)
  })

  it('falls back to the raw value when it is not a real week', () => {
    expect(formatWeekRange('whenever', 'en')).toBe('whenever')
    expect(formatWeekRange('2025-W53', 'en')).toBe('2025-W53')
  })
})

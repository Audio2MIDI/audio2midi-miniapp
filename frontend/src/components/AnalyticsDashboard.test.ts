import { describe, expect, it } from 'vitest'

import { moscowDate } from '../analyticsDate'

describe('moscowDate', () => {
  it('uses the Moscow calendar day around UTC midnight', () => {
    const lateUtc = new Date('2026-08-13T21:30:00Z')

    expect(moscowDate(0, lateUtc)).toBe('2026-08-14')
    expect(moscowDate(-6, lateUtc)).toBe('2026-08-08')
  })
})

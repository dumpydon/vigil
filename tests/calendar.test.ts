import {describe,expect,it} from 'vitest'
import {calendarWeeks,moveCalendarMonth} from '../src/utils/calendar'

describe('UTC calendar',()=>{
  it('lays out six Sunday-first weeks across month boundaries',()=>{
    const weeks=calendarWeeks('2026-10')
    expect(weeks).toHaveLength(6)
    expect(weeks.every(week=>week.length===7)).toBe(true)
    expect(weeks[0][0]).toBe('2026-09-27')
    expect(weeks[5][6]).toBe('2026-11-07')
    expect(weeks.flat().filter(day=>day.startsWith('2026-10'))).toHaveLength(31)
  })
  it('includes February 29 only in leap years',()=>{
    expect(calendarWeeks('2024-02').flat()).toContain('2024-02-29')
    expect(calendarWeeks('2026-02').flat().filter(day=>day.startsWith('2026-02'))).toHaveLength(28)
  })
  it('clamps month-end navigation and handles year changes',()=>{
    expect(moveCalendarMonth('2026-01-31',1)).toBe('2026-02-28')
    expect(moveCalendarMonth('2024-01-31',1)).toBe('2024-02-29')
    expect(moveCalendarMonth('2026-12-31',1)).toBe('2027-01-31')
    expect(moveCalendarMonth('1970-01-01',-1)).toBe('1969-12-01')
  })
})

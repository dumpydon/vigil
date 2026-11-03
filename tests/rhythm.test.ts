import {describe,expect,it} from 'vitest'
import {EASY_STREAK_TARGET,easyApplyStreak,FIRST_DAY,shiftDay,type Entry,type Snapshot} from '../shared/model'
import {rhythm,rhythmLevel,shiftMonth} from '../src/utils/rhythm'

const today='2026-11-03'
const entry=(date:string,easy:number,external=0):Entry=>({id:crypto.randomUUID(),date,easy,external,loggedAt:`${date}T12:00:00.000Z`,createdAt:`${date}T12:00:00.000Z`,updatedAt:`${date}T12:00:00.000Z`,version:1,deleted:false,backdated:false})
const snapshot=(entries:Entry[],trackingStart='2026-01-01'):Snapshot=>({entries,trackingStart,policies:[{date:FIRST_DAY,value:75}],overrides:[],revision:1,goalRevision:0,serverNow:`${today}T12:00:00.000Z`})

describe('Rhythm calendar and counts',()=>{
  it('counts exactly 90 assigned application days, including today and excluding tomorrow',()=>{
    const start=shiftDay(today,-89),data=rhythm(snapshot([entry(shiftDay(start,-1),100),entry(start,10,2),entry(today,25,22),entry(shiftDay(today,1),100)]),today)
    expect(data.start).toBe('2026-08-06')
    expect(data.total).toBe(59)
    expect(data.activeDays).toBe(2)
    expect(data.byDate.get(today)).toMatchObject({easy:25,external:22,total:47,level:4})
    expect(data.byDate.has(shiftDay(today,1))).toBe(false)
  })
  it('aggregates split entries and ignores deletions without modifying the snapshot',()=>{
    const s=snapshot([entry(today,15,8),entry(today,10,14),{...entry(today,100,100),deleted:true}]),before=structuredClone(s)
    expect(rhythm(s,today).byDate.get(today)).toMatchObject({easy:25,external:22,total:47})
    expect(s).toEqual(before)
    s.entries[1].deleted=true
    expect(rhythm(s,today).total).toBe(23)
    s.entries[0].external=9
    expect(rhythm(s,today).total).toBe(24)
  })
  it('uses assigned dates, independently of log time and display time zone',()=>{
    const s=snapshot([{...entry('2026-10-29',25,22),loggedAt:'2026-11-03T12:00:00.000Z',backdated:true}])
    const data=rhythm(s,today)
    expect(data.byDate.get('2026-10-29')?.total).toBe(47)
    expect(data.byDate.get(today)?.total).toBe(0)
    expect(data.busiest).toEqual([3]) // Thursday, Monday-first.
  })
  it('distinguishes an empty tracked day from the time before tracking began',()=>{
    const data=rhythm(snapshot([],today),today)
    expect(data).toMatchObject({total:0,activeDays:0,busiest:[],longest:{days:0,from:null,to:null}})
    expect(data.byDate.get(today)).toMatchObject({total:0,tracked:true,level:0})
    expect(data.byDate.get(shiftDay(today,-1))).toMatchObject({total:0,tracked:false,level:0})
  })
  it('keeps monthly grids separate, Monday-first, including leap days and month padding',()=>{
    const data=rhythm(snapshot([],'2024-02-01'),'2024-03-01'),feb=data.months.find(month=>month.key==='2024-02')!,march=data.months.find(month=>month.key==='2024-03')!
    expect(feb.cells.slice(0,3)).toEqual([null,null,null])
    expect(feb.cells[3]?.date).toBe('2024-02-01')
    expect(feb.cells.filter(Boolean)).toHaveLength(29)
    expect(feb.cells.find(day=>day?.date==='2024-02-29')).toBeTruthy()
    expect(march.cells.filter(Boolean).map(day=>day!.date)).toEqual(['2024-03-01'])
    expect(march.columns).toBe(1)
  })
  it('loads six months initially, with older records available in additional six-month batches',()=>{
    const s=snapshot([entry('2023-03-12',1)],'2023-03-01'),data=rhythm(s,today)
    expect(data.months[0].key).toBe('2026-06')
    expect(data.months.at(-1)?.key).toBe('2026-11')
    expect(data.months).toHaveLength(6)
    expect(data.hasEarlier).toBe(true)
    expect(data.visibleMonths).toBe(4)
    expect(data.visibleColumns).toBe(17)
    const twelve=rhythm(s,today,12),eighteen=rhythm(s,today,18),older=rhythm(s,today,48)
    expect(twelve.months).toHaveLength(12)
    expect(twelve.months[0].key).toBe('2025-12')
    expect(eighteen.months).toHaveLength(18)
    expect(eighteen.months[0].key).toBe('2025-06')
    expect(older.byDate.get('2023-03-12')?.total).toBe(1)
    expect(twelve.total).toBe(data.total)
    expect(twelve.longest).toEqual(data.longest)
    expect(twelve.visibleColumns).toBe(data.visibleColumns)
    expect(twelve.busiest).toEqual(data.busiest)
    expect(s.entries).toHaveLength(1)
  })
  it('handles month/year rollover and does not generate dates before the supported epoch',()=>{
    expect(shiftMonth('2026-01',-1)).toBe('2025-12')
    expect(shiftMonth('2026-12',1)).toBe('2027-01')
    const data=rhythm(snapshot([],FIRST_DAY),FIRST_DAY)
    expect(data.start).toBe(FIRST_DAY)
    expect([...data.byDate.keys()]).toEqual([FIRST_DAY])
    expect(data.hasEarlier).toBe(false)
    expect(rhythm(snapshot([],FIRST_DAY),'1970-03-01',12).months).toHaveLength(3)
    expect(rhythm(snapshot([],FIRST_DAY),'1970-03-01',12).hasEarlier).toBe(false)
  })
  it('finds the busiest weekday by total applications and reports ties honestly',()=>{
    const data=rhythm(snapshot([entry('2026-10-26',20,10),entry('2026-11-02',5,5),entry('2026-10-29',25,15)]),today)
    expect(data.weekdayTotals[0]).toBe(40)
    expect(data.weekdayTotals[3]).toBe(40)
    expect(data.busiest).toEqual([0,3])
  })
})

describe('Rhythm uses the Home Easy Apply streak rule',()=>{
  it('qualifies at exactly 20 Easy Applies and ignores external counts and daily goals',()=>{
    const s=snapshot([entry('2026-10-29',20),entry('2026-10-30',20,100),entry('2026-10-31',19,100),entry('2026-11-01',20),entry('2026-11-02',20),entry(today,12)])
    s.policies=[{date:FIRST_DAY,value:1}]
    expect(EASY_STREAK_TARGET).toBe(20)
    expect(rhythm(s,today).longest).toEqual({days:2,from:'2026-11-01',to:'2026-11-02'})
    expect(easyApplyStreak(s,today).days).toBe(2)
    s.entries.push(entry(today,8))
    expect(rhythm(s,today).longest.days).toBe(3)
    expect(easyApplyStreak(s,today).days).toBe(3)
  })
  it('breaks on missing calendar days and recalculates after undo or edits',()=>{
    const s=snapshot([entry('2026-10-29',20),entry('2026-10-31',20),entry('2026-11-01',20),entry('2026-11-02',20)])
    expect(rhythm(s,today).longest.days).toBe(3)
    s.entries[2].deleted=true
    expect(rhythm(s,today).longest.days).toBe(1)
    s.entries[2].deleted=false;s.entries[1].easy=19
    expect(rhythm(s,today).longest).toMatchObject({days:2,from:'2026-11-01',to:'2026-11-02'})
  })
  it('retains a longest streak older than the visible 90 days and ignores future records',()=>{
    const start='2025-10-01',s=snapshot(Array.from({length:120},(_,i)=>entry(shiftDay(start,i),20)),start)
    s.entries.push(entry(shiftDay(today,1),100))
    expect(rhythm(s,today).longest).toMatchObject({days:120,from:start,to:shiftDay(start,119)})
    expect(rhythm(s,today).total).toBe(0)
  })
})

describe('stable activity color bands',()=>{
  it.each([[0,0],[1,1],[9,1],[10,2],[19,2],[20,3],[39,3],[40,4],[10000,4]])('%i applications uses band %i',(total,level)=>{
    expect(rhythmLevel(total)).toBe(level)
  })
})

import { describe,expect,it } from 'vitest'
import { percentageChange,periodSummary, type PeriodId } from '../shared/periods'
import { shiftDay,type Entry,type Snapshot } from '../shared/model'
import { project,type QueueRecord } from '../src/data/store'

const today='2026-10-08',now=new Date(`${today}T12:00:00.000Z`)
const entry=(date:string,easy:number,external=0):Entry=>({id:crypto.randomUUID(),date,easy,external,loggedAt:today+'T10:00:00.000Z',createdAt:today+'T10:00:00.000Z',updatedAt:today+'T10:00:00.000Z',version:1,deleted:false,backdated:date!==today})
function snapshot(entries:Entry[]=[],at=now):Snapshot{return {entries,trackingStart:'2025-12-01',serverNow:at.toISOString(),policies:[{date:'1970-01-01',value:75}],overrides:[],revision:0,goalRevision:0}}
const row=(s:Snapshot,id:PeriodId,at=now)=>periodSummary(s,at).rows.find(r=>r.id===id)!
const fixture=snapshot([
  entry(shiftDay(today,-61),777),entry(shiftDay(today,-60),100,50),entry(shiftDay(today,-31),20,10),
  entry(shiftDay(today,-30),30,15),entry(shiftDay(today,-15),15,5),entry(shiftDay(today,-14),8,2),
  entry(shiftDay(today,-8),4,1),entry(shiftDay(today,-7),7,3),entry(shiftDay(today,-2),20,10),
  entry(shiftDay(today,-1),45,20),entry(today,5,3),entry(shiftDay(today,1),99,99),
  {...entry(shiftDay(today,-1),100,100),deleted:true},
])

describe('fixed UTC application periods',()=>{
  it('uses completed-day windows with exact inclusive/exclusive boundaries and category sums',()=>{
    const before=structuredClone(fixture),rows=periodSummary(fixture,now).rows
    expect(rows.map(r=>r.label)).toEqual(['Today · so far','Yesterday','Last 7 days','Last 30 days','This month'])
    expect(rows.map(r=>r.current.counts?.total)).toEqual([8,65,105,185,113])
    expect(rows[0].current).toMatchObject({start:'2026-10-08T00:00:00.000Z',end:now.toISOString(),endInclusive:true,counts:{easy:5,external:3,total:8}})
    expect(rows[1].comparison?.previous).toMatchObject({start:'2026-10-06T00:00:00.000Z',end:'2026-10-07T00:00:00.000Z',counts:{total:30}})
    expect(rows[2].current).toMatchObject({start:'2026-10-01T00:00:00.000Z',end:'2026-10-08T00:00:00.000Z',endInclusive:false,counts:{easy:72,external:33,total:105}})
    expect(rows[2].comparison?.previous).toMatchObject({start:'2026-09-24T00:00:00.000Z',end:'2026-10-01T00:00:00.000Z',counts:{total:15}})
    expect(rows[3].current.start).toBe('2026-09-08T00:00:00.000Z')
    expect(rows[3].comparison?.previous).toMatchObject({start:'2026-08-09T00:00:00.000Z',end:'2026-09-08T00:00:00.000Z',counts:{total:180}})
    expect(rows[1].comparison?.change).toEqual({kind:'increase',text:'117%'})
    expect(rows[2].comparison?.change).toEqual({kind:'increase',text:'600%'})
    expect(rows[3].comparison?.change).toEqual({kind:'increase',text:'3%'})
    expect(rows[0].comparison).toBeUndefined();expect(rows[4].comparison).toBeUndefined()
    expect(fixture).toEqual(before)
  })
  it('rolls periods at UTC midnight, including local times with an India offset',()=>{
    const before=new Date('2026-10-08T05:29:59.999+05:30'),after=new Date('2026-10-08T05:30:00+05:30')
    expect(row(fixture,'today',before).current.counts?.total).toBe(65)
    expect(row(fixture,'today',after).current.counts?.total).toBe(8)
    expect(row(fixture,'week',before).current.counts?.total).toBe(45)
    expect(row(fixture,'week',after).current.counts?.total).toBe(105)
  })
  it('uses assigned application dates, excludes deleted records, and treats empty tracked days as genuine zero',()=>{
    const s=snapshot([entry('2026-10-07',4,6),{...entry(today,50),deleted:true}])
    expect(row(s,'today').current.counts?.total).toBe(0)
    expect(row(s,'yesterday').current.counts).toEqual({easy:4,external:6,total:10})
    expect(row(snapshot(),'week').comparison?.change).toEqual({kind:'same',text:'0%'})
  })
  it('marks partial tracking history and never calculates changes from missing history as zero',()=>{
    const s={...fixture,trackingStart:'2026-10-03',entries:fixture.entries.filter(e=>e.date>='2026-10-03')}
    expect(row(s,'week').current).toMatchObject({historyComplete:false,counts:{total:95}})
    expect(row(s,'week').comparison).toMatchObject({change:{kind:'unavailable',text:'—',reason:'not-enough-history'},previous:{counts:null,unavailableReason:'not-enough-history'}})
    expect(row(s,'month30').comparison?.change.reason).toBe('not-enough-history')
    expect(row(s,'yesterday').comparison?.change.kind).toBe('increase')
    expect(periodSummary(s,now).pace).toBeNull()
    const first={...snapshot(),trackingStart:today}
    expect(row(first,'today').current.counts?.total).toBe(0)
    expect(row(first,'yesterday').current.counts).toBeNull()
    expect(row(first,'yesterday').comparison?.change.reason).toBe('not-enough-history')
  })
  it('shows unavailable instead of false zeros for dates newer than a cached full snapshot',()=>{
    const s={...snapshot([entry('2026-10-06',20,10)]),serverNow:'2026-10-06T23:59:59.000Z'}
    expect(row(s,'today').current).toMatchObject({counts:null,unavailableReason:'data-unavailable'})
    expect(row(s,'yesterday').comparison).toMatchObject({previous:{counts:{total:30}},change:{kind:'unavailable',text:'—',reason:'data-unavailable'}})
    expect(row(s,'week').current.counts).toBeNull();expect(row(s,'month').current.counts).toBeNull()
    expect(periodSummary(s,now).pace).toBeNull()
    expect(row({...s,serverNow:'invalid'},'month30').comparison?.change.reason).toBe('data-unavailable')
  })
  it('retains available cached history from earlier today',()=>{
    const s={...snapshot([entry(today,2,3)]),serverNow:'2026-10-08T00:01:00.000Z'}
    expect(row(s,'today').current.counts?.total).toBe(5)
    expect(row(s,'week').comparison?.change).toEqual({kind:'same',text:'0%'})
  })
})

describe('small and zero-baseline changes',()=>{
  it.each([
    [120,100,'increase','20%'],[80,100,'decrease','20%'],[100,100,'same','0%'],
    [0,0,'same','0%'],[4,0,'new','New'],[1001,1000,'increase','<1%'],
    [999,1000,'decrease','<1%'],[101,100,'increase','1%'],[0,5,'decrease','100%'],
  ])('formats %i vs %i as %s %s',(current,previous,kind,text)=>expect(percentageChange(Number(current),Number(previous))).toEqual({kind,text}))
})

describe('fractional UTC monthly pace',()=>{
  it.each([
    ['2024-02-15T12:00:00.000Z',290],['2023-02-15T12:00:00.000Z',280],
    ['2026-04-15T12:00:00.000Z',300],['2026-12-15T12:00:00.000Z',310],
  ])('uses the correct UTC month length at %s',(stamp,expected)=>{
    const at=new Date(stamp),s={...snapshot([entry(stamp.slice(0,8)+'01',100,45)],at),trackingStart:'2020-01-01'}
    expect(periodSummary(s,at).pace).toBe(expected)
  })
  it('omits pace until a full UTC day has elapsed and resets at a month/year boundary',()=>{
    const at=new Date('2024-02-01T23:59:59.000Z'),s={...snapshot([entry('2024-02-01',10)],new Date('2024-02-02T00:00:00.000Z')),trackingStart:'2020-01-01'}
    expect(periodSummary(s,at).pace).toBeNull()
    expect(periodSummary(s,new Date('2024-02-02T00:00:00.000Z')).pace).toBe(290)
    const january=new Date('2027-01-01T00:00:00.000Z'),next={...snapshot([entry('2026-12-31',10)],january),trackingStart:'2020-01-01'}
    expect(row(next,'month',january).current.counts?.total).toBe(0)
    expect(row(next,'yesterday',january).current.counts?.total).toBe(10)
    expect(periodSummary(next,january).pace).toBeNull()
  })
})

describe('dashboard optimistic data projection',()=>{
  const queued=(operation:QueueRecord['operation'],sequence:number):QueueRecord=>({operation,sequence,status:'pending'})
  it('updates summaries after additions, edits, assigned-date moves and Undo without mutating the base',()=>{
    const base=snapshot(),e=entry(today,10,5),create=queued({id:crypto.randomUUID(),type:'create',entry:e},1)
    const added=project(base,[create]);expect(row(added,'today').current.counts?.total).toBe(15)
    const edit=queued({id:crypto.randomUUID(),type:'update',entryId:e.id,expectedVersion:1,date:'2026-10-07',easy:4,external:2},2)
    const edited=project(base,[create,edit]);expect(row(edited,'today').current.counts?.total).toBe(0)
    expect(row(edited,'yesterday').current.counts?.total).toBe(6);expect(row(edited,'week').comparison?.change.kind).toBe('new')
    const undo=queued({id:crypto.randomUUID(),type:'delete',entryId:e.id,expectedVersion:2},3)
    const undone=project(base,[create,edit,undo]);expect(row(undone,'yesterday').current.counts?.total).toBe(0)
    expect(row(undone,'week').comparison?.change.kind).toBe('same');expect(base.entries).toEqual([])
  })
  it('does not double-count a server-acknowledged create and reflects reconciled edits',()=>{
    const e=entry('2026-10-07',10,5),base=snapshot([e]),create=queued({id:crypto.randomUUID(),type:'create',entry:e},1)
    expect(row(project(base,[create]),'yesterday').current.counts?.total).toBe(15)
    const reconciled={...base,entries:[{...e,easy:20,external:5,version:2}],revision:2}
    expect(row(project(reconciled,[]),'yesterday').current.counts?.total).toBe(25)
  })
})

import 'fake-indexeddb/auto'
import {afterEach,describe,expect,it} from 'vitest'
import {FIRST_DAY,shiftDay,type Entry,type Snapshot} from '../shared/model'
import {momentumSummary} from '../src/utils/momentum'
import {LocalWorkspace} from '../src/data/local-workspace'
import {SyncEngine} from '../src/data/store'

const today='2026-11-02'
const entry=(date:string,easy:number,external=0):Entry=>({id:crypto.randomUUID(),date,easy,external,loggedAt:`${date}T12:00:00.000Z`,createdAt:`${date}T12:00:00.000Z`,updatedAt:`${date}T12:00:00.000Z`,deleted:false,backdated:false,version:1})
const snapshot=(entries:Entry[]=[],trackingStart='2026-09-01'):Snapshot=>({entries,trackingStart,policies:[{date:FIRST_DAY,value:75}],overrides:[],revision:1,goalRevision:0,serverNow:`${today}T12:00:00.000Z`})

describe('inclusive rolling momentum',()=>{
  it('matches 60 previous applications plus 17 today = 11 per day, then 24 today = 12 per day',()=>{
    const data=snapshot([entry(shiftDay(today,-3),60),entry(today,17)])
    expect(momentumSummary(data,today).seven).toEqual({start:'2026-10-27',end:today,days:7,total:77,average:11})
    const increased={...data,entries:[data.entries[0],{...data.entries[1],easy:24}]}
    expect(momentumSummary(increased,today).seven).toMatchObject({total:84,average:12})
  })
  it('includes exactly today and the preceding 6 or 29 dates, counting both categories',()=>{
    const data=snapshot([
      entry(shiftDay(today,-31),1000),entry(shiftDay(today,-30),700),
      entry(shiftDay(today,-29),20,10),entry(shiftDay(today,-7),9,1),
      entry(shiftDay(today,-6),3,4),entry(shiftDay(today,-1),8,2),entry(today,6,1),
      entry(shiftDay(today,1),999),{...entry(today,500),deleted:true},
    ])
    const before=structuredClone(data),summary=momentumSummary(data,today)
    expect(summary.yesterday).toBe(10)
    expect(summary.seven).toMatchObject({total:24,average:24/7})
    expect(summary.thirty).toEqual({start:'2026-10-04',end:today,days:30,total:64,average:64/30})
    expect(summary.allTime).toBe(1764)
    expect(data).toEqual(before)
  })
  it('counts zero-entry days in the fixed denominator, including a newly started history',()=>{
    expect(momentumSummary(snapshot(),today)).toMatchObject({yesterday:0,seven:{total:0,average:0},thirty:{total:0,average:0},allTime:0})
    const summary=momentumSummary(snapshot([entry(today,7)],today),today)
    expect(summary.seven.average).toBe(1)
    expect(summary.thirty.average).toBe(7/30)
  })
  it('rolls correctly at month/year boundaries, including leap days',()=>{
    expect(momentumSummary(snapshot(), '2027-01-01').seven.start).toBe('2026-12-26')
    expect(momentumSummary(snapshot(), '2027-01-01').thirty.start).toBe('2026-12-03')
    expect(momentumSummary(snapshot(), '2028-03-01').seven.start).toBe('2028-02-24')
    const data=snapshot([entry('2026-11-02',17),entry('2026-10-27',7)])
    expect(momentumSummary(data,'2026-11-03')).toMatchObject({yesterday:17,seven:{total:17,average:17/7},allTime:24})
  })
  it('uses saved application dates for backdated entries and excludes deleted entries',()=>{
    const data=snapshot([{...entry(shiftDay(today,-15),5,2),loggedAt:`${today}T12:00:00.000Z`,backdated:true},{...entry(today,15),deleted:true}])
    expect(momentumSummary(data,today)).toMatchObject({yesterday:0,seven:{total:0,average:0},thirty:{total:7},allTime:7})
  })
})

const engines:SyncEngine[]=[],workspaces:LocalWorkspace[]=[]
afterEach(async()=>{for(const engine of engines.splice(0))engine.dispose();for(const workspace of workspaces.splice(0))await workspace.close()})
describe('immediate averages from the durable queue',()=>{
  it('updates before sync for both quick categories, undo, and reopening retained offline changes',async()=>{
    const clock=()=>new Date(`${today}T12:00:00.000Z`),workspace=new LocalWorkspace(crypto.randomUUID(),clock);workspaces.push(workspace)
    let online=true,calls=0
    const fetcher:typeof fetch=(input,init)=>{calls++;return workspace.fetcher(input,init)}
    const options={name:crypto.randomUUID(),clock,fetcher,online:()=>online,broadcast:false,autoRetry:false}
    const engine=new SyncEngine(options);engines.push(engine);await engine.init()
    await engine.createEntry(60,0,shiftDay(today,-3));await engine.sync()
    online=false;const priorCalls=calls
    const read=()=>momentumSummary(engine.getState().snapshot!,today)
    await engine.createEntry(17,0)
    expect(read().seven).toMatchObject({total:77,average:11})
    const extra=await engine.createEntry(0,7)
    expect(read().seven).toMatchObject({total:84,average:12})
    expect(read().thirty).toMatchObject({total:84,average:2.8})
    if(extra?.type!=='create')throw new Error('Expected a retained quick addition')
    await engine.deleteEntry(extra.entry.id)
    expect(read().seven).toMatchObject({total:77,average:11})
    expect(read().allTime).toBe(77)
    expect(calls).toBe(priorCalls)
    expect(engine.getState().queue).toHaveLength(3)
    const reopened=new SyncEngine(options);engines.push(reopened);await reopened.init(false)
    expect(momentumSummary(reopened.getState().snapshot!,today)).toEqual(read())
    online=true;await reopened.sync()
    expect(reopened.getState().queue).toHaveLength(0)
    expect(momentumSummary(reopened.getState().snapshot!,today)).toEqual(read())
  })
})

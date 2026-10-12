import 'fake-indexeddb/auto'
import {openDB} from 'idb'
import {afterEach,describe,expect,it} from 'vitest'
import {FIRST_DAY,shiftDay,utcDay,type Entry,type Snapshot} from '../shared/model'
import {AlertsStore} from '../src/data/alerts'
import {SyncEngine} from '../src/data/store'
import {alertSnapshotNeedsRefresh,emptyInbox,pruneAlerts,reconcileAlerts,type AlertInbox} from '../src/utils/notifications'

const morning=new Date('2026-10-14T09:00:00.000Z')
function entry(day:string,total:number):Entry{
  const stamp=day+'T08:00:00.000Z'
  return {id:crypto.randomUUID(),date:day,easy:total,external:0,loggedAt:stamp,createdAt:stamp,updatedAt:stamp,version:1,deleted:false,backdated:false}
}
function snapshot(now=morning,total=0):Snapshot{
  return {entries:[entry(utcDay(now),total)],policies:[{date:FIRST_DAY,value:75}],overrides:[],trackingStart:'2026-10-01',revision:1,goalRevision:0,serverNow:now.toISOString()}
}

describe('quiet alert policy',()=>{
  it('refreshes saved counts before idle sessions become too stale for scheduled alerts',()=>{
    const data=snapshot()
    expect(alertSnapshotNeedsRefresh(data,new Date('2026-10-14T09:09:59.999Z'))).toBe(false)
    expect(alertSnapshotNeedsRefresh(data,new Date('2026-10-14T09:10:00.000Z'))).toBe(true)
    expect(alertSnapshotNeedsRefresh(data,new Date('2026-10-14T13:00:00.000Z'))).toBe(true)
    data.serverNow='invalid'
    expect(alertSnapshotNeedsRefresh(data,morning)).toBe(true)
  })
  it('refreshes on UTC rollover even when the previous-day counts were recently saved',()=>{
    const midnight=new Date('2026-10-15T00:01:00.000Z'),data=snapshot(midnight)
    data.serverNow='2026-10-14T23:59:00.000Z'
    expect(alertSnapshotNeedsRefresh(data,midnight)).toBe(true)
    expect(reconcileAlerts(emptyInbox(),data,midnight,10).items).toHaveLength(0)
    data.serverNow=midnight.toISOString()
    expect(alertSnapshotNeedsRefresh(data,midnight)).toBe(false)
    expect(reconcileAlerts(emptyInbox(),data,midnight,10).items).toHaveLength(1)
  })
  it('creates one daily overview and does not repeat it on refresh',()=>{
    const first=reconcileAlerts(emptyInbox(),snapshot(),morning,10)
    expect(first.items.map(item=>item.kind)).toEqual(['overview'])
    expect(reconcileAlerts(first,snapshot(),morning,10)).toBe(first)
  })
  it('celebrates the goal once without a refresh-time burst',()=>{
    const first=reconcileAlerts(emptyInbox(),snapshot(),morning,10)
    const reached=reconcileAlerts(first,snapshot(morning,75),morning,10)
    expect(reached.items.map(item=>item.kind)).toEqual(['goal','overview'])
    expect(reconcileAlerts(reached,snapshot(morning,100),morning,10)).toBe(reached)
    expect(reconcileAlerts(emptyInbox(),snapshot(morning,75),morning,10).items.map(item=>item.kind)).toEqual(['goal'])
  })
  it('sends an evening check-in only after four hours, without a first-open burst',()=>{
    const first=reconcileAlerts(emptyInbox(),snapshot(),morning,10)
    const early=new Date('2026-10-14T12:00:00.000Z'),evening=new Date('2026-10-14T14:00:00.000Z')
    expect(reconcileAlerts(first,snapshot(early,20),early,18)).toBe(first)
    const reminder=reconcileAlerts(first,snapshot(evening,20),evening,19)
    expect(reminder.items[0].kind).toBe('reminder')
    expect(reminder.items[0].detail).toContain('55 left')
    const reached=reconcileAlerts(reminder,snapshot(evening,75),evening,19)
    expect(reached.items.map(item=>item.kind)).toEqual(['goal','reminder','overview'])
    const late=new Date('2026-10-14T18:00:00.000Z')
    expect(reconcileAlerts(reached,snapshot(late,100),late,20)).toBe(reached)
    expect(reconcileAlerts(emptyInbox(),snapshot(evening),evening,19).items).toHaveLength(1)
  })
  it('caps the rolling week at twenty-one even after the inbox is cleared',()=>{
    const receipts=Array.from({length:7},(_,index)=>shiftDay(utcDay(morning),-index-1)).flatMap(day=>[10,14,18].map(hour=>({id:`saved:${day}:${hour}`,createdAt:`${day}T${hour}:00:00.000Z`})))
    const inbox:AlertInbox={...emptyInbox(),receipts}
    expect(reconcileAlerts(inbox,snapshot(),morning,10).items).toHaveLength(0)
    const tomorrow=new Date('2026-10-15T09:00:00.000Z')
    expect(reconcileAlerts(inbox,snapshot(tomorrow),tomorrow,10).items).toHaveLength(1)
  })
  it('spaces routine progress updates and reserves the third daily slot for completion',()=>{
    const first=reconcileAlerts(emptyInbox(),snapshot(),morning,10)
    const soon=new Date('2026-10-14T09:01:00.000Z'),later=new Date('2026-10-14T11:00:00.000Z')
    expect(reconcileAlerts(first,snapshot(soon,38),soon,10)).toBe(first)
    const halfway=reconcileAlerts(first,snapshot(later,38),later,12)
    expect(halfway.items[0]).toMatchObject({kind:'halfway',detail:'38 of 75 logged · 37 left'})
    const evening=new Date('2026-10-14T15:00:00.000Z')
    expect(reconcileAlerts(halfway,snapshot(evening,50),evening,19)).toBe(halfway)
    expect(reconcileAlerts(halfway,snapshot(evening,75),evening,19).items.map(item=>item.kind)).toEqual(['goal','halfway','overview'])
    expect(reconcileAlerts(emptyInbox(),snapshot(later,38),later,12).items.map(item=>item.kind)).toEqual(['halfway'])
  })
  it('replaces completion with one streak celebration using historical day goals',()=>{
    const data=snapshot(morning,75)
    data.entries.push(entry('2026-10-13',50),entry('2026-10-12',75))
    data.overrides=[{date:'2026-10-13',value:50}]
    const streak=reconcileAlerts(emptyInbox(),data,morning,10)
    expect(streak.items[0]).toMatchObject({kind:'streak',id:'goal:2026-10-14',title:'3-day goal streak'})
    expect(reconcileAlerts(streak,data,morning,10)).toBe(streak)
    data.overrides=[]
    expect(reconcileAlerts(emptyInbox(),data,morning,10).items[0].kind).toBe('goal')
  })
  it('celebrates a comeback only after two tracked quiet days and earlier activity',()=>{
    const data=snapshot(morning,1);data.entries.push(entry('2026-10-11',10))
    expect(reconcileAlerts(emptyInbox(),data,morning,10).items[0].kind).toBe('comeback')
    data.entries.push(entry('2026-10-13',1))
    expect(reconcileAlerts(emptyInbox(),data,morning,10).items[0].kind).toBe('overview')
    expect(reconcileAlerts(emptyInbox(),snapshot(morning,1),morning,10).items[0].kind).toBe('overview')
  })
  it('reports a best completed day after enough prior history and excludes today',()=>{
    const data=snapshot();data.entries.push(entry('2026-10-13',90),entry('2026-10-12',80))
    expect(reconcileAlerts(emptyInbox(),data,morning,10).items[0]).toMatchObject({kind:'record',detail:'90 applications · previous best 80'})
    data.trackingStart='2026-10-12'
    expect(reconcileAlerts(emptyInbox(),data,morning,10).items[0].kind).toBe('overview')
  })
  it('reports only the highest total milestone crossed today and does not repeat tomorrow',()=>{
    const data=snapshot(morning,35);data.entries.push(entry('2026-10-13',480),entry('2026-10-12',600))
    // Before today is already 1,080: historical milestones are not replayed.
    expect(reconcileAlerts(emptyInbox(),data,morning,10).items[0].kind).toBe('overview')
    data.entries=data.entries.filter(item=>item.date!=='2026-10-12')
    const milestone=reconcileAlerts(emptyInbox(),data,morning,10)
    expect(milestone.items[0]).toMatchObject({kind:'milestone',title:'500 applications logged',detail:'515 total · 35 today'})
    const tomorrow=new Date('2026-10-15T09:00:00.000Z')
    expect(reconcileAlerts(emptyInbox(),{...data,serverNow:tomorrow.toISOString()},tomorrow,10).items[0].kind).not.toBe('milestone')
    data.entries=[entry('2026-10-13',50),entry('2026-10-14',1_000)]
    const initial=reconcileAlerts(emptyInbox(),data,morning,10),later=new Date('2026-10-14T11:00:00.000Z')
    const result=reconcileAlerts(initial,{...data,serverNow:later.toISOString()},later,12)
    expect(result.items[0]).toMatchObject({kind:'milestone',title:'1,000 applications logged'})
  })
  it('uses a completed-week recap on Monday instead of an extra daily overview',()=>{
    const monday=new Date('2026-10-12T09:00:00.000Z'),data=snapshot(monday)
    data.entries=Array.from({length:7},(_,index)=>entry(shiftDay(utcDay(monday),-index-1),75))
    const result=reconcileAlerts(emptyInbox(),data,monday,10)
    expect(result.items[0]).toMatchObject({kind:'weekly',tone:'success',detail:'525 applications · 7/7 goals met'})
    data.trackingStart='2026-10-09'
    expect(reconcileAlerts(emptyInbox(),data,monday,10).items[0].kind).toBe('overview')
  })
  it('does not manufacture alerts from a stale or previous-day snapshot',()=>{
    const stale=snapshot();stale.serverNow='2026-10-14T08:00:00.000Z'
    expect(reconcileAlerts(emptyInbox(),stale,morning,10).items).toHaveLength(0)
    stale.serverNow='2026-10-13T23:59:00.000Z'
    expect(reconcileAlerts(emptyInbox(),stale,morning,10).items).toHaveLength(0)
  })
  it('pauses for today without suppressing the next UTC day',()=>{
    const paused={...emptyInbox(),pausedOn:utcDay(morning)}
    expect(reconcileAlerts(paused,snapshot(),morning,10).items).toHaveLength(0)
    const tomorrow=new Date('2026-10-15T09:00:00.000Z')
    expect(reconcileAlerts(paused,snapshot(tomorrow),tomorrow,10).items).toHaveLength(1)
  })
  it('expires read and unread alerts and their receipts after fifteen days',()=>{
    const first=reconcileAlerts(emptyInbox(),snapshot(),morning,10)
    const expires=new Date('2026-10-29T09:00:00.000Z')
    expect(pruneAlerts(first,expires)).toBe(first)
    const expired=new Date(expires.getTime()+1)
    expect(pruneAlerts(first,expired)).toEqual(emptyInbox())
    first.items[0].readAt=morning.toISOString()
    expect(pruneAlerts(first,expired)).toEqual(emptyInbox())
  })
})

const stores:AlertsStore[]=[]
const engines:SyncEngine[]=[]
afterEach(()=>{for(const store of stores.splice(0))store.dispose();for(const engine of engines.splice(0))engine.dispose()})
async function store(name=crypto.randomUUID(),clock=()=>morning){
  const cache=new SyncEngine({name,broadcast:false,autoRetry:false})
  engines.push(cache);await cache.init(false)
  const value=new AlertsStore({storage:cache,broadcast:false,clock});stores.push(value);await value.init();return value
}
describe('durable alert inbox',()=>{
  it('preserves read state after reload and never regenerates cleared alerts',async()=>{
    const name=crypto.randomUUID(),first=await store(name)
    await first.generate(snapshot(),morning,10)
    const id=first.getState().items[0].id
    await first.markRead(id,morning)
    const reopened=await store(name)
    expect(reopened.getState().items[0].readAt).toBe(morning.toISOString())
    await reopened.generate(snapshot(morning,75),morning,10)
    await reopened.clearRead();await reopened.generate(snapshot(),morning,10)
    expect(reopened.getState().items.map(item=>item.kind)).toEqual(['goal'])
    expect(reopened.getState().items[0].readAt).toBeNull()
  })
  it('serializes simultaneous tabs and shares Read all changes',async()=>{
    const name=crypto.randomUUID(),one=await store(name),two=await store(name)
    await Promise.all([one.generate(snapshot(),morning,10),two.generate(snapshot(),morning,10)])
    await one.refresh();await two.refresh()
    expect(one.getState().items).toHaveLength(1);expect(two.getState().items).toHaveLength(1)
    await one.readAll(morning);await two.refresh()
    expect(two.getState().items.every(item=>item.readAt===morning.toISOString())).toBe(true)
  })
  it('persists a pause and resumes without duplicate events',async()=>{
    const name=crypto.randomUUID(),one=await store(name)
    await one.togglePause(utcDay(morning));await one.generate(snapshot(),morning,10)
    expect(one.getState().items).toHaveLength(0)
    const two=await store(name)
    expect(two.getState().pausedOn).toBe(utcDay(morning))
    await two.togglePause(utcDay(morning));await two.generate(snapshot(),morning,10);await two.generate(snapshot(),morning,10)
    expect(two.getState().items).toHaveLength(1)
  })
  it('prunes on offline refresh and reload, using only the existing metadata store',async()=>{
    const name=crypto.randomUUID();let now=morning
    const one=await store(name,()=>now),data=snapshot()
    const db=await openDB(name)
    await db.put('meta',data,'snapshot')
    await one.generate(data,morning,10)
    expect(db.version).toBe(1)
    expect([...db.objectStoreNames]).toEqual(['meta','queue'])
    expect(await db.get('meta','snapshot')).toEqual(data)
    now=new Date('2026-10-30T09:00:00.000Z')
    await one.refresh()
    expect(one.getState().items).toHaveLength(0)
    expect(await db.get('meta','ui.alerts.v1')).toEqual(emptyInbox())
    await one.generate(snapshot(now),now,10)
    now=new Date('2026-11-15T09:00:00.000Z')
    const reopened=await store(name,()=>now)
    expect(reopened.getState().items).toHaveLength(0)
    expect(await db.get('meta','snapshot')).toEqual(data)
    db.close()
  })
})

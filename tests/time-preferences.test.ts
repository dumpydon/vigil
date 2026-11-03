import {describe,expect,it,vi} from 'vitest'
import {analytics,FIRST_DAY,makeBackup,type Entry,type Snapshot} from '../shared/model'
import {TimePreferencesStore,TIME_PREFERENCES_KEY} from '../src/data/time-preferences'
import {availableTimeZones,clockTime,DEFAULT_TIME_PREFERENCES,hourClock,hourlyInZone,normalizeTimeZone,readTimePreferences,timestampLabel,zonedDay,zonedHour,zoneLabel,zoneOffset} from '../src/utils/time'
import {alertTime} from '../src/utils/notifications'

const india={timeZone:'Asia/Kolkata',clockFormat:'12h'} as const
const stamp='2026-10-31T17:43:00.000Z'
function memory(initial:string|null=null){
  const values=new Map<string,string>(initial?[[TIME_PREFERENCES_KEY,initial]]:[])
  return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}}
}

describe('time display',()=>{
  it('defaults to India and AM/PM regardless of the device time zone',()=>{
    expect(readTimePreferences(null)).toEqual(india)
    expect(clockTime(stamp)).toBe('11:13 PM')
    expect(timestampLabel(stamp)).toBe('Oct 31, 2026, 11:13 PM IST (GMT+05:30)')
    expect(zoneLabel(india.timeZone)).toBe('IST')
  })
  it.each(['IST','India','Asia/Calcutta','asia/kolkata','GMT+5:30','UTC+05:30','+05:30'])('recognizes India time zone %s',zone=>{
    expect(normalizeTimeZone(zone)).toBe('Asia/Kolkata')
  })
  it('supports custom IANA zones and rejects invalid zones without crashing',()=>{
    expect(normalizeTimeZone(' Europe/London ')).toBe('Europe/London')
    expect(normalizeTimeZone('Mars/Olympus')).toBeNull()
    expect(readTimePreferences({timeZone:'invalid',clockFormat:'bad'})).toEqual(india)
    expect(availableTimeZones()).toContain('Asia/Kolkata')
    expect(availableTimeZones()).toContain('UTC')
  })
  it('handles midnight, noon, and the 24-hour clock without rendering 24:00',()=>{
    expect(clockTime('2026-10-31T18:30:00.000Z',india)).toBe('12:00 AM')
    expect(clockTime('2026-10-31T06:30:00.000Z',india)).toBe('12:00 PM')
    expect(clockTime('2026-10-31T18:30:00.000Z',{...india,clockFormat:'24h'})).toBe('00:00')
    expect(clockTime(stamp,{...india,clockFormat:'24h'})).toBe('23:13')
    expect(hourClock(0,'12h')).toBe('12:00 AM')
    expect(hourClock(18,'12h')).toBe('6:00 PM')
    expect(hourClock(0,'24h')).toBe('00:00')
  })
  it('uses local calendar dates across month and year boundaries and fractional offsets',()=>{
    expect(zonedDay('2026-12-31T20:00:00.000Z',india.timeZone)).toBe('2027-01-01')
    expect(zonedDay('2026-11-01T01:00:00.000Z','America/Los_Angeles')).toBe('2026-10-31')
    expect(clockTime('2026-10-31T18:30:00.000Z',{timeZone:'Asia/Kathmandu',clockFormat:'24h'})).toBe('00:15')
    expect(zonedHour('2026-10-31T18:30:00.000Z',india.timeZone)).toBe(0)
  })
  it('follows daylight-saving changes automatically',()=>{
    const zone='America/New_York'
    expect(zoneOffset(zone,'2026-11-01T05:30:00.000Z')).toBe('GMT-04:00')
    expect(zoneOffset(zone,'2026-11-01T06:30:00.000Z')).toBe('GMT-05:00')
    expect(zonedHour('2026-11-01T05:30:00.000Z',zone)).toBe(1)
    expect(zonedHour('2026-11-01T06:30:00.000Z',zone)).toBe(1)
  })
  it('uses the selected local date for Yesterday and the selected clock for alerts',()=>{
    const createdAt='2026-10-31T18:20:00.000Z',now=new Date('2026-10-31T18:40:00.000Z')
    expect(alertTime(createdAt,now,india).label).toBe('Yesterday, 11:50 PM · 20m ago')
    expect(alertTime(createdAt,now,{...india,clockFormat:'24h'}).label).toBe('Yesterday, 23:50 · 20m ago')
    expect(alertTime(createdAt,now,{timeZone:'UTC',clockFormat:'24h'}).label).toBe('18:20 · 20m ago')
  })
  it('localizes activity hours without mutating saved dates, counts, timestamps, goals, or backups',()=>{
    const e:Entry={id:crypto.randomUUID(),date:'2026-10-31',easy:2,external:1,loggedAt:'2026-10-31T18:45:00.000Z',createdAt:stamp,updatedAt:stamp,version:1,deleted:false,backdated:false}
    const snapshot:Snapshot={entries:[e,{...e,id:crypto.randomUUID(),deleted:true}],trackingStart:'2026-10-01',policies:[{date:FIRST_DAY,value:75}],overrides:[],revision:4,goalRevision:1,serverNow:stamp}
    const before=JSON.stringify(makeBackup(snapshot,new Date(stamp))),count=analytics(snapshot,7,'2026-10-31').total
    expect(hourlyInZone(snapshot,'2026-11-01',india.timeZone).hours[0]).toBe(3)
    expect(hourlyInZone(snapshot,'2026-10-31',india.timeZone).otherDates).toBe(3)
    expect(hourlyInZone(snapshot,'2026-10-31','UTC').hours[18]).toBe(3)
    expect(hourlyInZone(snapshot,'2026-11-01','UTC').hours.reduce((a,b)=>a+b,0)).toBe(0)
    expect(analytics(snapshot,7,'2026-10-31').total).toBe(count)
    expect(JSON.stringify(makeBackup(snapshot,new Date(stamp)))).toBe(before)
  })
})

describe('saved time preferences',()=>{
  it('persists across browser reloads and notifies other views',async()=>{
    const storage=memory(),one=new TimePreferencesStore({storage:()=>storage}),two=new TimePreferencesStore({storage:()=>storage}),changed=vi.fn()
    one.subscribe(changed)
    await one.save({timeZone:'Europe/London',clockFormat:'24h'})
    expect(changed).toHaveBeenCalledTimes(1)
    two.refresh()
    expect(two.getSnapshot()).toEqual({timeZone:'Europe/London',clockFormat:'24h'})
    expect(new TimePreferencesStore({storage:()=>storage}).getSnapshot()).toEqual(two.getSnapshot())
  })
  it('uses safe defaults for malformed cached values or unavailable storage',()=>{
    expect(new TimePreferencesStore({storage:()=>memory('{broken')}).getSnapshot()).toEqual(india)
    expect(new TimePreferencesStore({storage:()=>{throw new Error('denied')}}).getSnapshot()).toEqual(india)
  })
  it('does not report success or change the active preference after a failed save',async()=>{
    const store=new TimePreferencesStore({storage:()=>({getItem:()=>null,setItem:()=>{throw new Error('quota')}})})
    await expect(store.save({...india,clockFormat:'24h'})).rejects.toThrow('quota')
    expect(store.getSnapshot()).toEqual(india)
    await expect(store.save({...india,timeZone:'invalid'})).rejects.toThrow('valid time zone')
  })
  it('saves to the native host and survives a missing or blocked browser cache',async()=>{
    let persisted:unknown={timeZone:'Europe/London',clockFormat:'24h'}
    const native={load:async()=>persisted,save:vi.fn(async(value:unknown)=>{persisted=value;return value})}
    const store=new TimePreferencesStore({storage:()=>null,native})
    await store.init()
    expect(store.getSnapshot()).toEqual(persisted)
    await store.save(india)
    expect(native.save).toHaveBeenCalledWith(india)
    const reopened=new TimePreferencesStore({storage:()=>null,native});await reopened.init()
    expect(reopened.getSnapshot()).toEqual(india)
  })
  it('preserves the active preference after a rejected native write',async()=>{
    const store=new TimePreferencesStore({storage:()=>null,native:{load:async()=>india,save:async()=>{throw new Error('native failure')}}})
    await expect(store.save({...india,clockFormat:'24h'})).rejects.toThrow('native failure')
    expect(store.getSnapshot()).toEqual(DEFAULT_TIME_PREFERENCES)
  })
  it('ignores an old startup response after a newer preference is saved or broadcast',async()=>{
    let resolve!:(value:unknown)=>void
    const store=new TimePreferencesStore({storage:()=>null,native:{load:()=>new Promise(done=>{resolve=done}),save:async value=>value}})
    const loading=store.init()
    store.receive({timeZone:'America/New_York',clockFormat:'24h'})
    resolve(india);await loading
    expect(store.getSnapshot()).toEqual({timeZone:'America/New_York',clockFormat:'24h'})
  })
})

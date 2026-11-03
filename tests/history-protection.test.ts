import 'fake-indexeddb/auto'
import {openDB,deleteDB} from 'idb'
import {afterEach,describe,expect,it} from 'vitest'
import {LocalWorkspace} from '../src/data/local-workspace'
import {SyncEngine} from '../src/data/store'
import {analytics,goalFor,makeBackup,type Backup,type Snapshot} from '../shared/model'
import {validateHistoryImage,type LocalHistoryImage,type LocalHistorySafety} from '../src/data/history-protection'
import {recoveryPreview} from '../src/utils/recovery'

const stores:LocalWorkspace[]=[],engines:SyncEngine[]=[]
afterEach(async()=>{for(const engine of engines.splice(0))engine.dispose();for(const store of stores.splice(0))await store.close()})
function mirror(){
  let image:LocalHistoryImage|null=null,fail=false,choice=false
  const safety:LocalHistorySafety={load:async()=>({image:structuredClone(image),needsHistoryChoice:choice}),save:async value=>{if(fail)throw new Error('Safety disk unavailable');image=structuredClone(value)}}
  return {safety,get image(){return image},set fail(value:boolean){fail=value},set choice(value:boolean){choice=value}}
}
function store(name:string,safety:LocalHistorySafety,clock=()=>new Date('2026-10-24T12:00:00.000Z')){const value=new LocalWorkspace(name,clock,safety);stores.push(value);return value}
async function engine(workspace:LocalWorkspace,clock=()=>new Date('2026-10-24T12:00:00.000Z'),cache=crypto.randomUUID()){
  const value=new SyncEngine({name:cache,clock,fetcher:workspace.fetcher,localOnly:true,broadcast:false,autoRetry:false});engines.push(value);await value.init();return value
}
const snapshot=(engine:SyncEngine)=>engine.getState().snapshot!
const lifetime=(engine:SyncEngine)=>snapshot(engine).entries.filter(e=>!e.deleted).reduce((n,e)=>n+e.easy+e.external,0)

describe('independent history safety copy',()=>{
  it('keeps prior history through Sunday, a month boundary, and a year boundary',async()=>{
    let now=new Date('2026-10-24T23:59:59.000Z');const clock=()=>now,m=mirror(),workspace=store(crypto.randomUUID(),m.safety,clock),one=await engine(workspace,clock)
    await one.createEntry(3,4);await one.sync()
    for(const stamp of ['2026-10-25T00:00:01.000Z','2026-11-01T00:00:01.000Z','2027-01-01T00:00:01.000Z']){
      now=new Date(stamp);await one.sync();expect(lifetime(one)).toBe(7);expect(snapshot(one).entries[0].date).toBe('2026-10-24')
      expect(analytics(snapshot(one),7,stamp.slice(0,10)).total).toBe(0)
    }
    expect(m.image?.snapshot.entries).toHaveLength(1)
  })
  it('recovers all records and operation receipts after complete IndexedDB loss',async()=>{
    const name=crypto.randomUUID(),m=mirror(),first=store(name,m.safety),one=await engine(first)
    const created=await one.createEntry(5,2);await one.sync();if(created?.type!=='create')throw new Error('Expected create')
    const saved=structuredClone(snapshot(one));await first.close();await deleteDB(name)
    const reopened=store(name,m.safety),two=await engine(reopened)
    expect(snapshot(two).entries).toEqual(saved.entries);expect(lifetime(two)).toBe(7)
    const retry=await reopened.fetcher('/api/entries',{method:'POST',body:JSON.stringify(created)})
    expect(retry.status).toBe(200);await two.sync();expect(lifetime(two)).toBe(7)
  })
  it('recovers a missing primary snapshot while the app is still running',async()=>{
    const name=crypto.randomUUID(),m=mirror(),workspace=store(name,m.safety),one=await engine(workspace)
    await one.createEntry(2,3);await one.sync()
    const raw=await openDB(name);await raw.delete('meta','snapshot');raw.close()
    await one.sync();expect(one.getState().status).toBe('saved');expect(lifetime(one)).toBe(5)
  })
  it('does not declare a write saved when the independent copy fails, and retries without duplication',async()=>{
    const m=mirror(),workspace=store(crypto.randomUUID(),m.safety),one=await engine(workspace)
    m.fail=true;await one.createEntry(2,1);await one.sync()
    expect(one.getState().status).toBe('retry');expect(one.getState().error).toContain('Safety disk unavailable');expect(one.getState().queue).toHaveLength(1);expect(lifetime(one)).toBe(3)
    m.fail=false;await one.sync();expect(one.getState().status).toBe('saved');expect(one.getState().queue).toHaveLength(0);expect(lifetime(one)).toBe(3)
  })
  it('requires an explicit choice before silently starting beside another workspace',async()=>{
    const name=crypto.randomUUID(),m=mirror();m.choice=true
    const workspace=store(name,m.safety),one=await engine(workspace)
    expect(one.getState().snapshot).toBe(null);expect(one.getState().status).toBe('retry');expect(one.getState().error).toContain('another history')
    const raw=await openDB(name);expect(await raw.get('meta','snapshot')).toBeUndefined();raw.close()
    m.choice=false;await one.sync();expect(one.getState().status).toBe('saved');expect(lifetime(one)).toBe(0)
  })
  it('protects a previously loaded cache from a truncated incoming snapshot',async()=>{
    const m=mirror(),workspace=store(crypto.randomUUID(),m.safety);let truncated=false
    const fetcher:typeof fetch=async(input,init)=>{const response=await workspace.fetcher(input,init);if(truncated&&String(input).startsWith('/api/snapshot')){const data=await response.json() as Snapshot;return Response.json({...data,entries:[],revision:data.revision+1})}return response}
    const one=new SyncEngine({name:crypto.randomUUID(),fetcher,clock:()=>new Date('2026-10-24T12:00:00.000Z'),localOnly:true,broadcast:false,autoRetry:false});engines.push(one);await one.init()
    await one.createEntry(4,3);await one.sync();truncated=true;await one.sync()
    expect(one.getState().status).toBe('retry');expect(one.getState().error).toContain('incomplete history');expect(lifetime(one)).toBe(7)
  })
  it('rejects a malformed or invalid safety image instead of inventing an empty history',()=>{
    expect(()=>validateHistoryImage({snapshot:{},receipts:[]})).toThrow()
    expect(()=>validateHistoryImage({})).toThrow()
  })
})

it('recovers an older workspace without changing current goals or duplicating entries',()=>{
  const stamp='2026-10-25T12:00:00.000Z'
  const entry={id:crypto.randomUUID(),date:'2026-10-18',easy:4,external:2,loggedAt:'2026-10-18T12:00:00.000Z',createdAt:stamp,updatedAt:stamp,version:1,deleted:false,backdated:false}
  const current:Snapshot={entries:[],policies:[{date:'1970-01-01',value:75}],overrides:[],trackingStart:'2026-10-24',revision:1,goalRevision:0,serverNow:stamp}
  const older:Backup={format:'vigil-backup',version:1,exportedAt:stamp,trackingStart:'2026-10-06',entries:[entry],policies:[{date:'1970-01-01',value:75},{date:'2026-10-14',value:70}],overrides:[]}
  const {backup,preview}=recoveryPreview(current,older,'2026-10-25')
  const restored={...current,entries:[entry],trackingStart:older.trackingStart,policies:[...current.policies,...preview.items.flatMap(item=>item.kind==='policy'?[{date:item.date,value:item.value}]:[])]}
  expect(goalFor(restored,'2026-10-18')).toBe(70);expect(goalFor(restored,'2026-10-25')).toBe(75)
  expect(recoveryPreview(restored,backup,'2026-10-25').preview.items).toHaveLength(0)
  expect(makeBackup(restored).entries[0].id).toBe(entry.id)
})

it('keeps a one-day current override from becoming a new future default during recovery',()=>{
  const stamp='2026-10-25T12:00:00.000Z'
  const current:Snapshot={entries:[],policies:[{date:'1970-01-01',value:75}],overrides:[{date:'2026-10-24',value:90}],trackingStart:'2026-10-24',revision:1,goalRevision:0,serverNow:stamp}
  const source:Backup={...makeBackup(current),trackingStart:'2026-10-06',policies:[{date:'1970-01-01',value:75},{date:'2026-10-14',value:70}],overrides:[]}
  const {preview}=recoveryPreview(current,source,'2026-10-25')
  const restored={...current,policies:[...current.policies,...preview.items.flatMap(item=>item.kind==='policy'?[{date:item.date,value:item.value}]:[])]}
  expect(goalFor(restored,'2026-10-24')).toBe(90);expect(goalFor(restored,'2026-10-25')).toBe(75)
})

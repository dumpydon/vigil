import 'fake-indexeddb/auto'
import { afterEach,beforeEach,describe,expect,it } from 'vitest'
import { SyncEngine } from '../src/data/store'
import { analytics } from '../shared/model'
import { makeEnvironment } from './helpers'
let test:Awaited<ReturnType<typeof makeEnvironment>>,engines:SyncEngine[]=[],online:boolean
beforeEach(async()=>{test=await makeEnvironment();engines=[];online=true;await test.login()},30_000)
afterEach(async()=>{for(const engine of engines)engine.dispose();await test?.dispose()})
async function make(fetcher=test.fetcher,name=crypto.randomUUID()){
  const engine=new SyncEngine({name,clock:test.clock,fetcher,online:()=>online,broadcast:false,autoRetry:false});engines.push(engine);await engine.init(false);if(online)await engine.sync();return engine
}
const total=(engine:SyncEngine)=>analytics(engine.getState().snapshot!,7,'2026-10-07').total
describe('durable IndexedDB queue with the real D1 API',()=>{
  it('reconciles a committed create with a lost response without replaying or double counting',async()=>{
    let lose=true,calls=0
    const fetcher:typeof fetch=async(url,init)=>{const response=await test.fetcher(url,init);if(String(url)==='/api/entries'&&init?.method==='POST'){calls++;if(lose){lose=false;throw new TypeError('Simulated lost response after commit')}}return response}
    const engine=await make(fetcher);await engine.createEntry(2,3);await engine.sync()
    expect(total(engine)).toBe(5);expect(engine.getState().queue).toHaveLength(1)
    await engine.sync();expect(engine.getState().queue).toHaveLength(0);expect(total(engine)).toBe(5);expect(calls).toBe(1);expect(analytics(await test.snapshot(),7,'2026-10-07').total).toBe(5)
  })
  it('retains offline additions and Undo through reload and reconnect without reversing twice',async()=>{
    const name=crypto.randomUUID(),engine=await make(test.fetcher,name);online=false
    const create=await engine.createEntry(4,5);if(create?.type!=='create')throw new Error('Expected a retained create')
    await Promise.all([engine.deleteEntry(create.entry.id),engine.deleteEntry(create.entry.id)])
    expect(total(engine)).toBe(0);expect(engine.getState().queue).toHaveLength(2)
    const reopened=await make(test.fetcher,name);expect(total(reopened)).toBe(0);expect(reopened.getState().queue).toHaveLength(2)
    online=true;await reopened.sync();expect(reopened.getState().queue).toHaveLength(0);expect(analytics(await test.snapshot(),7,'2026-10-07').total).toBe(0)
  })
  it('serializes an Undo while its create is in flight',async()=>{
    let started!:()=>void,release!:()=>void
    const began=new Promise<void>(resolve=>{started=resolve}),gate=new Promise<void>(resolve=>{release=resolve})
    const fetcher:typeof fetch=async(url,init)=>{const response=await test.fetcher(url,init);if(String(url)==='/api/entries'&&init?.method==='POST'){started();await gate}return response}
    const engine=await make(fetcher),create=await engine.createEntry(3,2);if(create?.type!=='create')throw new Error('Expected a create')
    await began;await engine.deleteEntry(create.entry.id);expect(total(engine)).toBe(0);release();await engine.sync();expect(engine.getState().queue).toHaveLength(0);expect(analytics(await test.snapshot(),7,'2026-10-07').total).toBe(0)
  })
  it('preserves pending work after authentication expires and keeps original assigned UTC dates',async()=>{
    const engine=await make();online=false;await engine.createEntry(2,1)
    test.setTime('2027-01-06T11:00:01.000Z');online=true;await engine.sync();expect(engine.getState().status).toBe('auth');expect(engine.getState().queue).toHaveLength(1)
    await engine.login(test.password);expect(engine.getState().queue).toHaveLength(0);const snapshot=await test.snapshot();expect(snapshot.entries[0].date).toBe('2026-10-07');expect(snapshot.entries[0].loggedAt).toBe('2026-10-07T11:00:00.000Z')
  })
  it('uses a shared lease for multiple tabs even without BroadcastChannel',async()=>{
    const name=crypto.randomUUID(),one=await make(test.fetcher,name),two=await make(test.fetcher,name);online=false
    await Promise.all([one.createEntry(1,0),two.createEntry(0,2)]);online=true
    await Promise.all([one.sync(),two.sync()]);await two.sync()
    expect(analytics(await test.snapshot(),7,'2026-10-07').total).toBe(3);expect(two.getState().queue).toHaveLength(0);expect(total(two)).toBe(3)
  })
  it('requires explicit conflict resolution after a stale form version',async()=>{
    const create=test.op(1,0);await test.mutate(create);const engine=await make()
    await test.mutate({id:crypto.randomUUID(),type:'update',entryId:create.entry.id,expectedVersion:1,date:'2026-10-07',easy:9,external:0})
    await engine.updateEntry(create.entry.id,4,0,'2026-10-07',1);await engine.sync()
    const conflict=engine.getState().queue[0];expect(conflict.status).toBe('conflict');expect(analytics(await test.snapshot(),7,'2026-10-07').total).toBe(9)
    await engine.resolveConflict(conflict.operation.id,'cloud');await engine.sync();expect(total(engine)).toBe(9);expect(engine.getState().queue).toHaveLength(0)
  })
  it('never displays an unretained entry if local persistence fails',async()=>{const engine=await make();engine.dispose();await expect(engine.createEntry(1,0)).rejects.toThrow();expect(total(engine)).toBe(0)})
  it('reconciles a lost goal acknowledgment before computing a later goal version',async()=>{
    let lose=true
    const fetcher:typeof fetch=async(url,init)=>{const r=await test.fetcher(url,init);if(String(url).startsWith('/api/goals/')&&lose){lose=false;throw new TypeError('Simulated lost goal response')}return r}
    const engine=await make(fetcher);await engine.setGoal('2026-10-07',100,true);await engine.sync();await engine.sync();expect(engine.getState().snapshot?.goalRevision).toBe(1)
    await engine.setGoal('2026-10-07',80,false);await engine.sync();expect(engine.getState().queue).toHaveLength(0);expect(analytics(await test.snapshot(),7,'2026-10-07').goal).toBe(80)
  })
  it('keeps a queued mixed batch on its click date across midnight',async()=>{const engine=await make();online=false;await engine.createEntry(3,4);test.setTime('2026-10-08T00:00:00.000Z');online=true;await engine.sync();expect((await test.snapshot()).entries[0].date).toBe('2026-10-07');expect(analytics(await test.snapshot(),7,'2026-10-08').total).toBe(0)})
  it('retains every import chunk atomically before an offline reload',async()=>{
    const name=crypto.randomUUID(),engine=await make(test.fetcher,name);online=false
    const items=Array.from({length:45},()=>({kind:'entry' as const,entry:{...test.op().entry,createdAt:test.clock().toISOString(),updatedAt:test.clock().toISOString(),version:1,deleted:false}}))
    await engine.importItems(items,'2026-10-07');expect(engine.getState().queue).toHaveLength(3);expect(total(engine)).toBe(45)
    const reopened=await make(test.fetcher,name);expect(total(reopened)).toBe(45);online=true;await reopened.sync()
    expect(reopened.getState().queue).toHaveLength(0);expect(analytics(await test.snapshot(),7,'2026-10-07').total).toBe(45)
  })
})

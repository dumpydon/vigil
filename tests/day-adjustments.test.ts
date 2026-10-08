import 'fake-indexeddb/auto'
import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {planDayAdjustment,validateMutation,type Mutation} from '../shared/model'
import {SyncEngine} from '../src/data/store'
import {makeEnvironment} from './helpers'

let test:Awaited<ReturnType<typeof makeEnvironment>>,engines:SyncEngine[]=[]
beforeEach(async()=>{test=await makeEnvironment();engines=[];await test.login()},30_000)
afterEach(async()=>{engines.forEach(engine=>engine.dispose());await test.dispose()})
const day='2026-10-06'
async function adjustment(easy:number,external:number):Promise<Extract<Mutation,{type:'day'}>>{
  const snapshot=await test.snapshot()
  return {id:crypto.randomUUID(),type:'day',date:day,easy,external,expected:snapshot.entries.filter(e=>e.date===day&&!e.deleted).map(({id,version,easy,external,loggedAt})=>({id,version,easy,external,loggedAt})),additionId:crypto.randomUUID(),loggedAt:test.clock().toISOString()}
}
async function add(easy:number,external:number){const op=test.op(easy,external);op.entry.date=day;op.entry.backdated=true;expect((await test.mutate(op)).status).toBe(200);return op.entry.id}
const totals=(entries:Awaited<ReturnType<typeof test.snapshot>>['entries'])=>entries.filter(e=>e.date===day&&!e.deleted).reduce((sum,e)=>({easy:sum.easy+e.easy,external:sum.external+e.external}),{easy:0,external:0})
describe('confirmed day-total adjustment persistence',()=>{
  it('atomically decreases one category and increases the other, preserving entry IDs and logging times on retries',async()=>{
    const first=await add(5,2);test.setTime('2026-10-07T11:01:00.000Z');await add(3,4)
    const before=await test.snapshot(),op=await adjustment(4,9)
    const [one,two]=await Promise.all([test.mutate(op),test.mutate(op)])
    expect(one.status).toBe(200);expect(two.status).toBe(200)
    const result=await test.snapshot();expect(totals(result.entries)).toEqual({easy:4,external:9})
    expect(result.entries.find(e=>e.id===first)?.loggedAt).toBe(before.entries.find(e=>e.id===first)?.loggedAt)
    expect(result.entries.filter(e=>e.id===op.additionId)).toHaveLength(1)
    expect(result.entries.find(e=>e.id===op.additionId)?.backdated).toBe(true)
    expect((await test.mutate({...op,easy:1})).status).toBe(409)
  })
  it('rejects stale days with changed or additional entries without partially changing totals',async()=>{
    const id=await add(5,2),op=await adjustment(1,1)
    await test.mutate({id:crypto.randomUUID(),type:'update',entryId:id,expectedVersion:1,date:day,easy:6,external:2})
    expect((await test.mutate(op)).status).toBe(409)
    expect(totals((await test.snapshot()).entries)).toEqual({easy:6,external:2})
    const stale=await adjustment(2,2);await add(1,3)
    expect((await test.mutate(stale)).status).toBe(409)
    expect(totals((await test.snapshot()).entries)).toEqual({easy:7,external:5})
    expect(await test.env.DB.prepare('SELECT id FROM mutation_receipts WHERE id=?').bind(stale.id).first()).toBeNull()
  })
  it('supports empty days and setting both category totals to zero using retained tombstones',async()=>{
    expect((await test.mutate(await adjustment(2,3))).status).toBe(200)
    const before=await test.snapshot(),op=await adjustment(0,0)
    expect((await test.mutate(op)).status).toBe(200)
    const after=await test.snapshot();expect(totals(after.entries)).toEqual({easy:0,external:0})
    expect(after.entries.find(e=>e.id===before.entries[0].id)?.deleted).toBe(true)
    expect(after.trackingStart).toBe(day)
  })
  it('retains an offline adjustment across reload and a lost server response without double counting',async()=>{
    await add(5,2)
    let online=true,lose=true
    const fetcher:typeof fetch=async(url,init)=>{const response=await test.fetcher(url,init);if(String(url).startsWith('/api/days/')&&lose){lose=false;throw new TypeError('Lost acknowledgment')}return response}
    const name=crypto.randomUUID()
    const make=async()=>{const engine=new SyncEngine({name,clock:test.clock,fetcher,online:()=>online,broadcast:false,autoRetry:false});engines.push(engine);await engine.init(false);return engine}
    const engine=await make();await engine.sync();online=false
    const expected=engine.getState().snapshot!.entries.filter(e=>e.date===day&&!e.deleted)
    await engine.adjustDay(day,2,6,expected)
    expect(totals(engine.getState().snapshot!.entries)).toEqual({easy:2,external:6})
    const reopened=await make();online=true;await reopened.sync();await reopened.sync()
    expect(reopened.getState().queue).toHaveLength(0)
    expect(totals((await test.snapshot()).entries)).toEqual({easy:2,external:6})
    expect(totals(reopened.getState().snapshot!.entries)).toEqual({easy:2,external:6})
  })
  it('requires a fresh review when the day changes locally after the form opens',async()=>{
    await add(5,0)
    const engine=new SyncEngine({name:crypto.randomUUID(),clock:test.clock,fetcher:test.fetcher,online:()=>true,broadcast:false,autoRetry:false});engines.push(engine);await engine.init(false);await engine.sync()
    const expected=engine.getState().snapshot!.entries.filter(e=>e.date===day&&!e.deleted)
    await engine.createEntry(1,0,day)
    await expect(engine.adjustDay(day,3,0,expected)).rejects.toThrow('confirm again')
    await engine.sync()
  })
  it('validates duplicate IDs, future dates, and impossible counts before creating a plan',async()=>{
    await add(5,2);const op=await adjustment(0,4)
    expect(planDayAdjustment(op).changes[0]).toMatchObject({easy:0,external:2,deleted:false})
    expect(()=>validateMutation({...op,date:'2026-10-08'},'2026-10-07')).toThrow()
    expect(()=>validateMutation({...op,easy:-1},'2026-10-07')).toThrow()
    expect(()=>validateMutation({...op,expected:[op.expected[0],op.expected[0]]},'2026-10-07')).toThrow()
  })
})

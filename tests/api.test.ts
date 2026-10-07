import { afterEach,beforeEach,describe,expect,it } from 'vitest'
import { analytics, goalFor, importPreview, makeBackup, type Entry, type Mutation } from '../shared/model'
import { makeEnvironment } from './helpers'
let test:Awaited<ReturnType<typeof makeEnvironment>>
beforeEach(async()=>{test=await makeEnvironment()},30_000)
afterEach(async()=>{await test?.dispose()})
describe('owner API and actual local D1 persistence',()=>{
  it('denies every private endpoint without authentication and rejects cross-origin mutations',async()=>{
    for(const url of ['/api/snapshot','/api/dashboard','/api/entries','/api/goals','/api/export','/api/session'])expect((await test.fetcher(url)).status).toBe(401)
    expect((await test.mutate(test.op())).status).toBe(401)
    const r=await test.handler(new Request('https://vigil.test/api/login',{method:'POST',headers:{'Origin':'https://other.test','Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),password:'invalid'})}),test.env)
    expect(r.status).toBe(403)
  })
  it('uses remembered secure cookies and stores only hashed session tokens',async()=>{
    const login=await test.login();expect(login.status).toBe(200)
    const cookie=login.headers.get('set-cookie')??''
    for(const key of ['HttpOnly','Secure','SameSite=Strict','Max-Age=7776000'])expect(cookie.includes(key)).toBe(true)
    const row=await test.env.DB.prepare('SELECT token_hash FROM owner_sessions').first<{token_hash:string}>()
    expect(row?.token_hash===cookie.split(';')[0].split('=')[1]).toBe(false)
    expect((await test.fetcher('/api/session')).status).toBe(200)
    expect((await test.fetcher('/api/snapshot')).headers.get('cache-control')).toContain('no-store')
  })
  it('atomically writes mixed counts once under concurrent retries and rejects payload reuse',async()=>{
    await test.login();const op=test.op(3,5)
    const results=await Promise.all([test.mutate(op),test.mutate(op),test.mutate(op)])
    expect(results.map(r=>r.status)).toEqual([200,200,200])
    const snapshot=await test.snapshot();expect(snapshot.entries).toHaveLength(1);expect(analytics(snapshot,7,'2026-10-07').total).toBe(8)
    expect((await test.mutate({...op,entry:{...op.entry,easy:4}})).status).toBe(409)
    const count=await test.env.DB.prepare('SELECT COUNT(*) AS count FROM mutation_receipts').first<{count:number}>();expect(count?.count).toBe(1)
  })
  it('rolls back the receipt when an entry statement fails after receipt insertion',async()=>{
    await test.login()
    await test.env.DB.prepare("CREATE TRIGGER reject_test_entry BEFORE INSERT ON entries BEGIN SELECT RAISE(ABORT,'test_failure'); END;").run()
    expect((await test.mutate(test.op(2,1))).status).toBe(500)
    expect((await test.env.DB.prepare('SELECT COUNT(*) AS n FROM mutation_receipts').first<{n:number}>())?.n).toBe(0)
    expect((await test.snapshot()).entries).toHaveLength(0)
  })
  it('persists independent rapid clicks rather than debouncing them',async()=>{await test.login();const results=await Promise.all(Array.from({length:25},()=>test.mutate(test.op())));expect(results.every(r=>r.status===200)).toBe(true);expect(analytics(await test.snapshot(),7,'2026-10-07').total).toBe(25)})
  it('detects stale edits and does not apply an Undo twice',async()=>{
    await test.login();const create=test.op(4,3);await test.mutate(create)
    const edit:Mutation={id:crypto.randomUUID(),type:'update',entryId:create.entry.id,expectedVersion:1,date:'2026-10-07',easy:8,external:2}
    expect((await test.mutate(edit)).status).toBe(200)
    expect((await test.mutate({...edit,id:crypto.randomUUID(),easy:9})).status).toBe(409)
    const undo:Mutation={id:crypto.randomUUID(),type:'delete',entryId:create.entry.id,expectedVersion:2}
    expect((await test.mutate(undo)).status).toBe(200);expect((await test.mutate(undo)).status).toBe(200)
    expect((await test.mutate({...undo,id:crypto.randomUUID()})).status).toBe(409)
    const s=await test.snapshot();expect(s.entries[0].version).toBe(3);expect(s.entries[0].deleted).toBe(true);expect(analytics(s,7,'2026-10-07').total).toBe(0)
  })
  it('has effective-dated defaults and stable zero-day goals without cron or app-open events',async()=>{
    await test.login();const stamp=test.clock().toISOString()
    await test.mutate({id:crypto.randomUUID(),type:'goal',date:'2026-10-07',value:60,future:false,expectedRevision:0,loggedAt:stamp})
    let s=await test.snapshot();expect(goalFor(s,'2026-10-07')).toBe(60);expect(goalFor(s,'2026-10-08')).toBe(75)
    await test.mutate({id:crypto.randomUUID(),type:'goal',date:'2026-10-07',value:90,future:true,expectedRevision:1,loggedAt:stamp})
    test.setTime('2026-10-10T11:00:00.000Z');s=await test.snapshot();expect(goalFor(s,'2026-10-06')).toBe(75);expect(goalFor(s,'2026-10-08')).toBe(90);expect(goalFor(s,'2026-10-10')).toBe(90)
    await test.mutate({id:crypto.randomUUID(),type:'goal',date:'2026-10-06',value:30,future:false,expectedRevision:2,loggedAt:test.clock().toISOString()})
    s=await test.snapshot();expect(goalFor(s,'2026-10-06')).toBe(30);expect(goalFor(s,'2026-10-10')).toBe(90)
  })
  it('retains click dates and immutable logging timestamps when backdating/editing',async()=>{
    await test.login();const op=test.op(5,0);await test.mutate(op)
    await test.mutate({id:crypto.randomUUID(),type:'update',entryId:op.entry.id,expectedVersion:1,date:'2026-10-01',easy:5,external:0})
    const s=await test.snapshot();expect(s.entries[0].loggedAt).toBe(op.entry.loggedAt);expect(s.entries[0].backdated).toBe(true);expect(s.trackingStart).toBe('2026-10-01')
    expect((await test.mutate({...test.op(),entry:{...test.op().entry,date:'2026-10-08'}})).status).toBe(400)
  })
  it('imports safely, deduplicates IDs and keeps existing conflicting records/goals',async()=>{
    await test.login();const op=test.op(2,3);await test.mutate(op)
    const before=await test.snapshot(),backup=makeBackup(before,test.clock())
    expect(importPreview(before,backup).items).toHaveLength(0)
    const incoming:Entry={...before.entries[0],id:crypto.randomUUID(),easy:7}
    const importOp:Mutation={id:crypto.randomUUID(),type:'import',trackingStart:before.trackingStart,items:[{kind:'entry',entry:incoming},{kind:'entry',entry:{...before.entries[0],easy:999}},{kind:'policy',date:'1970-01-01',value:999}]}
    expect((await test.mutate(importOp)).status).toBe(200)
    expect((await test.mutate({...importOp,id:crypto.randomUUID()})).status).toBe(200)
    const s=await test.snapshot();expect(s.entries).toHaveLength(2);expect(s.entries.find(e=>e.id===op.entry.id)?.easy).toBe(2);expect(goalFor(s,'2026-10-07')).toBe(75);expect(analytics(s,7,'2026-10-07').total).toBe(15)
    const exported=await (await test.fetcher('/api/export')).json() as Record<string,unknown>;expect(exported.format).toBe('vigil-backup');expect('sessions'in exported).toBe(false)
    expect((await test.fetcher('/api/export?format=csv')).headers.get('content-type')).toContain('text/csv')
  })
  it('enforces expiration, revocation and rate limiting',async()=>{
    await test.login();test.setTime('2027-01-06T11:00:01.000Z');expect((await test.fetcher('/api/snapshot')).status).toBe(401)
    await test.login();await test.fetcher('/api/logout',{method:'POST',body:JSON.stringify({id:crypto.randomUUID()})});expect((await test.fetcher('/api/snapshot')).status).toBe(401)
    let r:Response|undefined;for(let i=0;i<11;i++)r=await test.fetcher('/api/login',{method:'POST',body:JSON.stringify({id:crypto.randomUUID(),password:crypto.randomUUID()})});expect(r?.status).toBe(429)
  })
})

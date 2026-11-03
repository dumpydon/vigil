import {afterEach,beforeEach,describe,expect,it} from 'vitest'
import {makeBackup} from '../shared/model'
import {makeEnvironment} from './helpers'
let test:Awaited<ReturnType<typeof makeEnvironment>>
beforeEach(async()=>{test=await makeEnvironment()},30_000)
afterEach(async()=>{await test?.dispose()})
async function pair(){await test.login();const id=crypto.randomUUID();const response=await test.fetcher('/api/backups/devices',{method:'POST',body:JSON.stringify({id,name:'Test Mac'})});expect(response.status).toBe(200);return await response.json() as {id:string;token:string}}
const auth=(token:string)=>({Authorization:`Bearer ${token}`})
async function source(){await test.login();await test.mutate(test.op(25,22));return makeBackup(await test.snapshot(),test.clock())}
async function register(){
  const identity={id:crypto.randomUUID(),token:crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','')}
  const response=await test.fetcher('/api/backups/register',{method:'POST',body:JSON.stringify(identity)})
  expect(response.status).toBe(200);return identity
}
describe('password-free public backup identities',()=>{
  it('registers without an owner account, resumes idempotently, and prevents ID takeover',async()=>{
    const identity=await register()
    expect((await test.fetcher('/api/backups/register',{method:'POST',body:JSON.stringify(identity)})).status).toBe(200)
    expect((await test.fetcher('/api/backups/register',{method:'POST',body:JSON.stringify({...identity,token:'a'.repeat(64)})})).status).toBe(409)
    expect((await test.fetcher('/api/snapshot',{headers:auth(identity.token)})).status).toBe(401)
    expect((await test.fetcher('/api/backups',{headers:auth(identity.token)})).status).toBe(200)
    const row=await test.env.DB.prepare('SELECT token_hash FROM backup_devices WHERE id=?').bind(identity.id).first<{token_hash:string}>()
    expect(row?.token_hash).not.toBe(identity.token)
  })
  it('keeps anonymous users separate and permits recovery with the saved credential only',async()=>{
    const backup=await source();test.clearCookie()
    const one=await register(),two=await register()
    const response=await test.fetcher('/api/backups',{method:'POST',headers:auth(one.token),body:JSON.stringify({id:crypto.randomUUID(),revision:200,backupJSON:JSON.stringify(backup)})})
    expect(response.status).toBe(200);const copy=await response.json() as {id:string}
    expect((await test.fetcher('/api/backups/'+copy.id,{headers:auth(two.token)})).status).toBe(404)
    expect((await test.fetcher('/api/backups/'+copy.id)).status).toBe(401)
    expect((await test.fetcher('/api/backups/'+copy.id,{headers:auth(one.token)})).status).toBe(200)
    expect((await test.fetcher('/api/backups',{headers:auth(two.token)})).status).toBe(200)
  })
  it('does not let registration reactivate a revoked identity',async()=>{
    const identity=await register()
    expect((await test.fetcher('/api/backups/devices/'+identity.id,{method:'DELETE',headers:auth(identity.token)})).status).toBe(200)
    expect((await test.fetcher('/api/backups/register',{method:'POST',body:JSON.stringify(identity)})).status).toBe(409)
    expect((await test.fetcher('/api/backups',{headers:auth(identity.token)})).status).toBe(401)
  })
  it('bounds anonymous registrations and still lets an existing identity reconnect',async()=>{
    const first=await register()
    for(let index=1;index<20;index++)await register()
    const input={id:crypto.randomUUID(),token:'b'.repeat(64)}
    expect((await test.fetcher('/api/backups/register',{method:'POST',body:JSON.stringify(input)})).status).toBe(429)
    expect((await test.fetcher('/api/backups/register',{method:'POST',body:JSON.stringify(first)})).status).toBe(200)
    const row=await test.env.DB.prepare('SELECT COUNT(*) AS count FROM backup_devices').first<{count:number}>()
    expect(row?.count).toBe(20)
    test.setTime('2026-10-08T01:00:00.000Z');expect((await test.fetcher('/api/backups/register',{method:'POST',body:JSON.stringify(input)})).status).toBe(200)
  })
})
describe('private cloud backup storage',()=>{
  it('requires owner pairing and scopes device tokens away from the owner API',async()=>{
    expect((await test.fetcher('/api/backups/devices',{method:'POST',body:JSON.stringify({id:crypto.randomUUID(),name:'Other'})})).status).toBe(401)
    const d=await pair();test.clearCookie()
    expect((await test.fetcher('/api/snapshot',{headers:auth(d.token)})).status).toBe(401)
    expect((await test.fetcher('/api/backups',{headers:auth(d.token)})).status).toBe(200)
    expect((await test.fetcher('/api/backups')).status).toBe(401)
    const stored=await test.env.DB.prepare('SELECT token_hash FROM backup_devices WHERE id=?').bind(d.id).first<{token_hash:string}>()
    expect(stored?.token_hash).not.toBe(d.token)
  })
  it('round trips all records and goals, deduplicates retries, and does not alter web history',async()=>{
    const backup=await source(),d=await pair(),before=await test.snapshot(),payload={id:crypto.randomUUID(),revision:1,backupJSON:JSON.stringify(backup)}
    const send=()=>test.fetcher('/api/backups',{method:'POST',headers:auth(d.token),body:JSON.stringify(payload)})
    const [one,two]=await Promise.all([send(),send()]);expect(one.status).toBe(200);expect(two.status).toBe(200)
    const receipt=await one.json() as {id:string;sha256:string;applications:number};expect(receipt.applications).toBe(47)
    const copy=await (await test.fetcher('/api/backups/'+receipt.id,{headers:auth(d.token)})).json() as {backupJSON:string;sha256:string}
    expect(copy.backupJSON).toBe(payload.backupJSON);expect(copy.sha256).toBe(receipt.sha256)
    expect((await test.snapshot()).entries).toEqual(before.entries)
    const list=await (await test.fetcher('/api/backups',{headers:auth(d.token)})).json() as {backups:unknown[]};expect(list.backups).toHaveLength(1)
  })
  it('rejects missing history and conflicting revisions while retaining deleted entries',async()=>{
    const backup=await source(),d=await pair()
    const save=(revision:number,data:unknown)=>test.fetcher('/api/backups',{method:'POST',headers:auth(d.token),body:JSON.stringify({id:crypto.randomUUID(),revision,backupJSON:JSON.stringify(data)})})
    expect((await save(3,backup)).status).toBe(200)
    expect((await save(4,{...backup,entries:[]})).status).toBe(409)
    expect((await save(2,backup)).status).toBe(409)
    const edited={...backup,entries:backup.entries.map(entry=>({...entry,deleted:true,version:2}))}
    expect((await save(3,edited)).status).toBe(409)
    expect((await save(4,edited)).status).toBe(200)
  })
  it('isolates devices and supports revocation without deleting the backup',async()=>{
    const backup=await source(),a=await pair(),b=await pair()
    const response=await test.fetcher('/api/backups',{method:'POST',headers:auth(a.token),body:JSON.stringify({id:crypto.randomUUID(),revision:1,backupJSON:JSON.stringify(backup)})}),copy=await response.json() as {id:string}
    test.clearCookie()
    expect((await test.fetcher('/api/backups/'+copy.id,{headers:auth(b.token)})).status).toBe(404)
    expect((await test.fetcher('/api/backups/devices/'+a.id,{method:'DELETE',headers:auth(b.token)})).status).toBe(403)
    expect((await test.fetcher('/api/backups/devices/'+a.id,{method:'DELETE',headers:auth(a.token)})).status).toBe(200)
    expect((await test.fetcher('/api/backups',{headers:auth(a.token)})).status).toBe(401)
    await test.login();expect((await test.fetcher('/api/backups/'+copy.id)).status).toBe(200)
  })
  it('preserves Unicode across chunk boundaries and rejects damaged remote content',async()=>{
    const backup=await source(),d=await pair(),backupJSON=JSON.stringify({...backup,padding:'a'.repeat(398999)+'😀'.repeat(2000)})
    const response=await test.fetcher('/api/backups',{method:'POST',headers:auth(d.token),body:JSON.stringify({id:crypto.randomUUID(),revision:1,backupJSON})}),copy=await response.json() as {id:string}
    expect(response.status).toBe(200)
    const result=await(await test.fetcher('/api/backups/'+copy.id,{headers:auth(d.token)})).json() as {backupJSON:string};expect(result.backupJSON).toBe(backupJSON)
    await test.env.DB.prepare('UPDATE cloud_backup_chunks SET content=? WHERE backup_id=? AND position=0').bind('damaged',copy.id).run()
    expect((await test.fetcher('/api/backups/'+copy.id,{headers:auth(d.token)})).status).toBe(500)
  })
})

import {makeBackup} from '../shared/model'
import {afterEach,beforeEach,describe,it,expect} from 'vitest'
import {makeEnvironment} from './helpers'
import {completeGoogleBackup,issueGoogleBackupAccess,linkGoogleBackup} from '../worker/google-backup-account'
import {sha} from '../worker/security'
let test:Awaited<ReturnType<typeof makeEnvironment>>
beforeEach(async()=>{test=await makeEnvironment()},30000)
afterEach(async()=>{await test.dispose()})
async function device(){const id=crypto.randomUUID();await test.env.DB.prepare('INSERT INTO backup_devices(id,token_hash,name,created_at) VALUES(?,?,?,?)').bind(id,await sha(crypto.randomUUID()),'Test',test.clock().toISOString()).run();return id}
const person=(subject:string)=>({subject,email:subject+'@example.test'})
describe('Google account backup ownership',()=>{
  it('links the existing namespace in place and issues independent recovery keys',async()=>{
    const id=await device();const account=await linkGoogleBackup(test.env,person('one'),id,test.clock())
    expect(account.namespace_id).toBe(id)
    expect((await linkGoogleBackup(test.env,person('one'),id,test.clock())).namespace_id).toBe(id)
    const a=await issueGoogleBackupAccess(test.env,'one',test.clock()),b=await issueGoogleBackupAccess(test.env,'one',test.clock())
    expect(a.namespace).toBe(id);expect(b.namespace).toBe(id);expect(a.token).not.toBe(b.token)
    const row=await test.env.DB.prepare('SELECT token_hash FROM google_backup_access WHERE id=?').bind(a.id).first<{token_hash:string}>()
    expect(row?.token_hash).toBe(await sha(a.token));expect(row?.token_hash).not.toBe(a.token)
    expect((await test.env.DB.prepare('SELECT COUNT(*) AS count FROM cloud_backups').first<{count:number}>())?.count).toBe(0)
  })
  it('prevents assigning the same history to a different Google account',async()=>{
    const id=await device();await linkGoogleBackup(test.env,person('one'),id,test.clock())
    await expect(linkGoogleBackup(test.env,person('two'),id,test.clock())).rejects.toThrow('another account')
    await expect(issueGoogleBackupAccess(test.env,'two',test.clock())).rejects.toThrow()
  })
  it('does not silently replace the backup already linked to a Google account',async()=>{
    const a=await device(),b=await device();await linkGoogleBackup(test.env,person('one'),a,test.clock())
    await expect(linkGoogleBackup(test.env,person('one'),b,test.clock())).rejects.toThrow('different backup')
    expect((await issueGoogleBackupAccess(test.env,'one',test.clock())).namespace).toBe(a)
  })
  it('refuses a missing or revoked source identity',async()=>{
    await expect(linkGoogleBackup(test.env,person('one'),crypto.randomUUID(),test.clock())).rejects.toThrow()
    const id=await device();await test.env.DB.prepare('UPDATE backup_devices SET revoked=1 WHERE id=?').bind(id).run()
    await expect(linkGoogleBackup(test.env,person('one'),id,test.clock())).rejects.toThrow()
  })
})

async function verifiedRequest(subject:string,source:string|null=null){
  const secret=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','')
  await test.env.DB.prepare("INSERT INTO google_backup_requests(state_hash,poll_hash,nonce,verifier,source_namespace,expires_at,status,google_subject,email) VALUES(?,?,?,?,?,?,'ready',?,?)").bind(await sha(crypto.randomUUID()),await sha(secret),'nonce','',source,test.clock().getTime()+600000,subject,subject+'@example.test').run()
  return secret
}
describe('one-use Google completion',()=>{
  it('creates a private namespace only after verified user consent',async()=>{
    const secret=await verifiedRequest('new-user')
    const key=await completeGoogleBackup(test.env,secret,test.clock(),'link')
    expect(key.email).toBe('new-user@example.test')
    await expect(completeGoogleBackup(test.env,secret,test.clock(),'link')).rejects.toThrow('already used')
    expect((await test.env.DB.prepare('SELECT COUNT(*) AS n FROM google_backup_access').first<{n:number}>())?.n).toBe(1)
  })
  it('keeps an existing namespace and requires a restore choice on another Mac',async()=>{
    const id=await device();await linkGoogleBackup(test.env,person('one'),id,test.clock())
    const secret=await verifiedRequest('one')
    await expect(completeGoogleBackup(test.env,secret,test.clock(),'link')).rejects.toThrow('Review recovery')
    const recovered=await completeGoogleBackup(test.env,secret,test.clock(),'restore')
    expect(recovered.namespace).toBe(id)
  })
  it('permits only one completion when two callers race',async()=>{
    const secret=await verifiedRequest('race-user')
    const results=await Promise.allSettled([completeGoogleBackup(test.env,secret,test.clock(),'link'),completeGoogleBackup(test.env,secret,test.clock(),'link')])
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1)
    expect((await test.env.DB.prepare('SELECT COUNT(*) AS n FROM google_backup_access').first<{n:number}>())?.n).toBe(1)
  })
})

describe('Google access keys use the existing backup API',()=>{
  it('isolates accounts and revokes only the selected device key',async()=>{
    const a=await device(),b=await device();await linkGoogleBackup(test.env,person('a'),a,test.clock());await linkGoogleBackup(test.env,person('b'),b,test.clock())
    const first=await issueGoogleBackupAccess(test.env,'a',test.clock()),second=await issueGoogleBackupAccess(test.env,'a',test.clock()),other=await issueGoogleBackupAccess(test.env,'b',test.clock())
    for(const credential of [first,second,other])expect((await test.fetcher('/api/backups',{headers:{Authorization:'Bearer '+credential.token}})).status).toBe(200)
    expect((await test.fetcher('/api/backups/devices/'+other.id,{method:'DELETE',headers:{Authorization:'Bearer '+first.token}})).status).toBe(403)
    expect((await test.fetcher('/api/backups/devices/'+first.id,{method:'DELETE',headers:{Authorization:'Bearer '+first.token}})).status).toBe(200)
    expect((await test.fetcher('/api/backups',{headers:{Authorization:'Bearer '+first.token}})).status).toBe(401)
    expect((await test.fetcher('/api/backups',{headers:{Authorization:'Bearer '+second.token}})).status).toBe(200)
    expect((await test.fetcher('/api/snapshot',{headers:{Authorization:'Bearer '+second.token}})).status).toBe(401)
  })
})

describe('existing history survives Google linking',()=>{
  it('reuses the original cloud copy instead of adding its count again',async()=>{
    await test.login();await test.mutate(test.op(400,86));const backup=makeBackup(await test.snapshot(),test.clock());test.clearCookie()
    const id=await device(),oldToken='d'.repeat(64)
    await test.env.DB.prepare('UPDATE backup_devices SET token_hash=? WHERE id=?').bind(await sha(oldToken),id).run()
    const upload=(token:string)=>test.fetcher('/api/backups',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({id:crypto.randomUUID(),revision:200,backupJSON:JSON.stringify(backup)})})
    const before=await (await upload(oldToken)).json() as {id:string;applications:number}
    expect(before.applications).toBe(486)
    await linkGoogleBackup(test.env,person('owner'),id,test.clock());const key=await issueGoogleBackupAccess(test.env,'owner',test.clock())
    const after=await (await upload(key.token)).json() as {id:string;applications:number}
    expect(after.id).toBe(before.id);expect(after.applications).toBe(486)
    const otherId=await device();await linkGoogleBackup(test.env,person('other'),otherId,test.clock());const other=await issueGoogleBackupAccess(test.env,'other',test.clock())
    expect((await test.fetcher('/api/backups/'+before.id,{headers:{Authorization:'Bearer '+other.token}})).status).toBe(404)
    const own=await (await test.fetcher('/api/backups/'+before.id,{headers:{Authorization:'Bearer '+key.token}})).json() as {backupJSON:string}
    expect(JSON.parse(own.backupJSON)).toEqual(backup)
  })
})

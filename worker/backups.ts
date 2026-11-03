import {assertUuid,canonical,validateBackup,ValidationError} from '../shared/model'
import {hmac,requireOwner,sha,type Env} from './security'

const headers={'Cache-Control':'no-store, private','Content-Type':'application/json','X-Content-Type-Options':'nosniff','Vary':'Authorization, Cookie'}
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers})
type Device={id:string;name:string}
type Copy={id:string;device_id:string;revision:number;fingerprint:string;sha256:string;applications:number;entries:number;bytes:number;created_at:string}
async function input(request:Request,maximum:number){
  if(Number(request.headers.get('content-length')??0)>maximum)throw new ValidationError('The cloud backup request is too large.')
  const text=await request.text()
  if(new TextEncoder().encode(text).length>maximum)throw new ValidationError('The cloud backup request is too large.')
  try{return JSON.parse(text)}catch{throw new ValidationError('Send valid JSON.')}
}
async function device(request:Request,env:Env):Promise<Device|null>{
  const match=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)
  return match?env.DB.prepare('SELECT id,name FROM backup_devices WHERE token_hash=? AND revoked=0').bind(await sha(match[1])).first<Device>():null
}
export async function backupRoute(request:Request,env:Env,now:Date):Promise<Response|null>{
  const path=new URL(request.url).pathname
  if(!path.startsWith('/api/backups'))return null
  if(path==='/api/backups/devices'&&request.method==='POST'){
    if(!await requireOwner(request,env,now.getTime()))return reply({error:'Sign in to your private workspace to connect this Mac.'},401)
    const value=await input(request,2048) as {id:string;name:string};assertUuid(value.id)
    if(typeof value.name!=='string'||!value.name.trim()||value.name.length>80)throw new ValidationError('Use a device name of 1–80 characters.')
    const token=await hmac(env.SESSION_SECRET!,`backup-device:${value.id}`)
    await env.DB.prepare('INSERT OR IGNORE INTO backup_devices(id,token_hash,name,created_at) VALUES(?,?,?,?)').bind(value.id,await sha(token),value.name.trim(),now.toISOString()).run()
    const registered=await env.DB.prepare('SELECT revoked FROM backup_devices WHERE id=? AND token_hash=?').bind(value.id,await sha(token)).first<{revoked:number}>()
    if(!registered||registered.revoked)return reply({error:'This device connection was revoked. Start a new connection.'},409)
    return reply({id:value.id,token})
  }
  const paired=await device(request,env),owner=paired?false:await requireOwner(request,env,now.getTime())
  if(!paired&&!owner)return reply({error:'Connect a private workspace to access cloud backups.'},401)
  if(path==='/api/backups'&&request.method==='GET'){
    const query=paired?env.DB.prepare('SELECT * FROM cloud_backups WHERE device_id=? ORDER BY revision DESC LIMIT 100').bind(paired.id):env.DB.prepare('SELECT * FROM cloud_backups ORDER BY created_at DESC LIMIT 100')
    return reply({backups:(await query.all<Copy>()).results})
  }
  const deviceMatch=path.match(/^\/api\/backups\/devices\/([a-f0-9-]{36})$/i)
  if(deviceMatch&&request.method==='DELETE'){
    if(!owner&&paired?.id!==deviceMatch[1])return reply({error:'Owner sign-in is required to revoke another device.'},403)
    await env.DB.prepare('UPDATE backup_devices SET revoked=1 WHERE id=?').bind(deviceMatch[1]).run()
    return reply({revoked:true})
  }
  if(path==='/api/backups'&&request.method==='POST'){
    if(!paired)return reply({error:'A paired device is required to upload a backup.'},403)
    const value=await input(request,16_000_000) as {id:string;revision:number;backupJSON:string};assertUuid(value.id)
    if(!Number.isSafeInteger(value.revision)||value.revision<0||typeof value.backupJSON!=='string')throw new ValidationError('Invalid backup revision or content.')
    const bytes=new TextEncoder().encode(value.backupJSON).length
    if(bytes>12_000_000)throw new ValidationError('Cloud backups support up to 12 MB. Your local history is retained.')
    let parsed:unknown;try{parsed=JSON.parse(value.backupJSON)}catch{throw new ValidationError('Invalid backup JSON.')}
    const backup=validateBackup(parsed,now.toISOString().slice(0,10))
    const fingerprint=await sha(canonical({entries:[...backup.entries].sort((a,b)=>a.id.localeCompare(b.id)),policies:backup.policies,overrides:backup.overrides,trackingStart:backup.trackingStart}))
    const existing=await env.DB.prepare('SELECT * FROM cloud_backups WHERE device_id=? AND revision=?').bind(paired.id,value.revision).first<Copy>()
    if(existing)return existing.fingerprint===fingerprint?reply(existing):reply({error:'This revision already has different saved data. Both local history and the previous cloud copy are retained.'},409)
    const latest=await env.DB.prepare('SELECT id,revision FROM cloud_backups WHERE device_id=? ORDER BY revision DESC LIMIT 1').bind(paired.id).first<{id:string;revision:number}>()
    if(latest&&value.revision<latest.revision)return reply({error:'A newer cloud copy exists. Review recovery before uploading older history.'},409)
    if(latest){
      const previous=await env.DB.prepare('SELECT content FROM cloud_backup_chunks WHERE backup_id=? ORDER BY position').bind(latest.id).all<{content:string}>()
      const old=validateBackup(JSON.parse(previous.results.map(chunk=>chunk.content).join('')),now.toISOString().slice(0,10)),ids=new Set(backup.entries.map(entry=>entry.id))
      if(old.entries.some(entry=>!ids.has(entry.id)))return reply({error:'History protection stopped an incomplete backup. Recover the missing records before replacing the latest copy.'},409)
    }
    const digest=await sha(value.backupJSON),active=backup.entries.filter(entry=>!entry.deleted),created=now.toISOString()
    const statements=[env.DB.prepare('INSERT INTO cloud_backups(id,device_id,revision,fingerprint,sha256,applications,entries,bytes,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(value.id,paired.id,value.revision,fingerprint,digest,active.reduce((sum,entry)=>sum+entry.easy+entry.external,0),backup.entries.length,bytes,created)]
    for(let offset=0,position=0;offset<value.backupJSON.length;position++){
      let end=Math.min(offset+400_000,value.backupJSON.length)
      if(end<value.backupJSON.length&&/[\uD800-\uDBFF]/.test(value.backupJSON[end-1])&&/[\uDC00-\uDFFF]/.test(value.backupJSON[end]))end--
      statements.push(env.DB.prepare('INSERT INTO cloud_backup_chunks(backup_id,position,content) VALUES(?,?,?)').bind(value.id,position,value.backupJSON.slice(offset,end)));offset=end
    }
    try{await env.DB.batch(statements)}catch(error){
      const duplicate=await env.DB.prepare('SELECT * FROM cloud_backups WHERE device_id=? AND revision=?').bind(paired.id,value.revision).first<Copy>()
      if(duplicate?.fingerprint===fingerprint)return reply(duplicate)
      if(duplicate)return reply({error:'A conflicting backup revision was retained. Review recovery.'},409)
      if(String(error).includes('cloud_backup_stale_revision'))return reply({error:'A newer cloud copy was saved first. Your local history is retained.'},409)
      throw error
    }
    // Versions rotate; each retained version contains the entire saved history.
    await env.DB.prepare("DELETE FROM cloud_backups WHERE device_id=? AND id NOT IN (SELECT id FROM cloud_backups WHERE device_id=? ORDER BY revision DESC LIMIT 24) AND id NOT IN (SELECT id FROM cloud_backups WHERE device_id=? AND created_at>=? GROUP BY substr(created_at,1,10) HAVING revision=MAX(revision))").bind(paired.id,paired.id,paired.id,new Date(now.getTime()-90*86400000).toISOString()).run()
    return reply(await env.DB.prepare('SELECT * FROM cloud_backups WHERE id=?').bind(value.id).first<Copy>())
  }
  const copyMatch=path.match(/^\/api\/backups\/([a-f0-9-]{36})$/i)
  if(copyMatch&&request.method==='GET'){
    const copy=await env.DB.prepare('SELECT * FROM cloud_backups WHERE id=?').bind(copyMatch[1]).first<Copy>()
    if(!copy||paired&&copy.device_id!==paired.id)return reply({error:'Backup not found.'},404)
    const chunks=await env.DB.prepare('SELECT content FROM cloud_backup_chunks WHERE backup_id=? ORDER BY position').bind(copy.id).all<{content:string}>(),backupJSON=chunks.results.map(chunk=>chunk.content).join('')
    if(await sha(backupJSON)!==copy.sha256)return reply({error:'This copy failed its integrity check. Other versions remain retained.'},500)
    return reply({...copy,backupJSON})
  }
  return reply({error:'Unknown cloud backup endpoint.'},404)
}

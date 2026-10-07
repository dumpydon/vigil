import { assertUuid, canonical, importPreview, makeBackup, shiftDay, utcDay, validateBackup, validateMutation, ValidationError, type Entry, type Goal, type Mutation, type Snapshot } from '../shared/model'
import { cookieName, cookieToken, hmac, requireOwner, safeOrigin, sessionCookie, SESSION_SECONDS, sha, verifyPassword, type Env } from './security'

type Row={id:string;date:string;easy:number;external:number;logged_at:string;created_at:string;updated_at:string;version:number;deleted:number;backdated:number}
const entryJson="json_object('id',id,'date',date,'easy',easy,'external',external,'loggedAt',logged_at,'createdAt',created_at,'updatedAt',updated_at,'version',version,'deleted',json(CASE WHEN deleted=1 THEN 'true' ELSE 'false' END),'backdated',json(CASE WHEN backdated=1 THEN 'true' ELSE 'false' END))"
const jsonHeaders={'Content-Type':'application/json','Cache-Control':'no-store, private','Vary':'Cookie','X-Content-Type-Options':'nosniff'}
function response(body:unknown,status=200,headers:Record<string,string>={}){return Response.json(body,{status,headers:{...jsonHeaders,...headers}})}
function mapped(r:Row):Entry{return {id:r.id,date:r.date,easy:r.easy,external:r.external,loggedAt:r.logged_at,createdAt:r.created_at,updatedAt:r.updated_at,version:r.version,deleted:!!r.deleted,backdated:!!r.backdated}}
async function body(request:Request,max=100_000):Promise<unknown>{
  if(Number(request.headers.get('content-length')??0)>max)throw new ValidationError('This request is too large.')
  const text=await request.text();if(new TextEncoder().encode(text).length>max)throw new ValidationError('This request is too large.')
  try{return JSON.parse(text)}catch{throw new ValidationError('Send valid JSON.')}
}
async function initialize(env:Env,today:string){await env.DB.prepare('INSERT OR IGNORE INTO owner_settings(id,tracking_start) VALUES(1,?)').bind(today).run()}
export async function readSnapshot(env:Env,now:Date,pending:string[]=[]):Promise<Snapshot>{
  const results=await env.DB.batch([
    env.DB.prepare('SELECT tracking_start,revision,goal_revision FROM owner_settings WHERE id=1'),
    env.DB.prepare('SELECT * FROM entries ORDER BY logged_at DESC,id'),
    env.DB.prepare('SELECT date,value FROM goal_policies ORDER BY date'),
    env.DB.prepare('SELECT date,value FROM goal_overrides ORDER BY date'),
    env.DB.prepare('SELECT id FROM mutation_receipts WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(pending)),
  ])
  const setting=results[0].results[0] as {tracking_start:string;revision:number;goal_revision:number}|undefined
  if(!setting)throw new Error('Owner workspace is not initialized.')
  return {entries:(results[1].results as unknown as Row[]).map(mapped),policies:results[2].results as unknown as Goal[],overrides:results[3].results as unknown as Goal[],trackingStart:setting.tracking_start,revision:setting.revision,goalRevision:setting.goal_revision,serverNow:now.toISOString(),acknowledged:results[4].results.map(row=>String((row as {id:string}).id))}
}
async function login(request:Request,env:Env,now:Date){
  if(!env.OWNER_PASSWORD_HASH||!env.SESSION_SECRET)return response({error:'Owner sign-in is not configured yet.',code:'SETUP_REQUIRED'},503)
  const input=await body(request,2048) as {id:string;password:string};assertUuid(input.id)
  if(typeof input.password!=='string'||input.password.length>256||input.password.length<1)throw new ValidationError('Enter your owner password.')
  const nowMs=now.getTime(),windowStart=Math.floor(nowMs/900_000)*900_000
  const ip=request.headers.get('cf-connecting-ip')??'local'
  const keys=[await hmac(env.SESSION_SECRET,`login:${ip}`),await hmac(env.SESSION_SECRET,'login:global')]
  const limits=await env.DB.batch(keys.map(k=>env.DB.prepare('INSERT INTO login_limits(key_hash,window_start,attempts) VALUES(?,?,1) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN window_start=excluded.window_start THEN attempts+1 ELSE 1 END,window_start=excluded.window_start RETURNING attempts').bind(k,windowStart)))
  const attempts=limits.map(r=>Number((r.results[0] as {attempts:number}).attempts))
  if(attempts[0]>10||attempts[1]>30)return response({error:'Too many sign-in attempts. Try again in 15 minutes.'},429,{'Retry-After':'900'})
  if(!await verifyPassword(input.password,env.OWNER_PASSWORD_HASH))return response({error:'That password was not recognized.'},401)
  // HMAC of a random operation UUID gives an opaque, unpredictable token and repeatable login receipt.
  // Only its hash is stored in D1. No plaintext token or password is retained there.
  const token=await hmac(env.SESSION_SECRET,`session:${input.id}`),tokenHash=await sha(token),requestHash=await hmac(env.SESSION_SECRET,canonical(input))
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO owner_sessions(token_hash,operation_id,request_hash,created_at,expires_at,key_hash) VALUES(?,?,?,?,?,?)').bind(tokenHash,input.id,requestHash,nowMs,nowMs+SESSION_SECONDS*1000,await sha(env.SESSION_SECRET)),
    env.DB.prepare('INSERT OR IGNORE INTO owner_settings(id,tracking_start) VALUES(1,?)').bind(utcDay(now)),
    env.DB.prepare('DELETE FROM owner_sessions WHERE expires_at<?').bind(nowMs-86_400_000),
    env.DB.prepare('DELETE FROM login_limits WHERE window_start<?').bind(windowStart-86_400_000),
  ])
  const session=await env.DB.prepare('SELECT request_hash,expires_at,revoked FROM owner_sessions WHERE operation_id=?').bind(input.id).first<{request_hash:string;expires_at:number;revoked:number}>()
  if(!session||session.request_hash!==requestHash)return response({error:'This sign-in operation ID was already used with different data.'},409)
  if(session.revoked||session.expires_at<=nowMs)return response({error:'Start a new sign-in attempt.'},401)
  return response({authenticated:true,expiresAt:new Date(session.expires_at).toISOString()},200,{'Set-Cookie':sessionCookie(request,token,(session.expires_at-nowMs)/1000)})
}
async function receipt(env:Env,id:string){return env.DB.prepare('SELECT request_hash,response_json FROM mutation_receipts WHERE id=?').bind(id).first<{request_hash:string;response_json:string}>()}
function replay(stored:{request_hash:string;response_json:string},hash:string){return stored.request_hash===hash?response(JSON.parse(stored.response_json)):response({error:'This operation ID was already used with different data.',code:'IDEMPOTENCY_MISMATCH'},409)}
async function mutate(op:Mutation,env:Env,now:Date){
  const hash=await sha(canonical(op)),prior=await receipt(env,op.id);if(prior)return replay(prior,hash)
  const stamp=now.toISOString(),target=op.type==='create'?op.entry.id:('entryId'in op?op.entryId:null)
  const statements=[env.DB.prepare('INSERT INTO mutation_receipts(id,request_hash,kind,entry_id,expected_version,expected_revision,created_at) VALUES(?,?,?,?,?,?,?)').bind(op.id,hash,op.type,target,'expectedVersion'in op?op.expectedVersion:null,'expectedRevision'in op?op.expectedRevision:null,stamp)]
  if(op.type==='create'){
    const e=op.entry
    statements.push(env.DB.prepare('INSERT INTO entries(id,date,easy,external,logged_at,created_at,updated_at,version,backdated) VALUES(?,?,?,?,?,?,?,1,?)').bind(e.id,e.date,e.easy,e.external,e.loggedAt,stamp,stamp,e.backdated?1:0))
    statements.push(env.DB.prepare('UPDATE owner_settings SET tracking_start=MIN(tracking_start,?) WHERE id=1').bind(e.date))
  }else if(op.type==='update'){
    statements.push(env.DB.prepare('UPDATE entries SET date=?,easy=?,external=?,updated_at=?,version=version+1,backdated=CASE WHEN substr(logged_at,1,10)<>? THEN 1 ELSE 0 END WHERE id=?').bind(op.date,op.easy,op.external,stamp,op.date,op.entryId))
    statements.push(env.DB.prepare('UPDATE owner_settings SET tracking_start=MIN(tracking_start,?) WHERE id=1').bind(op.date))
  }else if(op.type==='delete'){
    statements.push(env.DB.prepare('UPDATE entries SET deleted=1,version=version+1,updated_at=? WHERE id=?').bind(stamp,op.entryId))
  }else if(op.type==='goal'){
    statements.push(env.DB.prepare('INSERT INTO goal_overrides(date,value) VALUES(?,?) ON CONFLICT(date) DO UPDATE SET value=excluded.value').bind(op.date,op.value))
    if(op.future)statements.push(env.DB.prepare('INSERT INTO goal_policies(date,value) VALUES(?,?) ON CONFLICT(date) DO UPDATE SET value=excluded.value').bind(shiftDay(op.date,1),op.value))
    statements.push(env.DB.prepare('UPDATE owner_settings SET goal_revision=goal_revision+1 WHERE id=1'))
  }else{
    for(const item of op.items){
      if(item.kind==='entry'){
        const e=item.entry
        statements.push(env.DB.prepare('INSERT OR IGNORE INTO entries(id,date,easy,external,logged_at,created_at,updated_at,version,deleted,backdated) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(e.id,e.date,e.easy,e.external,e.loggedAt,e.createdAt,e.updatedAt,e.version,e.deleted?1:0,e.backdated?1:0))
      }else{
        const table=item.kind==='policy'?'goal_policies':'goal_overrides'
        statements.push(env.DB.prepare(`INSERT OR IGNORE INTO ${table}(date,value) VALUES(?,?)`).bind(item.date,item.value))
      }
      statements.push(env.DB.prepare('UPDATE mutation_receipts SET imported_count=imported_count+changes() WHERE id=?').bind(op.id))
    }
    statements.push(env.DB.prepare('UPDATE owner_settings SET tracking_start=MIN(tracking_start,?),goal_revision=goal_revision+1 WHERE id=1').bind(op.trackingStart))
  }
  statements.push(env.DB.prepare('UPDATE owner_settings SET revision=revision+1 WHERE id=1'))
  statements.push(env.DB.prepare(`UPDATE mutation_receipts SET response_json=json_object('revision',(SELECT revision FROM owner_settings WHERE id=1),'goalRevision',(SELECT goal_revision FROM owner_settings WHERE id=1),'entry',json((SELECT ${entryJson} FROM entries WHERE id=?)),'imported',imported_count) WHERE id=?`).bind(target,op.id))
  statements.push(env.DB.prepare('SELECT response_json FROM mutation_receipts WHERE id=?').bind(op.id))
  try{
    const results=await env.DB.batch(statements)
    const raw=String((results[results.length-1].results[0] as {response_json:string}).response_json)
    return response(JSON.parse(raw))
  }catch(error){
    // A duplicate receipt aborts the entire transaction. Re-read only after rollback.
    const stored=await receipt(env,op.id);if(stored)return replay(stored,hash)
    if(/entry_version_conflict|entry_id_conflict|goal_version_conflict/.test(String(error))){
      const row=target?await env.DB.prepare('SELECT * FROM entries WHERE id=?').bind(target).first<Row>():null
      return response({error:'This record changed in another tab. Review the cloud value before continuing.',code:'CONFLICT',entry:row?mapped(row):null,snapshot:await readSnapshot(env,now)},409)
    }
    throw error
  }
}

export function createHandler(clock:()=>Date=()=>new Date()){
  return async(request:Request,env:Env):Promise<Response>=>{
    const url=new URL(request.url),now=clock(),today=utcDay(now)
    try{
      if(!url.pathname.startsWith('/api/')){
        const asset=await env.ASSETS.fetch(request)
        const headers=new Headers(asset.headers)
        headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin')
        headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
        if(url.pathname==='/sw.js')headers.set('Cache-Control','no-cache')
        return new Response(asset.body,{status:asset.status,headers})
      }
      if(request.method!=='GET'&&!safeOrigin(request))return response({error:'Use a same-origin JSON request.'},403)
      if(url.pathname==='/api/login'&&request.method==='POST')return await login(request,env,now)
      if(url.pathname==='/api/logout'&&request.method==='POST'){
        const input=await body(request,1024) as {id:string};assertUuid(input.id)
        const token=cookieToken(request),hash=token?await sha(token):''
        const prior=await env.DB.prepare('SELECT session_hash FROM auth_receipts WHERE id=?').bind(input.id).first<{session_hash:string}>()
        if(prior&&hash&&prior.session_hash!==hash)return response({error:'That sign-out operation belongs to another session.'},409)
        if(!prior){
          const known=hash?await env.DB.prepare('SELECT token_hash FROM owner_sessions WHERE token_hash=?').bind(hash).first():null
          if(!known)return response({error:'Owner authentication is required.'},401)
          try{await env.DB.batch([
            env.DB.prepare('INSERT INTO auth_receipts(id,session_hash,created_at) VALUES(?,?,?)').bind(input.id,hash,now.toISOString()),
            env.DB.prepare('UPDATE owner_sessions SET revoked=1 WHERE token_hash=? AND revoked=0').bind(hash),
          ])}catch(error){
            const stored=await env.DB.prepare('SELECT session_hash FROM auth_receipts WHERE id=?').bind(input.id).first<{session_hash:string}>()
            if(!stored)throw error
            if(stored.session_hash!==hash)return response({error:'That sign-out operation belongs to another session.'},409)
          }
        }
        return response({authenticated:false},200,{'Set-Cookie':`${cookieName(request)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${url.protocol==='https:'?'; Secure':''}`})
      }
      if(!await requireOwner(request,env,now.getTime()))return response({error:'Sign in to sync your applications.',code:'AUTH_REQUIRED'},401)
      if(url.pathname==='/api/session'&&request.method==='GET')return response({authenticated:true})
      if((url.pathname==='/api/snapshot'||url.pathname==='/api/dashboard')&&request.method==='GET'){
        const pending=(url.searchParams.get('pending')??'').split(',').filter(Boolean)
        if(pending.length>128)throw new ValidationError('Too many pending receipt IDs in one request.')
        pending.forEach(assertUuid)
        return response(await readSnapshot(env,now,pending))
      }
      if(url.pathname==='/api/entries'&&request.method==='GET'){
        const date=url.searchParams.get('date'),offset=Math.max(0,Number(url.searchParams.get('offset')??0)||0)
        const query=date?'SELECT * FROM entries WHERE date=? AND deleted=0 ORDER BY logged_at DESC,id LIMIT 51 OFFSET ?':'SELECT * FROM entries WHERE deleted=0 ORDER BY logged_at DESC,id LIMIT 51 OFFSET ?'
        const rows=await (date?env.DB.prepare(query).bind(date,offset):env.DB.prepare(query).bind(offset)).all<Row>()
        return response({entries:rows.results.slice(0,50).map(mapped),nextOffset:rows.results.length>50?offset+50:null})
      }
      if(url.pathname==='/api/goals'&&request.method==='GET'){
        const s=await readSnapshot(env,now);return response({policies:s.policies,overrides:s.overrides,trackingStart:s.trackingStart,goalRevision:s.goalRevision})
      }
      if(url.pathname==='/api/export'&&request.method==='GET'){
        const backup=makeBackup(await readSnapshot(env,now),now)
        if(url.searchParams.get('format')==='csv'){
          const fields=['id','date','loggedAt','createdAt','updatedAt','easy','external','version','deleted','backdated'] as const
          const csv=[fields.join(','),...backup.entries.map(e=>fields.map(k=>JSON.stringify(e[k])).join(','))].join('\r\n')
          return new Response(csv,{headers:{...jsonHeaders,'Content-Type':'text/csv;charset=utf-8','Content-Disposition':`attachment; filename="vigil-${today}.csv"`}})
        }
        return response(backup,200,{'Content-Disposition':`attachment; filename="vigil-${today}.json"`})
      }
      if(url.pathname==='/api/import/preview'&&request.method==='POST'){
        const data=await body(request,12_000_000) as {id:string;backup:unknown};assertUuid(data.id)
        const backup=validateBackup(data.backup,today)
        const preview=importPreview(await readSnapshot(env,now),backup)
        return response({newRecords:preview.items.length,duplicates:preview.duplicates,conflicts:preview.conflicts})
      }
      if(['POST','PATCH','DELETE','PUT'].includes(request.method)){
        const op=validateMutation(await body(request),today)
        const valid=(op.type==='create'&&url.pathname==='/api/entries'&&request.method==='POST')||
          ((op.type==='update'||op.type==='delete')&&url.pathname===`/api/entries/${op.entryId}`&&request.method===(op.type==='update'?'PATCH':'DELETE'))||
          (op.type==='goal'&&url.pathname===`/api/goals/${op.date}`&&request.method==='PUT')||
          (op.type==='import'&&url.pathname==='/api/import'&&request.method==='POST')
        if(!valid)return response({error:'Unknown mutation endpoint.'},404)
        await initialize(env,today)
        return await mutate(op,env,now)
      }
      return response({error:'Not found.'},404)
    }catch(error){
      if(error instanceof ValidationError)return response({error:error.message,code:'VALIDATION'},400)
      return response({error:'Vigil could not complete this request. Your pending work is still retained.',code:'SERVER_ERROR'},500)
    }
  }
}
export default {fetch:createHandler()}

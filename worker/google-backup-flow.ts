import {backupAccess} from './backup-access'
import {hex,sha,hmac,type Env} from './security'
import {completeGoogleBackup} from './google-backup-account'
import {verifyGoogleIdentity} from './google-identity'
export interface GoogleBackupEnv extends Env {GOOGLE_CLIENT_ID?:string;GOOGLE_CLIENT_SECRET?:string}
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)))
const reply=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}})
const page=(ok:boolean)=>new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Apply Vigil</title><body style="background:#101115;color:#eee;font:16px system-ui;max-width:520px;margin:15vh auto;padding:24px"><h1>${ok?'Google confirmed your account':'Sign-in did not finish'}</h1><p>${ok?'Return to Apply Vigil to finish setting up your backup.':'Return to Apply Vigil and try again. Your local history is safe.'}</p></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"}})
interface Pending {state_hash:string;poll_hash:string;nonce:string;verifier:string;source_namespace:string|null;expires_at:number;status:string;google_subject:string|null;email:string|null;error:string|null}
/** Browser confirmation only; never returns app access keys to the browser. */
export async function googleBackupFlow(request:Request,env:GoogleBackupEnv,now:Date,transport:typeof fetch=fetch):Promise<Response|null>{
  const url=new URL(request.url),route=url.pathname
  if(!route.startsWith('/api/google/'))return null
  if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||!env.SESSION_SECRET)return reply({error:'Google backup setup is not available yet. Your history stays on this Mac.'},503)
  const callback=url.origin+'/api/google/callback'
  if(route==='/api/google/start'&&request.method==='POST'){
    const raw=await request.text();if(raw.length>2048)return reply({error:'Request too large.'},400)
    let input:{pollSecret?:string};try{input=JSON.parse(raw)}catch{return reply({error:'Invalid request.'},400)}
    if(!input||typeof input.pollSecret!=='string'||!/^([a-f0-9]{64})$/.test(input.pollSecret))return reply({error:'Invalid private sign-in request.'},400)
    // Bound unauthenticated start requests without storing the raw address.
    const rateKey=await hmac(env.SESSION_SECRET,'google-start:'+ (request.headers.get('cf-connecting-ip')??'local'))
    const window=Math.floor(now.getTime()/600000)*600000
    const limit=await env.DB.prepare('INSERT INTO login_limits(key_hash,window_start,attempts) VALUES(?,?,1) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN window_start=excluded.window_start THEN attempts+1 ELSE 1 END,window_start=excluded.window_start RETURNING attempts').bind(rateKey,window).first<{attempts:number}>()
    if(!limit||limit.attempts>15)return reply({error:'Please wait before trying Google sign-in again.'},429)
    let source:string|null=null
    const authorization=request.headers.get('authorization')
    if(authorization){
      const token=authorization.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
      if(!token)return reply({error:'Invalid backup connection.'},401)
      const device=await backupAccess(request,env)
      if(!device)return reply({error:'The saved backup connection needs recovery.'},401)
      source=device.id
    }
    const state=random(),nonce=random(),verifier=random(),pollHash=await sha(input.pollSecret)
    await env.DB.prepare('DELETE FROM google_backup_requests WHERE expires_at<?').bind(now.getTime()-86400000).run()
    await env.DB.prepare("INSERT INTO google_backup_requests(state_hash,poll_hash,nonce,verifier,source_namespace,expires_at,status) VALUES(?,?,?,?,?,?,'pending')").bind(await sha(state),pollHash,nonce,verifier,source,now.getTime()+600000).run()
    const challenge=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')
    const target=new URL('https://accounts.google.com/o/oauth2/v2/auth')
    target.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:callback,response_type:'code',scope:'openid email',state,nonce,code_challenge:challenge,code_challenge_method:'S256',prompt:'select_account'}).toString()
    return reply({authorizationURL:target.href,expiresAt:now.getTime()+600000})
  }
  if(route==='/api/google/callback'&&request.method==='GET'){
    const state=url.searchParams.get('state')??''
    if(!/^[a-f0-9]{64}$/.test(state))return page(false)
    // Claim once before exchanging. Replays cannot replace an approved identity.
    const pending=await env.DB.prepare("UPDATE google_backup_requests SET status='exchanging' WHERE state_hash=? AND status='pending' AND expires_at>? RETURNING *").bind(await sha(state),now.getTime()).first<Pending>()
    if(!pending){
      const prior=await env.DB.prepare('SELECT status FROM google_backup_requests WHERE state_hash=?').bind(await sha(state)).first<{status:string}>()
      return page(prior?.status==='ready'||prior?.status==='consumed')
    }
    let stage='Google approval'
    try{
      const code=url.searchParams.get('code');if(url.searchParams.has('error')||!code||code.length>4096)throw new Error('Google sign-in was cancelled.')
      stage='Google code exchange'
      const result=await transport('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:callback,code_verifier:pending.verifier}),redirect:'manual',signal:AbortSignal.timeout(20000)})
      if(!result.ok){const rejected=await result.json() as {error?:string};stage+=' ('+String(rejected.error??result.status).replace(/[^a-zA-Z0-9_-]/g,'').slice(0,60)+')';throw new Error('Google sign-in could not be confirmed.')}
      const tokens=await result.json() as {id_token?:string}
      if(!tokens.id_token)throw new Error('Google did not return an identity.')
      stage='Google signing keys'
      const keyResponse=await transport('https://www.googleapis.com/oauth2/v3/certs',{redirect:'manual',signal:AbortSignal.timeout(15000)})
      if(!keyResponse.ok)throw new Error('Google signing keys are unavailable.')
      const keys=await keyResponse.json() as {keys:(JsonWebKey&{kid:string})[]}
      stage='Google identity verification'
      const identity=await verifyGoogleIdentity(tokens.id_token,env.GOOGLE_CLIENT_ID,pending.nonce,now.getTime(),keys.keys)
      stage='Saving Google approval'
      await env.DB.prepare("UPDATE google_backup_requests SET status='ready',google_subject=?,email=?,verifier='' WHERE state_hash=? AND status='exchanging'").bind(identity.subject,identity.email,pending.state_hash).run()
      return page(true)
    }catch{
      await env.DB.prepare("UPDATE google_backup_requests SET status='failed',error=?,verifier='' WHERE state_hash=? AND status='exchanging'").bind(stage+' did not finish. Please try again.',pending.state_hash).run()
      return page(false)
    }
  }
  if(route==='/api/google/finish'&&request.method==='POST'){
    const raw=await request.text();if(raw.length>1024)return reply({error:'Request too large.'},400)
    let value:{pollSecret?:string;choice?:string};try{value=JSON.parse(raw)}catch{return reply({error:'Invalid request.'},400)}
    if(!value||typeof value.pollSecret!=='string'||!['link','restore'].includes(value.choice??''))return reply({error:'Choose link or reviewed recovery.'},400)
    try{return reply(await completeGoogleBackup(env,value.pollSecret,now,value.choice as 'link'|'restore'))}
    catch(error){return reply({error:error instanceof Error?error.message:'Sign-in could not finish.'},409)}
  }
  if(route==='/api/google/status'&&request.method==='POST'){
    const text=await request.text();if(text.length>1024)return reply({error:'Request too large.'},400)
    let value:{pollSecret?:string};try{value=JSON.parse(text)}catch{return reply({error:'Invalid request.'},400)}
    if(!value||typeof value.pollSecret!=='string'||!/^([a-f0-9]{64})$/.test(value.pollSecret))return reply({error:'Invalid private sign-in request.'},400)
    const pending=await env.DB.prepare('SELECT * FROM google_backup_requests WHERE poll_hash=? AND expires_at>?').bind(await sha(value.pollSecret),now.getTime()).first<Pending>()
    if(!pending)return reply({error:'Sign-in expired. Please try again.'},410)
    let account:{namespace_id:string}|null=null,copy:Record<string,unknown>|null=null
    if(pending.status==='ready'){
      account=await env.DB.prepare('SELECT namespace_id FROM google_backup_accounts WHERE google_subject=?').bind(pending.google_subject).first<{namespace_id:string}>()
      if(account){
        copy=await env.DB.prepare('SELECT * FROM cloud_backups WHERE device_id=? ORDER BY revision DESC LIMIT 1').bind(account.namespace_id).first<Record<string,unknown>>()
        if(copy){const chunks=await env.DB.prepare('SELECT content FROM cloud_backup_chunks WHERE backup_id=? ORDER BY position').bind(copy.id).all<{content:string}>();const raw=chunks.results.map(row=>row.content).join('');if(await sha(raw)!==copy.sha256)return reply({error:'The cloud copy failed verification.'},500);copy={...copy,backupJSON:raw}}
      }
    }
    return reply({status:pending.status,email:pending.status==='ready'?pending.email:undefined,error:pending.error||undefined,hasAccount:!!account,sameNamespace:!!account&&account.namespace_id===pending.source_namespace,copy})
  }
  return reply({error:'Unknown Google backup action.'},404)
}

export interface Env { DB:D1Database; ASSETS:Fetcher; OWNER_PASSWORD_HASH?:string; SESSION_SECRET?:string }
const encoder=new TextEncoder()
export const SESSION_SECONDS=90*24*60*60
export const COOKIE='vigil_session'
export function cookieName(request:Request){return new URL(request.url).protocol==='https:'?'__Host-vigil_session':COOKIE}
export function hex(bytes:ArrayBuffer|Uint8Array):string{return Array.from(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('')}
export async function sha(value:string):Promise<string>{return hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)))}
export async function hmac(secret:string,value:string):Promise<string>{
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign'])
  return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(value)))
}
export async function verifyPassword(password:string,encoded:string):Promise<boolean>{
  const [algorithm,iterations,salt,wanted]=encoded.split('$')
  if(algorithm!=='pbkdf2-sha256'||iterations!=='100000'||!/^[a-f0-9]{32}$/.test(salt??'')||!/^[a-f0-9]{64}$/.test(wanted??''))return false
  const bytes=Uint8Array.from(salt.match(/../g)!,v=>parseInt(v,16))
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits'])
  const actual=hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt:bytes},key,256))
  let diff=0;for(let i=0;i<64;i++)diff|=actual.charCodeAt(i)^wanted.charCodeAt(i)
  return diff===0
}
export function cookieToken(request:Request):string|null{
  const name=cookieName(request)
  const value=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`))?.slice(name.length+1)
  return value&&/^[a-f0-9]{64}$/.test(value)?value:null
}
export function sessionCookie(request:Request,token:string,seconds:number):string{
  return `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0,Math.floor(seconds))}${new URL(request.url).protocol==='https:'?'; Secure':''}`
}
export function safeOrigin(request:Request):boolean{
  const url=new URL(request.url),origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site')
  if(site==='cross-site')return false
  return !!origin && origin===url.origin && request.headers.get('content-type')?.split(';')[0]==='application/json'
}
export async function requireOwner(request:Request,env:Env,now:number):Promise<boolean>{
  const token=cookieToken(request);if(!token||!env.SESSION_SECRET)return false
  const row=await env.DB.prepare('SELECT expires_at, revoked, key_hash FROM owner_sessions WHERE token_hash=?').bind(await sha(token)).first<{expires_at:number;revoked:number;key_hash:string}>()
  return !!row&&!row.revoked&&row.expires_at>now&&row.key_hash===await sha(env.SESSION_SECRET)
}

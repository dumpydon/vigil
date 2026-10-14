// Only the bundled desktop UI gets this bridge. The regular website uses fetch.
import type {AlertSound} from './sounds'
export interface DesktopSettings {
  launchAtLogin:boolean
  loginStatus:string
  notifications:boolean
  notificationStatus:string
  sound:AlertSound
  menuDisplay:'count'|'percent'|'icon'
  pinned:boolean
  version:string
}
interface NativeBridge {
  postMessage(message:{command:string;[key:string]:unknown}):Promise<unknown>
}
declare global {
  interface Window {
    __APPLY_VIGIL_NATIVE__?:{version:string;testing?:boolean;surface?:'dashboard'|'compact';localOnly?:boolean}
    webkit?:{messageHandlers?:{applyVigil?:NativeBridge}}
  }
}
export const isNative=typeof window!=='undefined'&&!!window.__APPLY_VIGIL_NATIVE__
export const isDesktopPreview=typeof window!=='undefined'&&import.meta.env.DEV&&new URLSearchParams(location.search).has('desktop-preview')
export const isDesktop=isNative||isDesktopPreview
export const isLocalOnly=isNative&&window.__APPLY_VIGIL_NATIVE__?.localOnly===true
export const desktopVersion=isNative?window.__APPLY_VIGIL_NATIVE__!.version:'1.0.0'
export const isCompactSurface=(isNative&&window.__APPLY_VIGIL_NATIVE__?.surface==='compact')||(isDesktopPreview&&new URLSearchParams(location.search).has('compact-preview'))
export const markSource=isNative?'./mark.svg':'/mark.svg'

export function validApiRequest(path:string,method:string){
  if(!path.startsWith('/api/')||path.includes('..')||path.includes('#')||path.includes('\\'))return false
  const parts=path.split('?')
  if(parts.length>2)return false
  const [route,query]=parts
  if(query!==undefined&&(route!=='/api/snapshot'||!/^pending=[a-f0-9,-]{1,5000}$/i.test(query)))return false
  if(method==='GET')return ['/api/session','/api/snapshot','/api/dashboard','/api/export','/api/entries','/api/goals'].includes(route)
  if(method==='POST')return ['/api/login','/api/logout','/api/entries','/api/import','/api/import/preview'].includes(route)
  if(method==='PUT')return /^\/api\/(days|goals)\/\d{4}-\d{2}-\d{2}$/.test(route)
  return (method==='PATCH'||method==='DELETE')&&/^\/api\/entries\/[a-f0-9-]{36}$/i.test(route)
}

export async function desktopCall<T=unknown>(command:string,payload:Record<string,unknown>={}):Promise<T>{
  const bridge=window.webkit?.messageHandlers?.applyVigil
  if(!isNative||!bridge)throw new Error('This action is available in the installed Mac app.')
  return await bridge.postMessage({command,...payload}) as T
}

export async function nativeRequest(path:string,init:RequestInit={},send:(command:string,payload:Record<string,unknown>)=>Promise<{status:number;body:string}>=desktopCall):Promise<Response>{
  const method=(init.method??'GET').toUpperCase()
  if(!validApiRequest(path,method))throw new Error('This desktop request is not allowed.')
  if(init.signal?.aborted)throw new DOMException('The request was cancelled.','AbortError')
  let abort:(()=>void)|undefined
  const cancelled=new Promise<never>((_,reject)=>{
    abort=()=>reject(new DOMException('The request was cancelled.','AbortError'))
    init.signal?.addEventListener('abort',abort,{once:true})
  })
  try{
    const result=await Promise.race([send('request',{path,method,body:typeof init.body==='string'?init.body:undefined}),cancelled])
    return new Response(result.body,{status:result.status,headers:{'Content-Type':'application/json'}})
  }finally{if(abort)init.signal?.removeEventListener('abort',abort)}
}
export const desktopFetcher:typeof fetch=(input,init)=>nativeRequest(typeof input==='string'?input:input instanceof URL?input.toString():input.url,init)

export async function saveDesktopFile(text:string,name:string){return desktopCall<{saved:boolean}>('saveFile',{text,name})}

import {useEffect,useSyncExternalStore} from 'react'
import {canonical,makeBackup,type Snapshot} from '../../shared/model'
import {engine,type AppState} from '../data/store'
import {desktopCall,isLocalOnly,isNative} from './bridge'

export interface CloudStatus {connected:boolean;phase:'disconnected'|'pending'|'uploading'|'backedUp'|'error';origin:string;error:string;revision:number|null;verifiedAt:string|null;applications:number|null}
const listeners=new Set<()=>void>()
let current:CloudStatus={connected:false,phase:'disconnected',origin:'',error:'',revision:null,verifiedAt:null,applications:null},initialized:Promise<void>|null=null
function update(value:CloudStatus){current=value;for(const listener of listeners)listener()}
async function init(){
  if(!isNative||!isLocalOnly)return
  if(!initialized)initialized=desktopCall<CloudStatus>('cloudStatus').then(update).catch(error=>update({...current,error:String(error)}))
  await initialized
}
async function payload(snapshot:Snapshot){
  const backup=makeBackup(snapshot),source=canonical({entries:[...backup.entries].sort((a,b)=>a.id.localeCompare(b.id)),policies:backup.policies,overrides:backup.overrides,trackingStart:backup.trackingStart})
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))
  return {revision:snapshot.revision,backupJSON:JSON.stringify(backup),fingerprint:Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')}
}
export const cloudBackup={
  subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}},
  getState:()=>current,
  async sync(){
    await init();const state=engine.getState()
    if(!current.connected||state.status!=='saved'||!state.snapshot||state.queue.length)return
    try{update({...current,phase:'uploading',error:''});update(await desktopCall<CloudStatus>('cloudSave',await payload(state.snapshot)))}catch(error){update({...current,phase:'error',error:error instanceof Error?error.message:'Cloud backup is waiting to retry.'})}
  },
  async connect(origin:string,password:string){update(await desktopCall<CloudStatus>('cloudConnect',{origin:origin.trim(),password}));await cloudBackup.sync()},
  async disconnect(){update(await desktopCall<CloudStatus>('cloudDisconnect'))},
}
export function useCloudBackup(state:AppState){
  const status=useSyncExternalStore(cloudBackup.subscribe,cloudBackup.getState)
  useEffect(()=>{
    if(!isNative||!isLocalOnly)return
    void init()
    const changed=(event:Event)=>update((event as CustomEvent<CloudStatus>).detail),retry=()=>{void cloudBackup.sync()},timer=setInterval(retry,60_000)
    window.addEventListener('apply-vigil:cloudBackup',changed);window.addEventListener('online',retry);window.addEventListener('focus',retry)
    return()=>{clearInterval(timer);window.removeEventListener('apply-vigil:cloudBackup',changed);window.removeEventListener('online',retry);window.removeEventListener('focus',retry)}
  },[])
  useEffect(()=>{
    if(!status.connected||state.status!=='saved'||state.queue.length)return
    const timer=setTimeout(()=>{void cloudBackup.sync()},750);return()=>clearTimeout(timer)
  },[state.snapshot,state.status,state.queue.length,status.connected])
  return status
}

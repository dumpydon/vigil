import {useEffect,useSyncExternalStore} from 'react'
import {canonical,makeBackup,utcDay,validateBackup,type Backup,type Snapshot} from '../../shared/model'
import {recoveryIdentityCompatible} from '../utils/recovery'
import {engine,type AppState} from '../data/store'
import {desktopCall,isLocalOnly,isNative} from './bridge'

export interface CloudStatus {connected:boolean;phase:'local'|'disconnected'|'connecting'|'paused'|'restoring'|'pending'|'uploading'|'backedUp'|'error';origin:string;error:string;googleEmail?:string;googlePending?:boolean;identityId?:string;recoveryFileSaved?:boolean;revision:number|null;verifiedAt:string|null;applications:number|null}
const listeners=new Set<()=>void>()
let current:CloudStatus={connected:false,phase:'disconnected',origin:'',error:'',revision:null,verifiedAt:null,applications:null},initialized:Promise<void>|null=null
let syncing:Promise<void>|null=null,checkedIdentity:string|null=null,recovering=false
function update(value:CloudStatus){current=value;for(const listener of listeners)listener()}
async function init(){
  if(!isNative||!isLocalOnly)return
  if(!initialized)initialized=desktopCall<CloudStatus>('cloudSetup').then(update).catch(error=>update({...current,phase:'error',error:String(error)}))
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
    if(recovering)return
    if(syncing)return syncing
    syncing=(async()=>{
      await init()
      if(current.phase==='paused'||current.phase==='local')return
      if(!current.connected)update(await desktopCall<CloudStatus>('cloudSetup'))
      if(!current.connected)return
      let state=engine.getState()
      if(state.status!=='saved'||!state.snapshot||state.queue.length)return
      if(checkedIdentity!==current.identityId){
        const {backups}=await desktopCall<{backups:{id:string;revision:number;entries:number}[]}>('cloudList')
        const latest=backups[0]
        state=engine.getState()
        // Recheck after transport: new local entries must never be silently
        // merged with or overwritten by a cloud identity's older history.
        if(latest&&state.snapshot?.entries.length===0&&state.snapshot.revision===0&&state.queue.length===0&&(latest.entries>0||latest.revision>0)){
          update({...current,phase:'restoring',error:''})
          const copy=await desktopCall<{backupJSON:string;revision:number}>('cloudRead',{id:latest.id})
          const backup=validateBackup(JSON.parse(copy.backupJSON),utcDay()),fresh=engine.getState()
          if(!fresh.snapshot||fresh.status!=='saved'||fresh.snapshot.entries.length||fresh.snapshot.revision!==0||fresh.queue.length)throw new Error('Local history changed while checking recovery. Review the cloud copy in Settings → Data; both histories are retained.')
          await engine.recoverLocalHistory(backup,copy.revision)
        }
        checkedIdentity=current.identityId??null
      }
      state=engine.getState()
      if(state.status!=='saved'||!state.snapshot||state.queue.length)return
      update({...current,phase:'uploading',error:''})
      update(await desktopCall<CloudStatus>('cloudSave',await payload(state.snapshot)))
    })().catch(error=>update({...current,phase:'error',error:error instanceof Error?error.message:'Cloud backup is waiting to retry.'})).finally(()=>{
      syncing=null
      const state=engine.getState()
      if(current.connected&&current.phase==='backedUp'&&state.status==='saved'&&state.snapshot&&(current.revision??-1)<state.snapshot.revision)setTimeout(()=>{void cloudBackup.sync()},750)
    })
    return syncing
  },
  async googleStart(){update(await desktopCall<CloudStatus>('googleStart'))},
  async googleCancel(){update(await desktopCall<CloudStatus>('googleCancel'))},
  async googleFinish(choice:'link'|'restore',copy?:{backupJSON:string;revision:number},sameNamespace=false){
    recovering=true
    try{
      if(syncing)await syncing
      const state=engine.getState(),backup=copy?validateBackup(JSON.parse(copy.backupJSON),utcDay()):null
      if(state.queue.length)throw new Error('Wait for local changes to save before linking Google.')
      if(backup&&!recoveryIdentityCompatible(state.snapshot,backup,sameNamespace))throw new Error('This Google account holds a different history. Both histories are kept. Choose the matching account or restore into a fresh workspace.')
      update(await desktopCall<CloudStatus>('googleFinish',{choice}));checkedIdentity=null
      if(backup&&copy){
        const latest=engine.getState()
        if(latest.queue.length||!recoveryIdentityCompatible(latest.snapshot,backup,sameNamespace))throw new Error('Local history changed during sign-in. Review recovery again; both histories are retained.')
        await engine.recoverLocalHistory(backup,copy.revision)
      }
    }finally{recovering=false}
    await cloudBackup.sync()
  },
  async resume(){update(await desktopCall<CloudStatus>('cloudResume'));checkedIdentity=null;await cloudBackup.sync()},
  async refresh(){update(await desktopCall<CloudStatus>('cloudStatus'))},
  async recover(backup:Backup,revision:number,fromRecoveryFile:boolean){
    recovering=true
    try{
      if(syncing)await syncing
      if(fromRecoveryFile){update(await desktopCall<CloudStatus>('cloudRecoveryApply'));checkedIdentity=null}
      await engine.recoverLocalHistory(backup,revision)
    }finally{recovering=false}
    await cloudBackup.sync()
  },
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

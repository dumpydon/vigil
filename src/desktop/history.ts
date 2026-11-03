import {useEffect,useState} from 'react'
import {makeBackup,type Snapshot} from '../../shared/model'
import type {AppState} from '../data/store'
import type {LocalHistorySafety} from '../data/history-protection'
import {desktopCall,isNative} from './bridge'

export interface HistoryCopy {id:string;mode:'local'|'connected';createdAt:string;trackingStart:string;entries:number;applications:number;hasPending:boolean}
export interface HistoryProtectionStatus {mode:'local'|'connected';count:number;latest:HistoryCopy|null;otherHistory:boolean;directory:string;corruptCopies:number;notice:string}
export const nativeHistorySafety:LocalHistorySafety={
  load:()=>desktopCall('historyLoad'),
  save:async image=>{await desktopCall('historySave',{image})},
  recovered:async message=>{await desktopCall('historyRecovered',{message});window.dispatchEvent(new CustomEvent('apply-vigil:history-notice',{detail:message}))},
}
let capture=Promise.resolve()
export function captureHistory(snapshot:Snapshot,working:Record<string,unknown>={}){
  const task=capture.catch(()=>{}).then(()=>desktopCall('historyCapture',{backup:makeBackup(snapshot),working}))
  capture=task.then(()=>{},()=>{})
  return task
}
export function useHistoryProtection(state:AppState){
  const [error,setError]=useState(''),[notice,setNotice]=useState('')
  useEffect(()=>{
    if(!isNative)return
    let mounted=true
    const changed=(event:Event)=>setNotice((event as CustomEvent<string>).detail)
    window.addEventListener('apply-vigil:history-notice',changed)
    void desktopCall<HistoryProtectionStatus>('historyStatus').then(value=>{if(mounted)setNotice(value.notice||(value.corruptCopies?'One or more history copies need review. Open History protection to inspect the retained copies.':''))}).catch(e=>{if(mounted)setError(e.message)})
    return()=>{mounted=false;window.removeEventListener('apply-vigil:history-notice',changed)}
  },[])
  useEffect(()=>{
    if(!isNative||!state.initialized||!state.snapshot)return
    let mounted=true
    void captureHistory(state.snapshot,{draft:state.draft,queue:state.queue}).then(()=>{if(mounted)setError('')}).catch(e=>{if(mounted)setError(e instanceof Error?e.message:'The automatic safety copy could not be written.')})
    return()=>{mounted=false}
  },[state.initialized,state.snapshot,state.draft,state.queue])
  return {error,notice}
}

import {useEffect} from 'react'
import {analytics,utcDay} from '../../shared/model'
import {engine,type AppState} from '../data/store'
import type {AlertsState} from '../data/alerts'
import {desktopCall,isNative,isLocalOnly} from './bridge'

export default function useDesktop(state:AppState,alerts:AlertsState,today:string){
  useEffect(()=>{
    if(!isNative)return
    const refresh=()=>{void engine.sync()}
    window.addEventListener('apply-vigil:refresh',refresh)
    return()=>window.removeEventListener('apply-vigil:refresh',refresh)
  },[])
  useEffect(()=>{
    if(!isNative)return
    const a=state.snapshot?analytics(state.snapshot,7,today):null
    void desktopCall('status',{total:a?.total??null,goal:a?.goal??null,day:today,status:isLocalOnly&&state.status==='saved'?'local':state.status,pending:state.queue.length,unread:alerts.items.filter(x=>!x.readAt).length}).catch(()=>{})
  },[state.snapshot,state.status,state.queue.length,alerts.items,today])
  useEffect(()=>{
    if(!isNative||!alerts.ready||state.status!=='saved')return
    void desktopCall('alerts',{items:alerts.items,paused:alerts.pausedOn===utcDay()}).catch(()=>{})
  },[alerts.items,alerts.pausedOn,alerts.ready,state.status])
}

import {useEffect,useState,useSyncExternalStore} from 'react'
import {alertsStore} from '../data/alerts'
import {engine,type SyncStatus} from '../data/store'
import type {Snapshot} from '../../shared/model'
import {alertSnapshotNeedsRefresh} from '../utils/notifications'
import {isNative} from '../desktop/bridge'

export default function useAlerts(snapshot:Snapshot|null,status:SyncStatus,enabled=true){
  const alerts=useSyncExternalStore(alertsStore.subscribe,alertsStore.getState)
  const [now,setNow]=useState(()=>new Date())
  useEffect(()=>{
    if(!enabled)return
    void alertsStore.init()
    const refresh=()=>{
      const currentTime=new Date(),current=engine.getState()
      setNow(currentTime);void alertsStore.refresh()
      if((isNative||document.visibilityState==='visible')&&navigator.onLine&&current.status==='saved'&&current.snapshot&&alertSnapshotNeedsRefresh(current.snapshot,currentTime))void engine.sync()
    },timer=setInterval(refresh,60_000)
    window.addEventListener('focus',refresh)
    document.addEventListener('visibilitychange',refresh)
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}
  },[enabled])
  useEffect(()=>{
    if(enabled&&snapshot&&status==='saved'){
      const current=new Date()
      void alertsStore.generate(snapshot,current,current.getHours())
    }
  },[enabled,snapshot,status,now,alerts.pausedOn])
  return {...alerts,now,unread:alerts.items.filter(item=>!item.readAt).length}
}

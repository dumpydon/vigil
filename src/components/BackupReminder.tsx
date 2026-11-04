import {useEffect,useState} from 'react'
import GoogleBackupButton from './GoogleBackupButton'
import {acknowledgeBackupReminder,nextBackupReminder,readBackupReminder} from '../utils/backup-reminders'
import './backup-reminder.css'
const key='apply-vigil.backup-reminder.v1'
/** Render only once per workspace, after local saving is ready. No OS alerts. */
export default function BackupReminder({total,googleLinked,onConnect}:{total:number;googleLinked:boolean;onConnect:()=>void}){
  const [milestone,setMilestone]=useState<number|null>(null)
  useEffect(()=>{
    if(googleLinked)return
    try{
      const state=readBackupReminder(JSON.parse(localStorage.getItem(key)??'null'))
      const next=nextBackupReminder(total,state,false)
      if(next===null)return
      // Recheck at display time; effect cleanup must not consume a reminder.
      const timer=setTimeout(()=>{
        try{
          const latest=readBackupReminder(JSON.parse(localStorage.getItem(key)??'null'))
          const ready=nextBackupReminder(total,latest,false)
          if(ready===null)return
          localStorage.setItem(key,JSON.stringify(acknowledgeBackupReminder(latest,ready)))
          setMilestone(ready)
        }catch{/* No prompt if its receipt cannot be retained. */}
      },0)
      return()=>clearTimeout(timer)
    }catch{/* Local counting remains usable if preference storage is unavailable. */}
  },[total,googleLinked])
  if(googleLinked||milestone===null)return null
  return <aside className="backup-reminder" aria-label="Optional cloud backup" role="status">
    <div className="backup-reminder-copy"><strong>Keep your progress safe</strong><p>Your applications are saved on this Mac. Link Google to back them up and restore them on a new Mac.</p></div>
    <div className="backup-reminder-actions"><GoogleBackupButton onClick={()=>{setMilestone(null);onConnect()}}/><button type="button" className="backup-reminder-later" onClick={()=>setMilestone(null)}>Not now</button></div>
  </aside>
}

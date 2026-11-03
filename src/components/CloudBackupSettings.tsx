import {useState,useSyncExternalStore} from 'react'
import {goalFor,utcDay,validateBackup,type Backup} from '../../shared/model'
import {type AppState} from '../data/store'
import {cloudBackup} from '../desktop/cloud-backup'
import {desktopCall} from '../desktop/bridge'
import {recoveryIdentityCompatible,recoveryPreview} from '../utils/recovery'
import {timestampLabel} from '../utils/time'
import useTimePreferences from '../hooks/useTimePreferences'

interface Copy {id:string;applications:number;entries:number;created_at:string;revision:number}
interface Selection {backup:Backup;revision:number;fromFile:boolean}
interface RecoveryChoice {cancelled:boolean;sameIdentity?:boolean;copy?:{backupJSON:string;revision:number}}
export default function CloudBackupSettings({state,onDone}:{state:AppState;onDone:(message:string)=>void}){
  const status=useSyncExternalStore(cloudBackup.subscribe,cloudBackup.getState),time=useTimePreferences()
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[copies,setCopies]=useState<Copy[]|null>(null),[selected,setSelected]=useState<Selection|null>(null),[message,setMessage]=useState('')
  const plan=selected?recoveryPreview(state.snapshot,selected.backup):null
  const upToDate=status.phase==='backedUp'&&state.queue.length===0&&(status.revision??-1)>=(state.snapshot?.revision??0)
  async function action(work:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setMessage('');try{await work()}catch(error){setError(error instanceof Error?error.message:'Cloud backup could not finish. Your local history is retained.')}finally{setBusy(false)}}
  async function chooseFile(){
    const choice=await desktopCall<RecoveryChoice>('cloudRecoveryChoose')
    if(choice.cancelled||!choice.copy)return
    const backup=validateBackup(JSON.parse(choice.copy.backupJSON),utcDay())
    if(!recoveryIdentityCompatible(state.snapshot,backup,!!choice.sameIdentity))throw new Error('This recovery file belongs to an unrelated or diverging history. Your existing records have not been changed. Restore it in a fresh app workspace to keep the histories separate.')
    setCopies(null);setSelected({backup,revision:choice.copy.revision,fromFile:true})
  }
  return <section className="settings-group cloud-backup-settings"><h3>Cloud backup</h3>
    <div className="settings-card history-summary"><div><strong>{upToDate?'Cloud copy verified':status.phase==='restoring'?'Restoring your history…':status.phase==='uploading'?'Backing up…':status.phase==='error'?'Backup needs attention':status.phase==='paused'?'Cloud backup is off':'Connecting automatically…'}</strong><p>{status.verifiedAt?timestampLabel(status.verifiedAt,time):status.phase==='paused'?'Your history stays on this Mac.':'No account or password needed. Local saving works offline.'}</p></div></div>
    <div className="settings-actions">
      {status.phase==='paused'?<button disabled={busy} onClick={()=>{void action(()=>cloudBackup.resume())}}>Enable cloud backup</button>:<button disabled={busy||state.status!=='saved'} onClick={()=>{void action(()=>cloudBackup.sync())}}>{status.connected?'Back up now':'Retry connection'}</button>}
      {status.connected&&<button disabled={busy} onClick={()=>{void action(async()=>{const result=await desktopCall<{backups:Copy[]}>('cloudList');setCopies(result.backups);setSelected(null)})}}>Recover cloud copy</button>}
    </div>
    {status.connected&&!status.recoveryFileSaved&&<p className="fine-print">Save a recovery file outside this Mac so you can recover after deleting all app data.</p>}
    <div className="settings-actions">
      {status.connected&&<button disabled={busy} onClick={()=>{void action(async()=>{const result=await desktopCall<{saved:boolean}>('cloudRecoveryExport');if(result.saved){await cloudBackup.refresh();setMessage('Recovery file saved. Keep a copy outside this Mac.')}})}}>Save recovery file</button>}
      <button disabled={busy} onClick={()=>{void action(chooseFile)}}>Use recovery file</button>
    </div>
    <details className="settings-details"><summary>How recovery works</summary><p>Each installation has a random private backup identity. Reopening or replacing the app keeps it, without sign-in. If all app data is deleted, import your recovery file to retrieve the cloud history. A device ID alone cannot recover or unlock it.</p><p>Keep the recovery file somewhere separate, such as a USB drive or your own cloud drive. Anyone holding the file can access that backup. If both the identity and recovery file are lost, the service cannot safely identify your history.</p>{status.origin&&<p>{status.origin}</p>}{status.connected&&<button className="text-button" disabled={busy} onClick={()=>{void action(async()=>{await cloudBackup.disconnect();setCopies(null);setSelected(null)})}}>Revoke this connection and turn backup off</button>}</details>
    {copies&&!selected&&<div className="history-copy-list" aria-label="Cloud history copies">{copies.length?copies.map(copy=><button className="history-copy" key={copy.id} disabled={busy} onClick={()=>{void action(async()=>{const saved=await desktopCall<{backupJSON:string}>('cloudRead',{id:copy.id});setSelected({backup:validateBackup(JSON.parse(saved.backupJSON),utcDay()),revision:copy.revision,fromFile:false})})}}><span>{timestampLabel(copy.created_at,time)}</span><strong>{copy.applications.toLocaleString()} applications</strong></button>):<p>No verified cloud copies yet.</p>}<button className="text-button" onClick={()=>setCopies(null)}>Close</button></div>}
    {selected&&plan&&<div className="import-preview"><h4>Review cloud recovery</h4><p>{plan.preview.items.length} missing records · {plan.preview.duplicates} identical · {plan.preview.conflicts.length} conflicts kept unchanged.</p><p className="fine-print">{state.snapshot?.entries.length?'Existing entries, deletion flags, and your current goal are preserved.':`The full history and its saved goals will be restored. Current saved goal: ${goalFor(selected.backup,utcDay())}.`}</p><div className="settings-actions"><button disabled={busy} onClick={()=>setSelected(null)}>Back</button><button disabled={busy||state.queue.length>0||(!selected.fromFile&&!plan.preview.items.length)} onClick={()=>{void action(async()=>{await cloudBackup.recover(selected.backup,selected.revision,selected.fromFile);onDone('History recovered from the verified cloud copy. Existing records were kept.')})}}>{selected.fromFile?'Restore backup':'Merge missing records'}</button></div></div>}
    {message&&<p className="fine-print" role="status">{message}</p>}
    {(error||status.error)&&<p className="form-error" role="alert">{error||status.error}</p>}
  </section>
}

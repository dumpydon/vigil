import {useState,useSyncExternalStore} from 'react'
import {utcDay,validateBackup,type Backup} from '../../shared/model'
import {engine,type AppState} from '../data/store'
import {cloudBackup} from '../desktop/cloud-backup'
import {desktopCall} from '../desktop/bridge'
import {recoveryPreview} from '../utils/recovery'
import {timestampLabel} from '../utils/time'
import useTimePreferences from '../hooks/useTimePreferences'

interface Copy {id:string;applications:number;entries:number;created_at:string;revision:number}
export default function CloudBackupSettings({state,onDone}:{state:AppState;onDone:(message:string)=>void}){
  const status=useSyncExternalStore(cloudBackup.subscribe,cloudBackup.getState),time=useTimePreferences()
  const [origin,setOrigin]=useState('https://vigil.dumpydon.workers.dev'),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copies,setCopies]=useState<Copy[]|null>(null),[selected,setSelected]=useState<Backup|null>(null)
  const plan=selected?recoveryPreview(state.snapshot,selected):null
  async function action(work:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await work()}catch(error){setError(error instanceof Error?error.message:'Cloud backup could not finish. Your local history is retained.')}finally{setBusy(false)}}
  return <section className="settings-group cloud-backup-settings"><h3>Cloud backup</h3>
    {status.connected?<>
      <div className="settings-card history-summary"><div><strong>{status.phase==='backedUp'?'Cloud copy verified':status.phase==='uploading'?'Backing up…':status.phase==='error'?'Backup needs attention':'Waiting to back up'}</strong><p>{status.verifiedAt?timestampLabel(status.verifiedAt,time):'Your local history stays available offline.'}</p></div></div>
      <div className="settings-actions"><button disabled={busy||state.status!=='saved'} onClick={()=>{void action(()=>cloudBackup.sync())}}>Back up now</button><button disabled={busy} onClick={()=>{void action(async()=>{const result=await desktopCall<{backups:Copy[]}>('cloudList');setCopies(result.backups);setSelected(null)})}}>Recover cloud copy</button></div>
      <details className="settings-details"><summary>Connection details</summary><p>{status.origin}</p><p>Verified full-history copies are stored in your private workspace. Local saving continues offline. This Mac retains a device credential without using Keychain.</p><button className="text-button" disabled={busy} onClick={()=>{void action(async()=>{await cloudBackup.disconnect();setCopies(null);setSelected(null)})}}>Disconnect this Mac</button></details>
    </>:<form onSubmit={event=>{event.preventDefault();void action(async()=>{await cloudBackup.connect(new URL(origin).origin,password);setPassword('')})}}>
      <p>Connect your private Vigil workspace for automatic online backups.</p>
      <label className="file-label">Workspace URL<input type="url" required value={origin} onChange={event=>setOrigin(event.target.value)} disabled={busy}/></label>
      <label className="file-label">Workspace password<input type="password" required autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} disabled={busy}/></label>
      <div className="settings-actions"><button type="submit" disabled={busy}>{busy?'Connecting…':'Connect workspace'}</button></div>
      <details className="settings-details"><summary>About private workspaces</summary><p>Use a Vigil server you own. The public download does not share an account or upload to someone else’s history. Sign in once to pair this Mac; your password is never saved.</p></details>
    </form>}
    {copies&&!selected&&<div className="history-copy-list" aria-label="Cloud history copies">{copies.length?copies.map(copy=><button className="history-copy" key={copy.id} disabled={busy} onClick={()=>{void action(async()=>{const saved=await desktopCall<{backupJSON:string}>('cloudRead',{id:copy.id});setSelected(validateBackup(JSON.parse(saved.backupJSON),utcDay()))})}}><span>{timestampLabel(copy.created_at,time)}</span><strong>{copy.applications.toLocaleString()} applications</strong></button>):<p>No verified cloud copies yet.</p>}<button className="text-button" onClick={()=>setCopies(null)}>Close</button></div>}
    {selected&&plan&&<div className="import-preview"><h4>Review cloud recovery</h4><p>{plan.preview.items.length} missing records · {plan.preview.duplicates} identical · {plan.preview.conflicts.length} conflicts kept unchanged.</p><p className="fine-print">Existing entries, deletion flags, and your current goal are preserved.</p><div className="settings-actions"><button disabled={busy} onClick={()=>setSelected(null)}>Back</button><button disabled={busy||state.queue.length>0||!plan.preview.items.length} onClick={()=>{void action(async()=>{await engine.recoverLocalHistory(selected);await cloudBackup.sync();onDone('Missing history recovered from the verified cloud copy.')})}}>Merge missing records</button></div></div>}
    {(error||status.error)&&<p className="form-error" role="alert">{error||status.error}</p>}
  </section>
}

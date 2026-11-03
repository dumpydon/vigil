import {useEffect,useState} from 'react'
import {utcDay,validateBackup,type Backup} from '../../shared/model'
import useTimePreferences from '../hooks/useTimePreferences'
import {clockTime,timestampLabel,zoneLabel} from '../utils/time'
import Icon from './Icon'
import {engine,type AppState} from '../data/store'
import {desktopCall,isLocalOnly} from '../desktop/bridge'
import {captureHistory,type HistoryCopy,type HistoryProtectionStatus} from '../desktop/history'
import {recoveryPreview} from '../utils/recovery'

export default function HistoryProtection({state,onDone}:{state:AppState;onDone?:(message:string)=>void}){
  const preferences=useTimePreferences()
  const [status,setStatus]=useState<HistoryProtectionStatus|null>(null),[copies,setCopies]=useState<HistoryCopy[]|null>(null),[selected,setSelected]=useState<{copy:HistoryCopy;backup:Backup}|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[newHistory,setNewHistory]=useState(false)
  const plan=selected?recoveryPreview(state.snapshot,selected.backup):null
  const time=(value:string)=>timestampLabel(value,preferences)
  const shortTime=(value:string)=>`${new Intl.DateTimeFormat('en-US',{timeZone:preferences.timeZone,month:'short',day:'numeric'}).format(new Date(value))}, ${clockTime(value,preferences)} ${zoneLabel(preferences.timeZone,value)}`
  async function refresh(){setStatus(await desktopCall<HistoryProtectionStatus>('historyStatus'))}
  useEffect(()=>{let active=true;void desktopCall<HistoryProtectionStatus>('historyStatus').then(value=>{if(active)setStatus(value)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[])
  async function action(work:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await work();await refresh()}catch(e){setError(e instanceof Error?e.message:'The history protection action failed. Existing records are retained.')}finally{setBusy(false)}}
  async function choose(copy:HistoryCopy){await action(async()=>{const backup=validateBackup(await desktopCall('historyRead',{id:copy.id}),utcDay());setSelected({copy,backup})})}
  async function restore(){
    if(!plan||!selected)return
    await action(async()=>{
      if(state.snapshot)await captureHistory(state.snapshot,{draft:state.draft,queue:state.queue,reason:'before-recovery'})
      if(isLocalOnly)await engine.recoverLocalHistory(selected.backup)
      else{
        const current=engine.getState().snapshot
        if(!current)throw new Error('Sign in and load the connected workspace before merging a history copy.')
        const fresh=recoveryPreview(current,selected.backup)
        await engine.importItems(fresh.preview.items,fresh.backup.trackingStart);await engine.sync()
      }
      if(engine.getState().status!=='saved')throw new Error(engine.getState().error??'Recovery is retained locally and is still waiting to finish saving. Keep the app open.')
      setSelected(null);setCopies(null);onDone?.('Missing history recovered. Existing records and the current goal were kept.')
    })
  }
  return <section className="settings-group history-protection" aria-label="History protection">
    <h3>History protection</h3>
    <div className="settings-card history-summary" role="status"><span className={`history-status-icon${status?.latest?' verified':''}`} aria-hidden="true"><Icon name={status?.latest?'check':'clock'} size={17}/></span><div><strong>{status?.latest?'Verified safety copy':'Automatic backups'}</strong>{status?.latest?<p title={time(status.latest.createdAt)}>{status.latest.applications.toLocaleString()} applications · {shortTime(status.latest.createdAt)}</p>:<p>{status?'Created when your history loads.':'Checking saved copies…'}</p>}</div></div>
    {status?.notice&&<div className="history-mode-note" role="status"><p>{status.notice}</p><button disabled={busy} onClick={()=>{void action(async()=>{await desktopCall('historyAcknowledge');window.dispatchEvent(new CustomEvent('apply-vigil:history-notice',{detail:''}))})}}>Dismiss reviewed notice</button></div>}
    {!!status?.corruptCopies&&<p className="form-error" role="alert">{status.corruptCopies} safety {status.corruptCopies===1?'copy failed':'copies failed'} integrity checks and will not be restored automatically. Other verified copies are retained.</p>}
    <div className="settings-actions">
      <button disabled={busy||!state.snapshot} onClick={()=>{void action(async()=>{if(state.snapshot)await captureHistory(state.snapshot,{draft:state.draft,queue:state.queue,reason:'manual'})})}}>Back up now</button>
      <button disabled={busy} onClick={()=>{void action(async()=>{setCopies(await desktopCall<HistoryCopy[]>('historyList'));setSelected(null)})}}>Recover history</button>
      <button className="icon-button" aria-label="Open backup folder" title="Open backup folder" disabled={busy} onClick={()=>{void action(async()=>{await desktopCall('historyReveal')})}}><Icon name="folder" size={16}/></button>
    </div>
    {status?.otherHistory&&<p className="fine-print">Another workspace is available in Recover history.</p>}
    <details className="settings-details"><summary>Backup details</summary><p>History never expires or resets. This Mac keeps up to 48 recent and 90 daily safety copies, each containing your full saved history. Export JSON to keep a copy on another device.</p>{status?.otherHistory&&<p>Local and connected workspaces stay separate. Review a recovery copy to merge missing records; existing records are never silently replaced.</p>}</details>
    {copies&&!selected&&<div className="history-copy-list" role="group" aria-label="Saved history copies">
      <p className="fine-print">Review a copy before merging. Existing record IDs are not duplicated, and conflicts keep the current values. Copies with pending changes can contain edits that had not finished saving.</p>
      {!copies.length&&<p>No verified copies yet. Your manual JSON backups can still be restored below.</p>}
      {copies.map(copy=><button key={copy.id} className="history-copy" disabled={busy} onClick={()=>{void choose(copy)}}><span>{time(copy.createdAt)} · {copy.mode==='local'?'Local':'Connected'}</span><strong>{copy.applications.toLocaleString()} applications · {copy.entries.toLocaleString()} entries</strong>{copy.hasPending&&<small>Includes retained pending changes</small>}</button>)}
      <button className="text-button" onClick={()=>setCopies(null)}>Close recovery list</button>
    </div>}
    {selected&&plan&&<div className="import-preview">
      <h4>Review recovered history</h4><p>{time(selected.copy.createdAt)} · {selected.copy.mode==='local'?'Local':'Connected'} history</p>
      <p>{plan.preview.items.length} missing records · {plan.preview.duplicates} identical · {plan.preview.conflicts.length} conflicts kept unchanged.</p>
      <p className="fine-print">Existing entries, deletion flags, and the current daily goal are preserved. Earlier historical goals are restored only before this workspace’s tracking start.</p>
      {!!plan.preview.conflicts.length&&<details><summary>Review conflicts</summary><ul>{plan.preview.conflicts.slice(0,30).map((value,index)=><li key={index}>{value}</li>)}</ul></details>}
      <div className="settings-actions"><button disabled={busy} onClick={()=>setSelected(null)}>Back</button><button className="primary-button" disabled={busy||state.queue.length>0||(!plan.preview.items.length&&!!state.snapshot&&plan.backup.trackingStart>=state.snapshot.trackingStart)} onClick={()=>{void restore()}}>{busy?'Recovering…':'Merge missing records'}</button></div>
      {state.queue.length>0&&<p className="fine-print">Finish saving pending changes before recovering another copy.</p>}
    </div>}
    {!state.snapshot&&isLocalOnly&&<div className="history-new-workspace"><button disabled={busy} onClick={()=>setNewHistory(!newHistory)}>Start a separate empty local history…</button>{newHistory&&<><p>This creates a separate local history. It does not delete the older workspace or import its records. Use Recover history to bring older records into this workspace.</p><button disabled={busy} onClick={()=>{void action(async()=>{await desktopCall('historyConfirmSeparate');await engine.sync();if(engine.getState().status!=='saved')throw new Error(engine.getState().error??'The local history could not initialize.')})}}>Confirm separate history</button></>}</div>}
    {error&&<p className="form-error" role="alert">{error}</p>}
  </section>
}

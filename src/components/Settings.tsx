import HistoryProtection from './HistoryProtection'
import CloudBackupSettings from './CloudBackupSettings'
import TimeSettings from './TimeSettings'
import { useId,useState,type KeyboardEvent } from 'react'
import { importPreview, makeBackup, utcDay, validateBackup, type Backup, type Snapshot } from '../../shared/model'
import { engine, type AppState } from '../data/store'
import type { InstallEvent } from '../pwa'
import Icon from './Icon'
import DesktopSettings from '../desktop/DesktopSettings'
import useDesktopPreferences from '../desktop/useDesktopPreferences'
import {desktopCall,isDesktop,isDesktopPreview,isNative,isLocalOnly,desktopVersion,markSource,saveDesktopFile} from '../desktop/bridge'

function download(text:string,name:string,mime:string){const url=URL.createObjectURL(new Blob([text],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export type SettingsTab='general'|'alerts'|'data'
export default function Settings({state,install,onDone,onLogin,initialTab='general'}:{state:AppState;install:InstallEvent|null;onDone:(message:string)=>void;onLogin:()=>void;initialTab?:SettingsTab}){
  const [tab,setTab]=useState<SettingsTab>(initialTab),id=useId(),desktopPreferences=useDesktopPreferences()
  const [backup,setBackup]=useState<Backup|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),snapshot=state.snapshot
  const tabs:readonly SettingsTab[]=isDesktop?['general','alerts','data']:['general','data']
  function navigateTab(event:KeyboardEvent<HTMLButtonElement>){
    const index=tabs.indexOf(tab),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:-1
    if(next<0)return
    event.preventDefault();setTab(tabs[next]);event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-settings-tab="${tabs[next]}"]`)?.focus()
  }
  const preview=snapshot&&backup?importPreview(snapshot,backup):null
  async function read(file:File|undefined){if(!file)return;setError('');setBackup(null);try{if(file.size>12_000_000)throw new Error('Choose a JSON backup smaller than 12 MB.');setBackup(validateBackup(JSON.parse(await file.text()),utcDay()))}catch(e){setError(e instanceof Error?e.message:'This backup is not valid.')}}
  async function exportFile(format:'json'|'csv'){
    if(!snapshot)return;setError('')
    try{const fields=['id','date','loggedAt','createdAt','updatedAt','easy','external','version','deleted','backdated'] as const,text=format==='json'?JSON.stringify(makeBackup(snapshot),null,2):[fields.join(','),...snapshot.entries.map(e=>fields.map(k=>JSON.stringify(e[k])).join(','))].join('\r\n'),name=`vigil-${utcDay()}.${format}`;if(isNative)await saveDesktopFile(text,name);else download(text,name,format==='json'?'application/json':'text/csv;charset=utf-8')}catch{setError('This download could not be created. Your records remain retained.')}
  }
  async function importFile(){if(!preview||!backup||busy)return;setBusy(true);setError('');try{await engine.importItems(preview.items,backup.trackingStart);onDone('Backup merged. Identical records were skipped; conflicting records were kept unchanged.')}catch(e){setError(e instanceof Error?e.message:'Import could not be retained.')}finally{setBusy(false)}}
  return <div className="settings-content">
    <div className="settings-tabs" role="tablist" aria-label="Settings categories">{tabs.map(value=><button key={value} id={`${id}-${value}-tab`} data-settings-tab={value} role="tab" aria-selected={tab===value} aria-controls={`${id}-${value}-panel`} tabIndex={tab===value?0:-1} onClick={()=>setTab(value)} onKeyDown={navigateTab}><Icon name={value==='general'?'settings':value==='alerts'?'bell':'folder'} size={15}/>{value==='general'?'General':value==='alerts'?'Alerts':'Data'}</button>)}</div>
    <div className="settings-panel" role="tabpanel" id={`${id}-general-panel`} aria-labelledby={`${id}-general-tab`} hidden={tab!=='general'} tabIndex={0}>
      <TimeSettings/>
      {isDesktop?<DesktopSettings section="general" preferences={desktopPreferences}/>:<section className="settings-group"><h3>Install Vigil</h3>{install?<button className="primary-button" onClick={()=>{void install.prompt().catch(()=>setError('Open Vigil directly in your browser to install it.'))}}>Install web app</button>:<details className="settings-details"><summary>Add Vigil to your desktop</summary><p><strong>Safari</strong> · Share → Add to Dock.<br/><strong>Chrome</strong> · Use the install icon in the address bar.</p></details>}</section>}
    </div>
    {isDesktop&&<div className="settings-panel" role="tabpanel" id={`${id}-alerts-panel`} aria-labelledby={`${id}-alerts-tab`} hidden={tab!=='alerts'} tabIndex={0}><DesktopSettings section="alerts" preferences={desktopPreferences}/></div>}
    <div className="settings-panel" role="tabpanel" id={`${id}-data-panel`} aria-labelledby={`${id}-data-tab`} hidden={tab!=='data'} tabIndex={0}>
      {isNative&&<HistoryProtection state={state} onDone={onDone}/>}
      {isNative&&isLocalOnly&&<CloudBackupSettings state={state} onDone={onDone}/>}
      <section className="settings-group"><h3>Export &amp; restore</h3>
        <div className="settings-card"><div className="preference-row settings-export-row"><span>Export history</span><div className="settings-actions"><button disabled={!snapshot} onClick={()=>{void exportFile('json')}}><Icon name="download" size={14}/>JSON</button><button disabled={!snapshot} onClick={()=>{void exportFile('csv')}}>CSV</button></div></div></div>
        {state.queue.length>0&&<p className="fine-print">Includes {state.queue.length} pending changes. {isLocalOnly?'Wait for saving to finish for a fully saved backup.':'Sync first for a cloud-confirmed backup.'}</p>}
        <details className="settings-details"><summary>Restore a JSON backup</summary><p>Add missing records. Identical records are skipped; conflicts and goals keep their current values.</p><label className="file-label">Backup file<input type="file" accept="application/json,.json" disabled={busy} onChange={e=>{void read(e.target.files?.[0])}}/></label>{preview&&backup&&<div className="import-preview"><div><strong>{preview.items.length}</strong> new records <span>· {preview.duplicates} identical · {preview.conflicts.length} conflicts skipped</span></div>{backup.trackingStart<(snapshot as Snapshot).trackingStart&&<p>Tracking start moves to {backup.trackingStart} UTC.</p>}{preview.conflicts.length>0&&<details><summary>Review skipped conflicts</summary><ul>{preview.conflicts.slice(0,50).map((x,i)=><li key={i}>{x}</li>)}</ul>{preview.conflicts.length>50&&<p>And {preview.conflicts.length-50} more.</p>}</details>}<button className="primary-button" disabled={busy||(!preview.items.length&&backup.trackingStart>=(snapshot as Snapshot).trackingStart)} onClick={()=>{void importFile()}}><Icon name="upload"/>{busy?'Retaining import…':'Merge missing records'}</button></div>}</details>
        <details className="settings-details"><summary>About your exports</summary><p>JSON includes entries, saved dates, goal history, and tracking start. Use it to move or restore your history. CSV is for spreadsheets.</p></details>
      </section>
      {isLocalOnly?<p className="settings-storage-note">Stored on this Mac · No account needed</p>:<section className="settings-group"><h3>Owner session</h3><div className="settings-card"><div className="preference-row"><span>{state.status==='auth'?'Sign in to sync':'Connected workspace'}</span>{state.status==='auth'?<button onClick={onLogin}>Sign in</button>:<button disabled={busy||state.queue.length>0} onClick={()=>{setBusy(true);void engine.logout().then(()=>onLogin()).catch(e=>setError(e.message)).finally(()=>setBusy(false))}}><Icon name="logout" size={14}/>Sign out</button>}</div></div>{state.queue.length>0&&<p className="fine-print">Finish syncing before signing out.</p>}<details className="settings-details"><summary>About this session</summary><p>{isNative?'Sign in again after quitting. Keychain is not used.':'Your sign-in is remembered for up to 90 days.'} Cached history stays on this device.</p></details></section>}
    </div>
    {(error||desktopPreferences.error)&&<p className="form-error settings-error" role="alert">{error||desktopPreferences.error}</p>}
    <footer className="settings-footer"><img src={markSource} alt=""/><div><strong>{isDesktop?'Apply Vigil':'Vigil'}</strong><span>{desktopPreferences.settings?.version??desktopVersion}{isDesktopPreview?' · Preview':''}</span></div><div className="settings-footer-actions">{isNative?<button className="icon-button" aria-label="Visit Apply Vigil website" title="Visit website" onClick={()=>{void desktopCall('openWebsite').catch(()=>setError('The website could not be opened.'))}}><Icon name="popout" size={14}/></button>:<a href="https://vigil.dumpydon.workers.dev/" target="_blank" rel="noreferrer" aria-label="Visit Apply Vigil website"><Icon name="popout" size={14}/></a>}{isDesktop&&<button className="text-button" disabled={isDesktopPreview} onClick={()=>{void desktopCall('quit').catch(()=>setError('Apply Vigil could not quit. Try again.'))}}>Quit Apply Vigil</button>}</div></footer>
  </div>
}

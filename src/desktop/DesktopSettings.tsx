import {useEffect,useState} from 'react'
import {desktopCall,isDesktopPreview,type DesktopSettings as Preferences} from './bridge'
import {SOUND_OPTIONS} from './sounds'

export default function DesktopSettings(){
  const [settings,setSettings]=useState<Preferences|null>(()=>isDesktopPreview?{launchAtLogin:false,loginStatus:'notRegistered',notifications:false,notificationStatus:'notDetermined',sound:'soft',menuDisplay:'count',pinned:false,version:'1.0.0'}:null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  useEffect(()=>{
    if(isDesktopPreview)return
    void desktopCall<Preferences>('settings').then(setSettings).catch(e=>setError(e.message))
  },[])
  async function change(key:string,value:unknown){
    if(isDesktopPreview){setSettings(s=>s?{...s,[key]:value}:s);return}
    setBusy(true);setError('')
    try{setSettings(await desktopCall<Preferences>('setPreference',{key,value}))}catch(e){setError(e instanceof Error?e.message:'This preference could not be changed.')}finally{setBusy(false)}
  }
  return <section className="desktop-preferences"><h3>Your menu bar companion</h3><p>Apply Vigil stays in your menu bar. Click outside to close the panel, or pin it while you work.</p>
    {settings?<>
      <label className="preference-row"><span>Launch at login<small>Ready when you start your Mac.</small></span><input type="checkbox" checked={settings.launchAtLogin} disabled={busy} onChange={e=>{void change('launchAtLogin',e.target.checked)}}/></label>
      {settings.loginStatus==='requiresApproval'&&<p className="fine-print">Approve Apply Vigil in System Settings → General → Login Items.</p>}
      <label className="preference-row"><span>Keep panel open<small>Stays visible when you click another app.</small></span><input type="checkbox" checked={settings.pinned} disabled={busy} onChange={e=>{void change('pinned',e.target.checked)}}/></label>
      <label className="preference-row"><span>Menu bar display</span><select value={settings.menuDisplay} disabled={busy} onChange={e=>{void change('menuDisplay',e.target.value)}}><option value="count">Count / goal</option><option value="percent">Percent complete</option><option value="icon">Icon only</option></select></label>
      <label className="preference-row"><span>macOS notifications<small>Uses your existing quiet alert policy.</small></span><input type="checkbox" checked={settings.notifications} disabled={busy} onChange={e=>{void change('notifications',e.target.checked)}}/></label>
      {settings.notificationStatus==='denied'&&<p className="fine-print">Banners are disabled in System Settings → Notifications → Apply Vigil. Your in-app inbox still works.</p>}
      <label className="preference-row"><span>Alert sound</span><select value={settings.sound} disabled={busy} onChange={e=>{void change('sound',e.target.value)}}>{SOUND_OPTIONS.map(sound=><option key={sound.value} value={sound.value}>{sound.label}</option>)}</select></label>
      <div className="settings-actions"><button disabled={settings.sound==='none'} onClick={()=>{if(!isDesktopPreview)void desktopCall('previewSound').catch(e=>setError(e.message))}}>Preview sound</button><button onClick={()=>{if(!isDesktopPreview)void desktopCall('openWebsite')}}>Open web dashboard ↗</button></div>
      <p className="fine-print">Alerts and sync run while Apply Vigil is open. Sounds follow your Mac’s output volume; Focus can silence banners.</p>
      <div className="desktop-version"><span>Apply Vigil {settings.version}</span><button className="text-button" onClick={()=>{if(!isDesktopPreview)void desktopCall('quit')}}>Quit Apply Vigil</button></div>
    </>:<p>Loading Mac preferences…</p>}
    {isDesktopPreview&&<p className="fine-print">Preview preferences stay in this demo.</p>}{error&&<p className="form-error" role="alert">{error}</p>}
  </section>
}

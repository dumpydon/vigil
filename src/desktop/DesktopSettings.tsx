import Icon from '../components/Icon'
import type useDesktopPreferences from './useDesktopPreferences'
import {SOUND_OPTIONS} from './sounds'

export default function DesktopSettings({section,preferences}:{section:'general'|'alerts';preferences:ReturnType<typeof useDesktopPreferences>}){
  const {settings,busy,change,previewSound}=preferences
  if(!settings)return <p className="settings-loading" role="status">Loading Mac preferences…</p>
  if(section==='general')return <section className="settings-group desktop-preferences" aria-label="Menu bar preferences">
    <h3>Menu bar</h3>
    <div className="settings-card">
      <label className="preference-row"><span>Launch at login</span><input className="settings-switch" role="switch" type="checkbox" checked={settings.launchAtLogin} disabled={busy} onChange={e=>{void change('launchAtLogin',e.target.checked)}}/></label>
      <label className="preference-row"><span>Keep panel open</span><input className="settings-switch" role="switch" type="checkbox" checked={settings.pinned} disabled={busy} onChange={e=>{void change('pinned',e.target.checked)}}/></label>
      <label className="preference-row"><span>Menu bar display</span><select value={settings.menuDisplay} disabled={busy} onChange={e=>{void change('menuDisplay',e.target.value)}}><option value="count">Count / goal</option><option value="percent">Percent complete</option><option value="icon">Icon only</option></select></label>
    </div>
    {settings.loginStatus==='requiresApproval'&&<p className="fine-print" role="status">Approve Apply Vigil in System Settings → General → Login Items.</p>}
    {settings.loginStatus==='notFound'&&<p className="fine-print" role="status">Open this copy from Applications, then enable Launch at login.</p>}
    {settings.loginError&&<p className="form-error" role="alert">Launch at login: {settings.loginError}</p>}
  </section>
  return <section className="settings-group desktop-preferences" aria-label="Notification preferences">
    <h3>Notifications &amp; sound</h3>
    <div className="settings-card">
      <label className="preference-row"><span>macOS notifications</span><input className="settings-switch" role="switch" type="checkbox" checked={settings.notifications} disabled={busy} onChange={e=>{void change('notifications',e.target.checked)}}/></label>
      <div className="preference-row"><label htmlFor="settings-alert-sound">Alert sound</label><div className="settings-sound-controls"><select id="settings-alert-sound" value={settings.sound} disabled={busy} onChange={e=>{void change('sound',e.target.value)}}>{SOUND_OPTIONS.map(sound=><option key={sound.value} value={sound.value}>{sound.label}</option>)}</select><button className="icon-button settings-sound-preview" aria-label="Preview sound" title="Preview sound" disabled={busy||settings.sound==='none'} onClick={()=>{void previewSound()}}><Icon name="play" size={14}/></button></div></div>
    </div>
    {settings.notificationStatus==='denied'&&<p className="fine-print" role="status">Enable banners in System Settings → Notifications → Apply Vigil. Your in-app inbox still works.</p>}
    <details className="settings-details"><summary>How alerts work</summary><p>Alerts run while Apply Vigil is open and follow your quiet alert settings. Sounds use your Mac’s volume; Focus may silence banners.</p></details>
  </section>
}

import {useEffect,useId,useMemo,useState} from 'react'
import useTimePreferences from '../hooks/useTimePreferences'
import {timePreferences} from '../data/time-preferences'
import {availableTimeZones,clockTime,normalizeTimeZone,zoneLabel,zoneOffset,type TimePreferences} from '../utils/time'

export default function TimeSettings(){
  const preferences=useTimePreferences(),id=useId(),zones=useMemo(()=>availableTimeZones(),[])
  const [zoneDraft,setZoneDraft]=useState<string|null>(null),[now,setNow]=useState(()=>new Date()),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false)
  useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(timer)},[])
  const zone=zoneDraft??preferences.timeZone,selectedZone=normalizeTimeZone(zone),changed=selectedZone!==preferences.timeZone
  async function save(value:TimePreferences){
    if(busy)return
    setBusy(true);setError('');setSaved(false)
    try{await timePreferences.save(value);if(selectedZone===value.timeZone)setZoneDraft(null);setSaved(true)}catch(error){setError(error instanceof Error?error.message:'Time preferences could not be saved.')}finally{setBusy(false)}
  }
  return <section className="settings-group time-preferences" aria-labelledby={`${id}-heading`}>
    <h3 id={`${id}-heading`}>Time &amp; date</h3>
    <div className="settings-card time-settings-card">
    <label htmlFor={`${id}-zone`}>Time zone</label>
    <div className="time-zone-field"><input id={`${id}-zone`} type="text" list={`${id}-zones`} value={zone} autoCapitalize="none" spellCheck={false} disabled={busy} placeholder="Asia/Kolkata" aria-describedby={`${id}-zone-help`} aria-invalid={!!zone&&!selectedZone} onChange={event=>{setZoneDraft(event.target.value);setError('');setSaved(false)}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();if(selectedZone)void save({...preferences,timeZone:selectedZone})}}}/><button type="button" disabled={busy||!selectedZone||!changed} onClick={()=>{if(selectedZone)void save({...preferences,timeZone:selectedZone})}}>Apply</button></div>
    <datalist id={`${id}-zones`}>{zones.map(value=><option key={value} value={value}/>)}</datalist>
    {zone&&!selectedZone&&<p className="form-error" role="alert">This time zone isn’t recognized. Choose a city from the list.</p>}
    <div className="clock-format-row"><span>Clock format</span><div className="segmented" role="group" aria-label="Clock format">{(['12h','24h'] as const).map(format=><button type="button" key={format} className={preferences.clockFormat===format?'selected':''} aria-pressed={preferences.clockFormat===format} disabled={busy} onClick={()=>{void save({...preferences,clockFormat:format})}}>{format==='12h'?'12-hour':'24-hour'}</button>)}</div></div>
    <div className="time-preview-row"><p className="time-preview" aria-label="Time display preview"><time dateTime={now.toISOString()}>{clockTime(now,preferences)}</time><span>{zoneLabel(preferences.timeZone,now)} · {zoneOffset(preferences.timeZone,now)}</span></p><span className="time-preference-saved" role="status">{saved?'Saved':''}</span></div>
    </div>
    <details className="settings-details"><summary>About time zones</summary><p id={`${id}-zone-help`}>India (Asia/Kolkata) is the default. Choose a city time zone, or enter IST or GMT+5:30. The 12-hour clock uses AM/PM. Only displayed times change; saved dates and daily counts stay unchanged.</p></details>
    {error&&<p className="form-error" role="alert">{error}</p>}
  </section>
}

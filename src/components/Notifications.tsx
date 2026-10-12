import {useId,useState,type KeyboardEvent} from 'react'
import {utcDay} from '../../shared/model'
import {alertsStore,type AlertsState} from '../data/alerts'
import {alertTime} from '../utils/notifications'
import Icon from './Icon'

export default function Notifications({state,now}:{state:AlertsState;now:Date}){
  const [tab,setTab]=useState<'alerts'|'activity'>('alerts'),[visible,setVisible]=useState(12),id=useId()
  const unread=state.items.filter(item=>!item.readAt),paused=state.pausedOn===utcDay(now)
  const items=[...(tab==='activity'?state.items.filter(item=>item.readAt):state.items)].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))
  function select(next:'alerts'|'activity'){setTab(next);setVisible(12)}
  function keyboard(event:KeyboardEvent<HTMLButtonElement>){
    if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return
    event.preventDefault();const next=tab==='alerts'?'activity':'alerts';select(next)
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus()
  }
  return <section className="alerts-panel" aria-label="Notifications">
    <div className="alerts-heading"><h1>Alerts</h1><p>Quiet updates on your application goals.</p></div>
    <div className="alerts-toolbar">
      <div className="alerts-tabs" role="tablist" aria-label="Notification views">{(['alerts','activity'] as const).map(value=><button key={value} role="tab" id={`${id}-${value}`} data-tab={value} aria-selected={tab===value} aria-controls={`${id}-list`} title={value==='activity'?'Read alert history':'All recent alerts'} tabIndex={tab===value?0:-1} onClick={()=>select(value)} onKeyDown={keyboard}>{value==='alerts'?'Alerts':'Activity'}</button>)}</div>
      <div className="alerts-actions">
        <button className={`icon-button alerts-pause${paused?' paused':''}`} aria-label={paused?'Resume alerts':'Pause alerts for today'} title={paused?'Resume alerts':'Pause alerts for today'} aria-pressed={paused} disabled={!state.ready||!!state.error} onClick={()=>{void alertsStore.togglePause(utcDay(new Date()))}}><Icon name="clock" size={18}/></button>
        <button className="alerts-read-all" disabled={!unread.length} onClick={()=>{void alertsStore.readAll()}}>Read all</button>
        <button className="icon-button" aria-label="Clear read alerts" title="Clear read alerts" disabled={!state.items.some(item=>item.readAt)} onClick={()=>{void alertsStore.clearRead()}}><Icon name="trash" size={18}/></button>
      </div>
    </div>
    {paused&&<p className="alerts-paused-note" role="status">New alerts are paused for today · UTC.</p>}
    {state.error&&<p className="alerts-error" role="alert">{state.error}</p>}
    <div role="tabpanel" id={`${id}-list`} aria-labelledby={`${id}-${tab}`}>
      {!state.ready?<p className="alerts-empty">Loading alerts…</p>:!items.length?<div className="alerts-empty"><Icon name="bell" size={25}/><strong>{tab==='alerts'?'All caught up':'Nothing read yet'}</strong><span>{tab==='alerts'?'New goal updates will appear here.':'Read alerts will appear here.'}</span></div>:<ul className="alerts-list">{items.slice(0,visible).map(item=>{
        const time=alertTime(item.createdAt,now)
        return <li key={item.id} className={`alert-card ${item.tone}${item.readAt?' read':''}`}>
          <span className="alert-icon"><Icon name={['goal','streak','record','milestone'].includes(item.kind)?'goal-check':item.kind==='weekly'?'history':item.kind==='comeback'?'arrow':'gauge'} size={21}/></span>
          <div className="alert-copy"><strong>{item.title}</strong><p>{item.detail}</p></div>
          <div className="alert-meta"><time dateTime={item.createdAt} title={time.absolute}>{time.label}</time>{item.readAt?<span className="alert-read-check" role="img" aria-label="Read"><Icon name="check" size={17}/></span>:<button className="alert-read" aria-label={`Mark ${item.title} as read`} onClick={()=>{void alertsStore.markRead(item.id)}}>Read</button>}</div>
        </li>
      })}</ul>}
      {items.length>visible&&<button className="load-more" onClick={()=>setVisible(count=>count+12)}>Show older alerts</button>}
    </div>
  </section>
}

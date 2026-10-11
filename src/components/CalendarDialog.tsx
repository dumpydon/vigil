import {useEffect,useRef,useState,type KeyboardEvent} from 'react'
import {FIRST_DAY,shiftDay} from '../../shared/model'
import {calendarWeeks,moveCalendarMonth} from '../utils/calendar'
import {longDate} from '../utils/format'
import Modal from './Modal'
import Icon from './Icon'

const months=['January','February','March','April','May','June','July','August','September','October','November','December']
const weekdays=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

export default function CalendarDialog({day,today,onSelect,onClose}:{day:string;today:string;onSelect:(day:string)=>void;onClose:()=>void}) {
  const [month,setMonth]=useState(day.slice(0,7)),[focused,setFocused]=useState(day)
  const grid=useRef<HTMLDivElement>(null),focusPending=useRef(true)
  const firstMonth=FIRST_DAY.slice(0,7),lastMonth=today.slice(0,7)
  const year=Number(month.slice(0,4)),monthIndex=Number(month.slice(5))-1
  const tabDay=focused.startsWith(month)?focused:month+'-01'

  useEffect(()=>{
    if(!focusPending.current)return
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus()
    focusPending.current=false
  },[focused,month])

  function showMonth(next:string){setMonth(next<firstMonth?firstMonth:next>lastMonth?lastMonth:next)}
  function keyboard(event:KeyboardEvent<HTMLButtonElement>,date:string){
    const weekday=new Date(date+'T00:00:00.000Z').getUTCDay()
    let next:string
    switch(event.key){
      case 'ArrowLeft':next=shiftDay(date,-1);break
      case 'ArrowRight':next=shiftDay(date,1);break
      case 'ArrowUp':next=shiftDay(date,-7);break
      case 'ArrowDown':next=shiftDay(date,7);break
      case 'Home':next=shiftDay(date,-weekday);break
      case 'End':next=shiftDay(date,6-weekday);break
      case 'PageUp':next=moveCalendarMonth(date,-1);break
      case 'PageDown':next=moveCalendarMonth(date,1);break
      default:return
    }
    event.preventDefault()
    next=next<FIRST_DAY?FIRST_DAY:next>today?today:next
    focusPending.current=true;setFocused(next);showMonth(next.slice(0,7))
  }

  return <Modal title="Choose a date · UTC" className="calendar-modal" initialFocus={'[aria-selected="true"]'} onClose={onClose}>
    <div className="calendar-toolbar">
      <button className="icon-button calendar-previous" aria-label="Previous month" disabled={month<=firstMonth} onClick={()=>showMonth(moveCalendarMonth(month+'-01',-1).slice(0,7))}><Icon name="arrow"/></button>
      <select aria-label="Month" value={monthIndex} onChange={event=>showMonth(`${year}-${String(Number(event.target.value)+1).padStart(2,'0')}`)}>{months.map((name,index)=><option key={name} value={index} disabled={`${year}-${String(index+1).padStart(2,'0')}`>lastMonth}>{name}</option>)}</select>
      <select aria-label="Year" value={year} onChange={event=>showMonth(`${event.target.value}-${String(monthIndex+1).padStart(2,'0')}`)}>{Array.from({length:Number(today.slice(0,4))-1969},(_,index)=>1970+index).map(value=><option key={value} value={value}>{value}</option>)}</select>
      <button className="icon-button" aria-label="Next month" disabled={month>=lastMonth} onClick={()=>showMonth(moveCalendarMonth(month+'-01',1).slice(0,7))}><Icon name="arrow"/></button>
    </div>
    <div className="calendar-grid" role="grid" aria-label={`${months[monthIndex]} ${year}`} ref={grid}>
      <div className="calendar-weekdays" role="row">{weekdays.map(name=><span key={name} role="columnheader" aria-label={name}>{name.slice(0,2)}</span>)}</div>
      {calendarWeeks(month).map(week=><div className="calendar-week" role="row" key={week[0]}>{week.map(date=><button key={date} type="button" role="gridcell" className={`calendar-day${date===day?' selected':''}${date.startsWith(month)?'':' outside-month'}`} data-date={date} aria-label={`${longDate(date)} UTC`} aria-selected={date===day} aria-current={date===today?'date':undefined} tabIndex={date===tabDay?0:-1} disabled={date<FIRST_DAY||date>today} onClick={()=>onSelect(date)} onKeyDown={event=>keyboard(event,date)}>{Number(date.slice(8))}</button>)}</div>)}
    </div>
    <div className="calendar-footer"><button onClick={()=>onSelect(today)}>Today</button><button className="primary-button" onClick={onClose}>Cancel</button></div>
  </Modal>
}

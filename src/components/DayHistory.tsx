import {useState,type Ref} from 'react'
import {FIRST_DAY,shiftDay} from '../../shared/model'
import {headerDate,longDate,shortDate} from '../utils/format'
import CalendarDialog from './CalendarDialog'
import Icon from './Icon'

interface Props {
  day:string;today:string;easy:number;external:number
  onChooseDay:(day:string|null)=>void;onEdit:()=>void;sectionRef:Ref<HTMLElement>
}

export default function DayHistory({day,today,easy,external,onChooseDay,onEdit,sectionRef}:Props){
  const [calendarOpen,setCalendarOpen]=useState(false)
  const number=(value:number)=>value.toLocaleString('en')
  return <section className="section day-history" ref={sectionRef} aria-label="Browse UTC history">
    <div className="section-heading">
      <h2>Browse history</h2>
      <div className="history-day-navigation" role="group" aria-label="Browse days">
        <button className="history-step" aria-label="Previous UTC day" disabled={day<=FIRST_DAY} onClick={()=>onChooseDay(shiftDay(day,-1))}>‹</button>
        <button className="text-button" onClick={()=>onChooseDay(null)}>Today</button>
        <button className="history-step" aria-label="Next UTC day" disabled={day>=today} onClick={()=>onChooseDay(shiftDay(day,1))}>›</button>
      </div>
    </div>
    <div className="history-day-card" aria-label={`Applications for ${longDate(day)} UTC`}>
      <div className="history-day-heading">
        <button className="history-date-picker" aria-label={`Choose history date, ${longDate(day)} UTC`} aria-haspopup="dialog" aria-expanded={calendarOpen} onClick={()=>setCalendarOpen(true)}>
          <time dateTime={day} title={`${longDate(day)} · UTC`}><span className="history-date-long">{headerDate(day)}</span><span className="history-date-short">{shortDate(day)}</span></time><Icon name="calendar" size={17}/>
        </button>
        <button className="small-button history-edit" aria-label={`Edit counts for ${longDate(day)} UTC`} onClick={onEdit}><Icon name="edit" size={14}/>Edit counts · {shortDate(day)}</button>
      </div>
      <div className="history-day-summary">
        <div className="history-day-total"><strong>{number(easy+external)}</strong><span>applications</span></div>
        <div className="history-day-categories"><span className="easy-text"><i className="easy-dot"/><strong>{number(easy)}</strong> Easy Apply</span><span className="external-text"><i className="external-dot"/><strong>{number(external)}</strong> External</span></div>
      </div>
    </div>
    {day<today&&<p className="fine-print history-day-note">Confirm past edits. Quick buttons log today.</p>}
    {calendarOpen&&<CalendarDialog day={day} today={today} onSelect={date=>{onChooseDay(date);setCalendarOpen(false)}} onClose={()=>setCalendarOpen(false)}/>}
  </section>
}

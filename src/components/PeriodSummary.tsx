import { useEffect, useId, useMemo, useState } from 'react'
import { periodSummary, type PeriodWindow, type UnavailableReason } from '../../shared/periods'
import type { Snapshot } from '../../shared/model'
import { longDate } from '../utils/format'

const number=(n:number)=>n.toLocaleString('en')
const reasonText=(reason:UnavailableReason)=>reason==='not-enough-history'?'Not enough history':'Data unavailable'
function countDescription(window:PeriodWindow) {
  if(!window.counts)return reasonText(window.unavailableReason!)
  return `${number(window.counts.total)} ${window.historyComplete?'applications':'recorded applications · partial history'}`
}
function boundary(iso:string){return `${longDate(iso.slice(0,10))} ${iso.slice(11,19)} UTC`}
function WindowDetails({label,window}:{label:string;window:PeriodWindow}) {
  return <div className="period-window"><strong>{label}: {countDescription(window)}</strong><span>{boundary(window.start)} → {boundary(window.end)}{window.endInclusive?' (through now)':' (end excluded)'}</span></div>
}

export default function PeriodSummary({snapshot}:{snapshot:Snapshot}) {
  const [now,setNow]=useState(()=>new Date()),[open,setOpen]=useState<string|null>(null),id=useId()
  useEffect(()=>{
    const refresh=()=>setNow(new Date()),timer=setInterval(refresh,60_000)
    window.addEventListener('focus',refresh)
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}
  },[])
  const summary=useMemo(()=>periodSummary(snapshot,now),[snapshot,now])
  return <section className="period-summary" aria-label="Application period summary">
    <div role="table" aria-label="Applications in fixed UTC periods" className="period-table">
      <div role="rowgroup"><div role="row" className="period-columns"><span role="columnheader">Period</span><span role="columnheader">Change</span><span role="columnheader">Applications</span><span role="columnheader" className="period-breakdown-heading">Breakdown</span></div></div>
      <div role="rowgroup">{summary.rows.map(row=>{
        const {current,comparison}=row,counts=current.counts,helpId=`${id}-${row.id}-help`,descriptionId=`${id}-${row.id}-description`,change=comparison?.change
        const description=`${row.description}${counts&&!current.historyComplete?` Only records since tracking began on ${snapshot.trackingStart} UTC are included; this is partial history.`:''}${!counts?` ${reasonText(current.unavailableReason!)}.`:''}`
        return <div key={row.id} role="row" className="period-row" aria-describedby={descriptionId}>
          <span role="rowheader" className="period-label" title={description}>{row.label}{counts&&!current.historyComplete?<small className="period-history">Partial history</small>:null}<span className="visually-hidden" id={descriptionId}>{description}</span></span>
          <div role="cell" className="period-change-cell">{change?<button type="button" className={`period-change ${change.kind}`} aria-label={`${row.label} change: ${change.kind==='increase'?'increase ':change.kind==='decrease'?'decrease ':''}${change.text}${change.reason?'. '+reasonText(change.reason):''}. Show UTC comparison details.`} aria-describedby={open===row.id?helpId:descriptionId} aria-expanded={open===row.id} aria-controls={helpId}
            onMouseEnter={()=>setOpen(row.id)} onMouseLeave={e=>{if(document.activeElement!==e.currentTarget)setOpen(null)}} onFocus={()=>setOpen(row.id)} onBlur={()=>setOpen(null)} onClick={()=>setOpen(row.id)} onKeyDown={e=>{if(e.key==='Escape'){setOpen(null);e.stopPropagation()}}}>
            {change.kind==='increase'||change.kind==='decrease'?<span aria-hidden="true" className="period-arrow">{change.kind==='increase'?'▲':'▼'}</span>:null}{change.text}
          </button>:<span className="visually-hidden">No comparison for this unfinished period.</span>}</div>
          <div role="cell" className="period-total"><strong>{counts?number(counts.total):'—'}</strong></div>
          <div role="cell" className="period-breakdown">{counts?<><span className="easy-text">{number(counts.easy)} Easy</span><span className="period-separator" aria-hidden="true">·</span><span className="external-text">{number(counts.external)} External</span></>:<span>{reasonText(current.unavailableReason!)}</span>}</div>
          {comparison&&open===row.id?<div id={helpId} role="tooltip" className="period-help"><strong>{row.label} · UTC</strong><p>{row.description}</p>{change?.reason?<p>{reasonText(change.reason)}.{change.reason==='data-unavailable'?` Cached history is available through ${summary.cachedThrough??'an unknown UTC date'}; sync to load the missing dates.`:` Tracking began on ${summary.trackingStart} UTC.`}</p>:null}<WindowDetails label="Current" window={current}/><WindowDetails label="Previous" window={comparison.previous}/></div>:null}
        </div>
      })}</div>
    </div>
    {summary.pace!==null?<p className="period-pace" aria-label={`Simple pace estimate: approximately ${number(summary.pace)} applications this UTC month, extrapolated from the month-to-date total and elapsed fractional UTC days.`}>Current pace: ~ <span className="pace-value">{number(summary.pace)}</span> applications/month</p>:null}
  </section>
}

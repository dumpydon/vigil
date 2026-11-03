import type {Snapshot} from '../../shared/model'
import {momentumSummary} from '../utils/momentum'
import {shortDate} from '../utils/format'
import Icon from './Icon'

const count=(value:number)=>value.toLocaleString('en')
const average=(value:number)=>value.toLocaleString('en',{maximumFractionDigits:2})

export default function Momentum({snapshot,today,canUndo,onUndo,onUsage}:{snapshot:Snapshot;today:string;canUndo:boolean;onUndo:()=>void;onUsage:()=>void}){
  const summary=momentumSummary(snapshot,today)
  return <section className="desktop-insights section" aria-label="Application momentum">
    <div className="section-heading"><h2>Keep your momentum</h2><button className="text-button" onClick={onUsage}>View usage <Icon name="arrow" size={14}/></button></div>
    <div className="momentum-columns">
      <div className="momentum-column" role="group" aria-label="Yesterday’s applications"><span className="momentum-period">Yesterday</span><strong data-testid="momentum-yesterday" title={`${count(summary.yesterday)} applications yesterday`}>{count(summary.yesterday)}</strong></div>
      {([summary.seven,summary.thirty] as const).map(period=><div className="momentum-column" key={period.days} role="group" aria-label={`Last ${period.days} days including today`} title={`${shortDate(period.start)}–${shortDate(period.end)} · includes today`}>
        <span className="momentum-period">{period.days} days</span>
        <strong data-testid={`momentum-${period.days}-total`} title={`${count(period.total)} applications in the last ${period.days} days, including today`}>{count(period.total)}</strong>
        <span className="momentum-average" aria-label={`Daily average: ${average(period.average)} applications`} title={`${count(period.total)} applications ÷ ${period.days} calendar days, including today`}><b data-testid={`momentum-${period.days}-average`}>{average(period.average)}</b><small>/day</small></span>
      </div>)}
      <div className="momentum-column" role="group" aria-label="All-time applications"><span className="momentum-period">All time</span><strong data-testid="momentum-all-time" title={`${count(summary.allTime)} applications in your saved history`}>{count(summary.allTime)}</strong></div>
    </div>
    <div className="momentum-footer"><button className="desktop-undo text-button" disabled={!canUndo} onClick={onUndo}><Icon name="undo" size={14}/>Undo latest entry</button><span className="momentum-note">Today included</span></div>
  </section>
}

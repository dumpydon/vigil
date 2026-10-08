import { totalsByDay, utcDay, type Snapshot } from './model'

const DAY_MS=86_400_000
export type PeriodId='today'|'yesterday'|'week'|'month30'|'month'
export type UnavailableReason='not-enough-history'|'data-unavailable'
export interface PeriodCounts { easy:number; external:number; total:number }
export interface PeriodWindow {
  start:string; end:string; endInclusive:boolean
  counts:PeriodCounts|null; historyComplete:boolean; unavailableReason:UnavailableReason|null
}
export interface PeriodChange {
  kind:'increase'|'decrease'|'same'|'new'|'unavailable'
  text:string; reason?:UnavailableReason
}
export interface PeriodRow {
  id:PeriodId; label:string; description:string; current:PeriodWindow
  comparison?:{previous:PeriodWindow;change:PeriodChange}
}

export function percentageChange(current:number,previous:number):PeriodChange {
  if(current===previous)return {kind:'same',text:'0%'}
  if(previous===0)return {kind:'new',text:'New'}
  const amount=Math.abs((current-previous)/previous*100)
  return {kind:current>previous?'increase':'decrease',text:amount<1?'<1%':`${Math.round(amount)}%`}
}

export function periodSummary(snapshot:Snapshot,now:Date) {
  const today=utcDay(now),dayStart=Date.parse(`${today}T00:00:00.000Z`),nowTime=now.getTime()
  const monthStart=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)
  const nextMonth=Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)
  const totals=totalsByDay(snapshot.entries)
  // /api/snapshot contains all entry history, and IndexedDB stores that entire
  // snapshot. A later UTC day absent from a stale cache is unknown, not zero.
  const syncedTime=Date.parse(snapshot.serverNow)
  const cachedThrough=Number.isFinite(syncedTime)?utcDay(new Date(syncedTime)):null
  function window(start:number,end:number,endInclusive=false):PeriodWindow {
    const first=utcDay(new Date(start)),last=utcDay(new Date(endInclusive?end:end-1))
    const historyComplete=first>=snapshot.trackingStart
    const unavailableReason=cachedThrough===null||last>cachedThrough?'data-unavailable':last<snapshot.trackingStart?'not-enough-history':null
    let easy=0,external=0
    for(const [date,counts] of totals)if(date>=first&&date<=last){easy+=counts.easy;external+=counts.external}
    return {start:new Date(start).toISOString(),end:new Date(end).toISOString(),endInclusive,historyComplete,unavailableReason,counts:unavailableReason?null:{easy,external,total:easy+external}}
  }
  function compared(id:PeriodId,label:string,days:number,description:string):PeriodRow {
    const start=dayStart-days*DAY_MS,current=window(start,dayStart),previous=window(start-days*DAY_MS,start)
    const reason=current.unavailableReason==='data-unavailable'||previous.unavailableReason==='data-unavailable'?'data-unavailable':!current.historyComplete||!previous.historyComplete?'not-enough-history':null
    const change:PeriodChange=reason?{kind:'unavailable',text:'—',reason}:percentageChange(current.counts!.total,previous.counts!.total)
    return {id,label,description,current,comparison:{previous,change}}
  }
  const rows:PeriodRow[]=[
    {id:'today',label:'Today · so far',description:'Today from 00:00 UTC through now. Today is unfinished, so no comparison is shown.',current:window(dayStart,nowTime,true)},
    compared('yesterday','Yesterday',1,'The last completed UTC day, compared with the UTC day before it.'),
    compared('week','Last 7 days',7,'Seven completed UTC days, excluding today. Compared with the preceding seven completed UTC days.'),
    compared('month30','Last 30 days',30,'Thirty completed UTC days, excluding today. Compared with the preceding thirty completed UTC days.'),
    {id:'month',label:'This month',description:'The current UTC calendar month from its beginning through now. No month comparison is shown.',current:window(monthStart,nowTime,true)},
  ]
  const month=rows[4].current,elapsedDays=(nowTime-monthStart)/DAY_MS,daysInMonth=(nextMonth-monthStart)/DAY_MS
  const pace=month.counts&&month.historyComplete&&elapsedDays>=1?Math.round(month.counts.total/elapsedDays*daysInMonth):null
  return {rows,pace,cachedThrough,trackingStart:snapshot.trackingStart}
}

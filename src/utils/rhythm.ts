import {EASY_STREAK_TARGET,FIRST_DAY,shiftDay,totalsByDay,type Snapshot} from '../../shared/model'

export interface RhythmDay {date:string;easy:number;external:number;total:number;level:number;tracked:boolean}
export interface RhythmMonth {key:string;label:string;year:string;columns:number;cells:(RhythmDay|null)[]}
export const RHYTHM_WINDOW=90
export const RHYTHM_MONTH_BATCH=6
export const RHYTHM_CELL_GAP=5
export const RHYTHM_MONTH_GAP=12
export const RHYTHM_THRESHOLDS=[0,1,10,20,40] as const
export const RHYTHM_WEEKDAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] as const
const monthFormatter=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short'})

export function rhythmLevel(total:number){
  return RHYTHM_THRESHOLDS.reduce<number>((level,threshold,index)=>total>=threshold?index:level,0)
}
export function shiftMonth(month:string,delta:number){
  const date=new Date(`${month}-01T00:00:00.000Z`)
  date.setUTCMonth(date.getUTCMonth()+delta)
  return date.toISOString().slice(0,7)
}
const weekday=(date:string)=>(new Date(`${date}T00:00:00.000Z`).getUTCDay()+6)%7

export function rhythm(snapshot:Pick<Snapshot,'entries'|'trackingStart'>,today:string,monthCount=RHYTHM_MONTH_BATCH){
  const totals=totalsByDay(snapshot.entries),candidateStart=shiftDay(today,1-RHYTHM_WINDOW),start=candidateStart<FIRST_DAY?FIRST_DAY:candidateStart
  const byDate=new Map<string,RhythmDay>(),weekdayTotals=Array<number>(7).fill(0)
  let total=0,activeDays=0
  for(const [date,counts] of totals)if(date>=start&&date<=today){
    const count=counts.easy+counts.external
    total+=count;weekdayTotals[weekday(date)]+=count
    if(count>0)activeDays++
  }
  let longest={days:0,from:null as string|null,to:null as string|null},run=0,runStart:string|null=null,previous:string|null=null
  for(const date of [...totals.keys()].filter(date=>date>=snapshot.trackingStart&&date<=today).sort()){
    if(totals.get(date)!.easy<EASY_STREAK_TARGET){run=0;runStart=null;previous=null;continue}
    const adjacent=previous!==null&&shiftDay(previous,1)===date
    run=adjacent?run+1:1;if(!adjacent)runStart=date
    if(run>=longest.days)longest={days:run,from:runStart,to:date}
    previous=date
  }
  const peak=Math.max(...weekdayTotals),busiest=peak?weekdayTotals.flatMap((count,index)=>count===peak?[index]:[]):[]
  const latestMonth=today.slice(0,7),availableMonths=(Number(latestMonth.slice(0,4))-1970)*12+Number(latestMonth.slice(5))
  // Rendering is paged independently of the full history's totals and streaks.
  const loadedMonths=Math.min(availableMonths,Math.max(RHYTHM_MONTH_BATCH,Number.isFinite(monthCount)?Math.floor(monthCount):RHYTHM_MONTH_BATCH))
  const firstMonth=shiftMonth(latestMonth,1-loadedMonths)
  const months:RhythmMonth[]=[]
  for(let key=firstMonth;key<=latestMonth;key=shiftMonth(key,1)){
    const first=`${key}-01`,offset=weekday(first),[year,month]=key.split('-').map(Number)
    const lastDay=key===latestMonth?Number(today.slice(-2)):new Date(Date.UTC(year,month,0)).getUTCDate(),columns=Math.ceil((offset+lastDay)/7)
    const cells=Array.from({length:columns*7},(_,index)=>{
      const day=index-offset+1
      if(day<1||day>lastDay)return null
      const date=`${key}-${String(day).padStart(2,'0')}`,counts=totals.get(date)??{easy:0,external:0},count=counts.easy+counts.external
      const item={date,...counts,total:count,level:rhythmLevel(count),tracked:date>=snapshot.trackingStart||count>0}
      byDate.set(date,item);return item
    })
    months.push({key,label:monthFormatter.format(new Date(`${first}T00:00:00.000Z`)),year:key.slice(0,4),columns,cells})
  }
  const recent=months.filter(month=>month.key>=start.slice(0,7)),first=recent[0]
  const skipped=first?Math.floor((weekday(`${first.key}-01`)+Number(start.slice(-2))-1)/7):0
  const visibleColumns=recent.reduce((sum,month)=>sum+month.columns,0)-skipped
  return {start,today,total,activeDays,weekdayTotals,busiest,longest,months,byDate,visibleColumns,visibleMonths:recent.length,hasEarlier:loadedMonths<availableMonths}
}

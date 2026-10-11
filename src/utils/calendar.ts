import {shiftDay,utcDay} from '../../shared/model'

export function calendarWeeks(month:string):string[][] {
  const first=month+'-01'
  const start=shiftDay(first,-new Date(first+'T00:00:00.000Z').getUTCDay())
  return Array.from({length:6},(_,week)=>Array.from({length:7},(_,day)=>shiftDay(start,week*7+day)))
}

export function moveCalendarMonth(day:string,offset:number):string {
  const date=new Date(day+'T00:00:00.000Z')
  const year=date.getUTCFullYear(),month=date.getUTCMonth()+offset
  const last=new Date(Date.UTC(year,month+1,0)).getUTCDate()
  return utcDay(new Date(Date.UTC(year,month,Math.min(date.getUTCDate(),last))))
}

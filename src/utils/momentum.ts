import {shiftDay,totalsByDay,type Day,type Snapshot} from '../../shared/model'

// Rolling calendar windows include today, including its retained pending writes.
// Zero-entry days count toward the fixed 7/30-day denominator. Viewing a
// different chart range or history date must never change these home metrics.
export function momentumSummary(snapshot:Snapshot,today:Day){
  const totals=totalsByDay(snapshot.entries),yesterday=shiftDay(today,-1)
  const window=(days:7|30)=>{
    const start=shiftDay(today,1-days)
    let total=0
    for(const [date,counts] of totals)if(date>=start&&date<=today)total+=counts.easy+counts.external
    return {start,end:today,days,total,average:total/days}
  }
  const prior=totals.get(yesterday)
  let allTime=0
  for(const [date,counts] of totals)if(date<=today)allTime+=counts.easy+counts.external
  return {yesterday:prior?prior.easy+prior.external:0,seven:window(7),thirty:window(30),allTime}
}

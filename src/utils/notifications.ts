import {goalFor,shiftDay,totalsByDay,utcDay,type Snapshot} from '../../shared/model'

export type AlertKind='overview'|'goal'|'reminder'|'weekly'|'halfway'|'streak'|'record'|'milestone'|'comeback'
export type AlertTone='neutral'|'warning'|'success'
export interface VigilAlert {
  id:string;kind:AlertKind;tone:AlertTone;day:string
  title:string;detail:string;createdAt:string;readAt:string|null
}
export interface AlertInbox {
  items:VigilAlert[]
  receipts:{id:string;createdAt:string}[]
  pausedOn:string|null
}
const DAY=86_400_000
const HOUR=3_600_000
export const ALERT_LIMITS={daily:3,weekly:21,retentionDays:15} as const
const number=(value:number)=>value.toLocaleString('en')
export function emptyInbox():AlertInbox{return {items:[],receipts:[],pausedOn:null}}

export function alertSnapshotNeedsRefresh(snapshot:Snapshot,now:Date):boolean {
  const synced=Date.parse(snapshot.serverNow)
  return !Number.isFinite(synced)||now.getTime()-synced>=10*60_000||snapshot.serverNow.slice(0,10)!==utcDay(now)
}

export function pruneAlerts(inbox:AlertInbox,now:Date):AlertInbox {
  const cutoff=now.getTime()-ALERT_LIMITS.retentionDays*DAY
  const items=inbox.items.filter(item=>Date.parse(item.createdAt)>=cutoff)
  const receipts=inbox.receipts.filter(receipt=>Date.parse(receipt.createdAt)>=cutoff)
  const pausedOn=inbox.pausedOn&&inbox.pausedOn<utcDay(now)?null:inbox.pausedOn
  return items.length===inbox.items.length&&receipts.length===inbox.receipts.length&&pausedOn===inbox.pausedOn?inbox:{items,receipts,pausedOn}
}

// Receipts survive clearing the inbox, so Read/Clear cannot reset the limits.
export function reconcileAlerts(inbox:AlertInbox,snapshot:Snapshot,now:Date,localHour:number):AlertInbox {
  const stamp=now.toISOString(),today=utcDay(now),retained=pruneAlerts(inbox,now)
  const {items,receipts}=retained
  const synced=Date.parse(snapshot.serverNow)
  if(inbox.pausedOn===today||snapshot.trackingStart>today||snapshot.serverNow.slice(0,10)<today||!Number.isFinite(synced)||synced<now.getTime()-15*60_000)return retained
  const daily=receipts.filter(receipt=>receipt.createdAt.slice(0,10)===today)
  if(daily.length>=ALERT_LIMITS.daily||receipts.filter(receipt=>Date.parse(receipt.createdAt)>now.getTime()-7*DAY).length>=ALERT_LIMITS.weekly)return retained

  const totals=totalsByDay(snapshot.entries),countFor=(day:string)=>{const counts=totals.get(day);return counts?counts.easy+counts.external:0}
  const total=countFor(today),goal=goalFor(snapshot,today),yesterday=shiftDay(today,-1)
  const seen=new Set(receipts.map(receipt=>receipt.id))
  function create(kind:AlertKind,tone:AlertTone,title:string,detail:string,id=`${kind}:${today}`):VigilAlert {
    return {id,kind,tone,day:today,title,detail,createdAt:stamp,readAt:null}
  }
  function achievement():VigilAlert|null {
    let beforeToday=0
    for(const [day,counts] of totals)if(day<today)beforeToday+=counts.easy+counts.external
    const lifetime=beforeToday+total
    const milestones=[100,250,500,1_000,2_500,5_000,10_000,Math.floor(lifetime/10_000)*10_000]
    const crossed=milestones.filter(value=>value>beforeToday&&value<=lifetime).sort((a,b)=>b-a)[0]
    if(crossed&&!seen.has(`milestone:${today}`))return create('milestone','success',`${number(crossed)} applications logged`,`${number(lifetime)} total · ${number(total)} today`)
    const twoDaysAgo=shiftDay(today,-2)
    if(total>0&&total<goal&&!seen.has(`comeback:${today}`)&&snapshot.trackingStart<=twoDaysAgo&&!countFor(yesterday)&&!countFor(twoDaysAgo)&&beforeToday>0){
      return create('comeback','success','Back in motion',`${number(total)} logged today · welcome back`)
    }
    if(total>=Math.ceil(goal/2)&&total<goal&&!seen.has(`halfway:${today}`))return create('halfway','success','Halfway to your daily goal',`${number(total)} of ${number(goal)} logged · ${number(goal-total)} left`)
    return null
  }
  let candidate:VigilAlert|null=null
  if(total>=goal&&!seen.has(`goal:${today}`)){
    let streak=0,cursor=today
    while(cursor>=snapshot.trackingStart&&countFor(cursor)>=goalFor(snapshot,cursor)){streak++;cursor=shiftDay(cursor,-1)}
    // A streak celebration is the day's goal notification, not an extra alert.
    candidate=[3,7,14].includes(streak)||(streak>0&&streak%30===0)
      ?create('streak','success',`${number(streak)}-day goal streak`,`${number(total)} today · ${number(goal)} goal met`,`goal:${today}`)
      :create('goal','success','Daily goal reached',`${number(total)} applications · ${number(goal)} goal`)
  }else if(!daily.length){
    const start=shiftDay(today,-7)
    if(now.getUTCDay()===1&&snapshot.trackingStart<=start){
      let applications=0,met=0
      for(let offset=0;offset<7;offset++){
        const day=shiftDay(start,offset),count=countFor(day)
        applications+=count;if(count>=goalFor(snapshot,day))met++
      }
      candidate=create('weekly',met>=5?'success':'neutral','Your week in review',`${number(applications)} applications · ${met}/7 goals met`)
    }else{
      let previousBest=0
      for(const [day,counts] of totals)if(day<yesterday)previousBest=Math.max(previousBest,counts.easy+counts.external)
      const yesterdayTotal=countFor(yesterday)
      candidate=snapshot.trackingStart<=shiftDay(yesterday,-7)&&previousBest>0&&yesterdayTotal>previousBest
        ?create('record','success','A new personal best yesterday',`${number(yesterdayTotal)} applications · previous best ${number(previousBest)}`)
        :achievement()??create('overview','neutral','Your daily overview',snapshot.trackingStart<=yesterday?`${number(goal)} goal today · ${number(yesterdayTotal)} yesterday`:`${number(goal)} applications today`)
    }
  }else{
    // Keep the final slot available for completion, and avoid refresh-time bursts.
    if(total<goal&&daily.length>=ALERT_LIMITS.daily-1)return retained
    const elapsed=now.getTime()-Math.max(...daily.map(receipt=>Date.parse(receipt.createdAt)))
    if(elapsed<2*HOUR)return retained
    candidate=achievement()
    if(!candidate&&total<goal&&localHour>=18&&localHour<22&&!seen.has(`reminder:${today}`)&&elapsed>=4*HOUR){
      candidate=create('reminder','warning','Daily goal check-in',`${number(total)} of ${number(goal)} logged · ${number(goal-total)} left`)
    }
  }
  if(!candidate||seen.has(candidate.id))return retained
  return {...retained,items:[candidate,...items],receipts:[...receipts,{id:candidate.id,createdAt:stamp}]}
}

export function alertTime(createdAt:string,now:Date):{label:string;absolute:string} {
  const date=new Date(createdAt),minutes=Math.max(0,Math.floor((now.getTime()-date.getTime())/60_000))
  const relative=minutes<1?'just now':minutes<60?`${minutes}m ago`:minutes<1440?`${Math.floor(minutes/60)}h ago`:`${Math.floor(minutes/1440)}d ago`
  const clock=date.toLocaleTimeString('en',{hour:'2-digit',minute:'2-digit',hour12:true})
  const yesterday=new Date(now);yesterday.setDate(yesterday.getDate()-1)
  const prefix=date.toDateString()===now.toDateString()?'':date.toDateString()===yesterday.toDateString()?'Yesterday, ':date.toLocaleDateString('en',{month:'short',day:'numeric'})+', '
  return {label:`${prefix}${clock} · ${relative}`,absolute:date.toLocaleString('en',{dateStyle:'full',timeStyle:'long'})}
}

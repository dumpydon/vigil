import type {Snapshot} from '../../shared/model'

export interface TimePreferences {
  timeZone:string
  clockFormat:'12h'|'24h'
}

export const DEFAULT_TIME_PREFERENCES:Readonly<TimePreferences>=Object.freeze({timeZone:'Asia/Kolkata',clockFormat:'12h'})

export function normalizeTimeZone(value:string):string|null {
  const input=value.trim()
  if(/^(india|ist|asia\/(kolkata|calcutta)|(?:gmt|utc)?\s*\+0?5:30)$/i.test(input))return 'Asia/Kolkata'
  if(/^(utc|gmt)$/i.test(input))return 'UTC'
  try{return new Intl.DateTimeFormat('en-US',{timeZone:input}).resolvedOptions().timeZone}catch{return null}
}

export function readTimePreferences(value:unknown):TimePreferences {
  const saved=value as Partial<TimePreferences>|null
  return {
    timeZone:typeof saved?.timeZone==='string'?normalizeTimeZone(saved.timeZone)??DEFAULT_TIME_PREFERENCES.timeZone:DEFAULT_TIME_PREFERENCES.timeZone,
    clockFormat:saved?.clockFormat==='24h'?'24h':'12h',
  }
}

const date=(value:Date|string)=>typeof value==='string'?new Date(value):value
export function clockTime(value:Date|string,preferences:TimePreferences=DEFAULT_TIME_PREFERENCES):string {
  return new Intl.DateTimeFormat('en-US',{timeZone:preferences.timeZone,hour:preferences.clockFormat==='12h'?'numeric':'2-digit',minute:'2-digit',hourCycle:preferences.clockFormat==='12h'?'h12':'h23'}).format(date(value))
}
export function zonedDay(value:Date|string,timeZone:string):string {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date(value))
  const part=(type:string)=>parts.find(p=>p.type===type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function zonedHour(value:Date|string,timeZone:string):number {
  return Number(new Intl.DateTimeFormat('en-US',{timeZone,hour:'2-digit',hourCycle:'h23'}).format(date(value)))
}
export function zoneLabel(timeZone:string,now:Date|string=new Date()):string {
  if(normalizeTimeZone(timeZone)==='Asia/Kolkata')return 'IST'
  return new Intl.DateTimeFormat('en-US',{timeZone,timeZoneName:'short'}).formatToParts(date(now)).find(p=>p.type==='timeZoneName')!.value
}
export function zoneOffset(timeZone:string,now:Date|string=new Date()):string {
  return new Intl.DateTimeFormat('en-US',{timeZone,timeZoneName:'longOffset'}).formatToParts(date(now)).find(p=>p.type==='timeZoneName')!.value
}
export function timestampLabel(value:Date|string,preferences:TimePreferences=DEFAULT_TIME_PREFERENCES):string {
  const day=new Intl.DateTimeFormat('en-US',{timeZone:preferences.timeZone,year:'numeric',month:'short',day:'numeric'}).format(date(value))
  return `${day}, ${clockTime(value,preferences)} ${zoneLabel(preferences.timeZone,value)} (${zoneOffset(preferences.timeZone,value)})`
}

export function hourClock(hour:number,clockFormat:TimePreferences['clockFormat']):string {
  return clockTime(new Date(Date.UTC(2000,0,1,hour)),{timeZone:'UTC',clockFormat})
}
export function hourlyInZone(snapshot:Snapshot,day:string,timeZone:string){
  const hours=Array<number>(24).fill(0);let backdated=0,otherDates=0
  for(const entry of snapshot.entries)if(!entry.deleted){
    if(zonedDay(entry.loggedAt,timeZone)===day){hours[zonedHour(entry.loggedAt,timeZone)]+=entry.easy+entry.external;if(entry.backdated||entry.date!==day)backdated+=entry.easy+entry.external}
    else if(entry.date===day)otherDates+=entry.easy+entry.external
  }
  return {hours,backdated,otherDates}
}

export function availableTimeZones():string[] {
  const intl=Intl as typeof Intl & {supportedValuesOf?:(key:'timeZone')=>string[]}
  return [...new Set(['Asia/Kolkata','UTC',...(intl.supportedValuesOf?.('timeZone')??['America/New_York','America/Los_Angeles','Europe/London','Asia/Singapore','Asia/Tokyo','Australia/Sydney'])])].sort()
}

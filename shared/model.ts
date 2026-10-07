export const MAX_COUNT = 10_000
export const FIRST_DAY = '1970-01-01'
export const DEFAULT_GOAL = 75
export type Day = string
export interface Entry {
  id: string; date: Day; easy: number; external: number; loggedAt: string
  createdAt: string; updatedAt: string; version: number; deleted: boolean; backdated: boolean
}
export interface Goal { date: Day; value: number }
export interface Snapshot {
  entries: Entry[]; policies: Goal[]; overrides: Goal[]
  trackingStart: Day; revision: number; goalRevision: number; serverNow: string
  acknowledged?: string[]
}
export type Mutation =
  | { id: string; type: 'create'; entry: Pick<Entry, 'id'|'date'|'easy'|'external'|'loggedAt'|'backdated'> }
  | { id: string; type: 'update'; entryId: string; expectedVersion: number; date: Day; easy: number; external: number }
  | { id: string; type: 'delete'; entryId: string; expectedVersion: number }
  | { id: string; type: 'goal'; date: Day; value: number; future: boolean; expectedRevision: number; loggedAt: string }
  | { id: string; type: 'import'; items: BackupItem[]; trackingStart: Day }
export type BackupItem = { kind: 'entry'; entry: Entry } | { kind: 'policy'|'override'; date: Day; value: number }
export interface Backup {
  format: 'vigil-backup'; version: 1; exportedAt: string; trackingStart: Day
  entries: Entry[]; policies: Goal[]; overrides: Goal[]
}
export interface MutationResult {
  revision: number; goalRevision: number; entry?: Entry; snapshot?: Snapshot; imported?: number
}
export interface Daily { date: Day; easy: number; external: number; total: number; goal: number; tracking: boolean }
export class ValidationError extends Error {}

export function utcDay(date: Date = new Date()): Day { return date.toISOString().slice(0, 10) }
export function shiftDay(day: Day, delta: number): Day {
  return utcDay(new Date(Date.parse(`${day}T00:00:00.000Z`) + delta * 86_400_000))
}
export function assertDay(value: unknown, today: Day, allowFuture = false): asserts value is Day {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < FIRST_DAY || (!allowFuture && value > today))
    throw new ValidationError('Choose a valid UTC date from 1970 through today.')
  const time = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(time) || utcDay(new Date(time)) !== value) throw new ValidationError('That calendar date is not valid.')
}
export function assertCount(value: unknown, minimum = 0): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > MAX_COUNT)
    throw new ValidationError(`Use a whole number from ${minimum.toLocaleString()} to 10,000.`)
}
export function parseCount(value: string, minimum = 0): number {
  if (!/^\d+$/.test(value.trim())) throw new ValidationError('Enter a whole number, without signs or decimals.')
  const count = Number(value.trim()); assertCount(count, minimum); return count
}
export function assertUuid(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new ValidationError('A valid operation or entry ID is required.')
}
export function assertIso(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value)
    throw new ValidationError('A valid UTC timestamp is required.')
}
function counts(easy: unknown, external: unknown) {
  assertCount(easy); assertCount(external)
  if (easy + external === 0) throw new ValidationError('Add at least one application.')
}
function positiveVersion(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new ValidationError('A valid entry version is required.')
}
export function validateEntry(input: unknown, today: Day): Entry {
  const e = input as Entry
  if (!e || typeof e !== 'object') throw new ValidationError('Invalid backup entry.')
  assertUuid(e.id); assertDay(e.date,today); counts(e.easy,e.external)
  assertIso(e.loggedAt); assertIso(e.createdAt); assertIso(e.updatedAt); positiveVersion(e.version)
  if (typeof e.deleted !== 'boolean' || typeof e.backdated !== 'boolean') throw new ValidationError('Invalid entry state.')
  return { id:e.id,date:e.date,easy:e.easy,external:e.external,loggedAt:e.loggedAt,createdAt:e.createdAt,updatedAt:e.updatedAt,version:e.version,deleted:e.deleted,backdated:e.backdated }
}
export function validateItem(input: unknown, today: Day): BackupItem {
  const x=input as BackupItem
  if (x?.kind==='entry') return {kind:'entry',entry:validateEntry(x.entry,today)}
  if (x?.kind==='policy'||x?.kind==='override') {
    assertDay(x.date,today,x.kind==='policy'); assertCount(x.value,1)
    if (x.kind==='policy' && x.date>shiftDay(today,1)) throw new ValidationError('A goal policy cannot begin beyond tomorrow.')
    return {kind:x.kind,date:x.date,value:x.value}
  }
  throw new ValidationError('Unknown backup record type.')
}
export function validateMutation(input: unknown, today: Day): Mutation {
  const op=input as Mutation
  if (!op || typeof op!=='object') throw new ValidationError('A mutation is required.')
  assertUuid(op.id)
  switch(op.type) {
    case 'create': {
      const e=op.entry
      if (!e) throw new ValidationError('An entry is required.')
      assertUuid(e.id); assertDay(e.date,today); assertIso(e.loggedAt); counts(e.easy,e.external)
      if (utcDay(new Date(e.loggedAt))>today || typeof e.backdated!=='boolean') throw new ValidationError('Invalid logging timestamp.')
      return {id:op.id,type:op.type,entry:{id:e.id,date:e.date,easy:e.easy,external:e.external,loggedAt:e.loggedAt,backdated:e.backdated}}
    }
    case 'update':
      assertUuid(op.entryId); positiveVersion(op.expectedVersion); assertDay(op.date,today); counts(op.easy,op.external)
      return {id:op.id,type:op.type,entryId:op.entryId,expectedVersion:op.expectedVersion,date:op.date,easy:op.easy,external:op.external}
    case 'delete':
      assertUuid(op.entryId); positiveVersion(op.expectedVersion)
      return {id:op.id,type:op.type,entryId:op.entryId,expectedVersion:op.expectedVersion}
    case 'goal':
      assertDay(op.date,today); assertCount(op.value,1); assertIso(op.loggedAt)
      if (typeof op.future!=='boolean'||!Number.isSafeInteger(op.expectedRevision)||op.expectedRevision<0) throw new ValidationError('Invalid goal version.')
      if(utcDay(new Date(op.loggedAt))>today || (op.future && op.date!==utcDay(new Date(op.loggedAt)))) throw new ValidationError('A historical goal can only change that day.')
      return {id:op.id,type:op.type,date:op.date,value:op.value,future:op.future,expectedRevision:op.expectedRevision,loggedAt:op.loggedAt}
    case 'import':
      assertDay(op.trackingStart,today)
      if (!Array.isArray(op.items)||op.items.length>16) throw new ValidationError('Import up to 16 records per chunk.')
      return {id:op.id,type:op.type,trackingStart:op.trackingStart,items:op.items.map(x=>validateItem(x,today))}
    default: throw new ValidationError('Unknown operation.')
  }
}
export function validateBackup(input: unknown, today: Day): Backup {
  const b=input as Backup
  if (!b||b.format!=='vigil-backup'||b.version!==1) throw new ValidationError('Choose a Vigil version 1 JSON backup.')
  assertDay(b.trackingStart,today); assertIso(b.exportedAt)
  if(!Array.isArray(b.entries)||!Array.isArray(b.policies)||!Array.isArray(b.overrides)||b.entries.length>20_000||b.policies.length+b.overrides.length>5_000)
    throw new ValidationError('Backup exceeds the supported 20,000 entries or 5,000 goal records.')
  const entries=b.entries.map(e=>validateEntry(e,today))
  if(entries.some(e=>e.date<b.trackingStart))throw new ValidationError('Tracking start must be on or before every entry date.')
  if(new Set(entries.map(e=>e.id)).size!==entries.length) throw new ValidationError('Duplicate entry IDs inside this backup.')
  const goals=(xs:Goal[],kind:'policy'|'override')=>{
    const out=xs.map(x=>validateItem({...x,kind},today) as {date:Day;value:number})
    if(new Set(out.map(x=>x.date)).size!==out.length) throw new ValidationError('Duplicate goal dates inside this backup.')
    return out.map(({date,value})=>({date,value}))
  }
  const policies=goals(b.policies,'policy'),overrides=goals(b.overrides,'override')
  if(!policies.some(p=>p.date===FIRST_DAY)) throw new ValidationError('Backup is missing its baseline goal policy.')
  return {format:'vigil-backup',version:1,exportedAt:b.exportedAt,trackingStart:b.trackingStart,entries,policies,overrides}
}
export function goalFor(snapshot: Pick<Snapshot,'policies'|'overrides'>,date:Day): number {
  const override=snapshot.overrides.find(x=>x.date===date)
  if(override) return override.value
  let value=DEFAULT_GOAL,best=''
  for(const p of snapshot.policies) if(p.date<=date && p.date>best){best=p.date;value=p.value}
  return value
}
export function totalsByDay(entries: Entry[]): Map<Day,{easy:number;external:number}> {
  const m=new Map<Day,{easy:number;external:number}>()
  for(const e of entries) if(!e.deleted){const t=m.get(e.date)??{easy:0,external:0};t.easy+=e.easy;t.external+=e.external;m.set(e.date,t)}
  return m
}
export function seriesFor(snapshot:Snapshot,days:number,today:Day):Daily[] {
  const totals=totalsByDay(snapshot.entries)
  return Array.from({length:days},(_,i)=>{
    const date=shiftDay(today,i-days+1),t=totals.get(date)??{easy:0,external:0}
    return {date,...t,total:t.easy+t.external,goal:goalFor(snapshot,date),tracking:date>=snapshot.trackingStart}
  })
}
export function analytics(snapshot:Snapshot,days:number,today:Day) {
  const series=seriesFor(snapshot,days,today),closed=series.filter(x=>x.date<today&&x.tracking)
  const totals=totalsByDay(snapshot.entries)
  const todayTotal=totals.get(today),met=(date:Day)=>{const t=totals.get(date);return (t?t.easy+t.external:0)>=goalFor(snapshot,date)}
  let cursor=met(today)?today:shiftDay(today,-1),streak=0
  while(cursor>=snapshot.trackingStart&&met(cursor)){streak++;cursor=shiftDay(cursor,-1)}
  const total=todayTotal?todayTotal.easy+todayTotal.external:0,goal=goalFor(snapshot,today)
  return {series,total,goal,remaining:Math.max(goal-total,0),fraction:Math.min(total/goal,1),percentage:total/goal*100,
    rangeTotal:series.reduce((n,x)=>n+x.total,0),closedAverage:closed.length?closed.reduce((n,x)=>n+x.total,0)/closed.length:null,streak}
}
export function hourlyFor(snapshot:Snapshot,day:Day) {
  const hours=Array<number>(24).fill(0);let backdated=0,otherDates=0
  for(const e of snapshot.entries) if(!e.deleted){
    if(utcDay(new Date(e.loggedAt))===day){hours[new Date(e.loggedAt).getUTCHours()]+=e.easy+e.external;if(e.backdated||e.date!==day)backdated+=e.easy+e.external}
    else if(e.date===day)otherDates+=e.easy+e.external
  }
  return {hours,backdated,otherDates}
}
export function makeBackup(snapshot:Snapshot,now=new Date()):Backup {
  return {format:'vigil-backup',version:1,exportedAt:now.toISOString(),trackingStart:snapshot.trackingStart,entries:snapshot.entries,policies:snapshot.policies,overrides:snapshot.overrides}
}
export function sameEntry(a:Entry,b:Entry) {return a.id===b.id&&a.date===b.date&&a.easy===b.easy&&a.external===b.external&&a.loggedAt===b.loggedAt&&a.deleted===b.deleted&&a.backdated===b.backdated}
export function importPreview(snapshot:Snapshot,backup:Backup) {
  const entries=new Map(snapshot.entries.map(e=>[e.id,e])),policies=new Map(snapshot.policies.map(g=>[g.date,g.value])),overrides=new Map(snapshot.overrides.map(g=>[g.date,g.value]))
  const items:BackupItem[]=[],conflicts:string[]=[];let duplicates=0
  for(const e of backup.entries){const found=entries.get(e.id);if(!found)items.push({kind:'entry',entry:e});else if(sameEntry(found,e))duplicates++;else conflicts.push(`Entry ${e.id.slice(0,8)} · ${e.date}`)}
  for(const [kind,xs,map] of [['policy',backup.policies,policies],['override',backup.overrides,overrides]] as const)
    for(const g of xs){const value=map.get(g.date);if(value===undefined)items.push({kind,...g});else if(value===g.value)duplicates++;else conflicts.push(`${kind==='policy'?'Default goal':'Daily goal'} · ${g.date}`)}
  return {items,duplicates,conflicts}
}
export function canonical(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`
  if(value&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  return JSON.stringify(value)
}

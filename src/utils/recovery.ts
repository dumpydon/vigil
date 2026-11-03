import {FIRST_DAY,goalFor,importPreview,utcDay,type Backup,type Snapshot} from '../../shared/model'

export function recoveryIdentityCompatible(current:Snapshot|null,source:Backup,sameIdentity:boolean){
  if(sameIdentity||!current?.entries.length)return true
  if(!source.entries.length)return false
  const currentIds=new Set(current.entries.map(entry=>entry.id)),sourceIds=new Set(source.entries.map(entry=>entry.id))
  // A lost credential can leave a cache of the same history behind. Permit a
  // reviewed reconnect when one retained ID set extends the other, never an
  // unrelated or diverging workspace merely because its totals look alike.
  return current.entries.every(entry=>sourceIds.has(entry.id))||source.entries.every(entry=>currentIds.has(entry.id))
}

export function recoveryPreview(current:Snapshot|null,source:Backup,today=utcDay()){
  const snapshot=current??{entries:[],policies:[{date:FIRST_DAY,value:75}],overrides:[],trackingStart:today,revision:0,goalRevision:0,serverNow:new Date().toISOString()}
  // Merge older goals only before the current history begins. Retain a policy
  // boundary so importing an older workspace cannot change the current goal.
  const boundary=snapshot.trackingStart
  const extendsHistory=source.trackingStart<boundary
  const defaults={policies:snapshot.policies,overrides:[]}
  const policies=extendsHistory?[...source.policies.filter(p=>p.date<boundary),{date:boundary,value:goalFor(defaults,boundary)}]:[]
  if(!policies.some(p=>p.date===FIRST_DAY))policies.unshift({date:FIRST_DAY,value:goalFor(defaults,FIRST_DAY)})
  const backup={...source,policies,overrides:extendsHistory?source.overrides.filter(p=>p.date<boundary):[]}
  return {backup,preview:importPreview(snapshot,backup),currentTotal:snapshot.entries.filter(e=>!e.deleted).reduce((n,e)=>n+e.easy+e.external,0)}
}

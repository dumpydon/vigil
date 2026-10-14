import {planDayAdjustment,shiftDay,utcDay,type Mutation,type Snapshot} from '../../shared/model'
import type {QueueRecord} from './store'

export const replaceGoal=(goals:Snapshot['policies'],date:string,value:number)=>[...goals.filter(g=>g.date!==date),{date,value}].sort((a,b)=>a.date.localeCompare(b.date))

export function project(base:Snapshot,queue:QueueRecord[]):Snapshot {
  const entries=new Map(base.entries.map(e=>[e.id,{...e}]))
  let policies=[...base.policies],overrides=[...base.overrides],goalRevision=base.goalRevision,trackingStart=base.trackingStart
  for(const {operation:op,status} of queue){
    if(status==='invalid')continue
    if(op.type==='create'){
      if(!entries.has(op.entry.id))entries.set(op.entry.id,{...op.entry,createdAt:op.entry.loggedAt,updatedAt:op.entry.loggedAt,version:1,deleted:false})
      trackingStart=trackingStart<op.entry.date?trackingStart:op.entry.date
    }else if(op.type==='update'){
      const current=entries.get(op.entryId)
      if(current)entries.set(op.entryId,{...current,date:op.date,easy:op.easy,external:op.external,version:op.expectedVersion+1,backdated:utcDay(new Date(current.loggedAt))!==op.date})
      trackingStart=trackingStart<op.date?trackingStart:op.date
    }else if(op.type==='delete'){
      const current=entries.get(op.entryId);if(current)entries.set(op.entryId,{...current,deleted:true,version:op.expectedVersion+1})
    }else if(op.type==='day'){
      const plan=planDayAdjustment(op)
      for(const change of plan.changes){const e=entries.get(change.id);if(e)entries.set(e.id,{...e,...change,updatedAt:op.loggedAt})}
      if(plan.addition&&!entries.has(plan.addition.id))entries.set(plan.addition.id,plan.addition)
      trackingStart=trackingStart<op.date?trackingStart:op.date
    }else if(op.type==='goal'){
      overrides=replaceGoal(overrides,op.date,op.value)
      if(op.future)policies=replaceGoal(policies,shiftDay(op.date,1),op.value)
      goalRevision++
    }else{
      for(const item of op.items){
        if(item.kind==='entry'&&!entries.has(item.entry.id))entries.set(item.entry.id,item.entry)
        else if(item.kind==='policy'&&!policies.some(g=>g.date===item.date))policies.push({date:item.date,value:item.value})
        else if(item.kind==='override'&&!overrides.some(g=>g.date===item.date))overrides.push({date:item.date,value:item.value})
      }
      goalRevision++;trackingStart=trackingStart<op.trackingStart?trackingStart:op.trackingStart
    }
  }
  return {...base,entries:[...entries.values()],policies,overrides,goalRevision,trackingStart}
}
export function endpoint(op:Mutation):{url:string;method:string}{
  switch(op.type){case 'create':return {url:'/api/entries',method:'POST'};case 'update':return {url:`/api/entries/${op.entryId}`,method:'PATCH'};case 'delete':return {url:`/api/entries/${op.entryId}`,method:'DELETE'};case 'day':return {url:`/api/days/${op.date}`,method:'PUT'};case 'goal':return {url:`/api/goals/${op.date}`,method:'PUT'};case 'import':return {url:'/api/import',method:'POST'}}
}

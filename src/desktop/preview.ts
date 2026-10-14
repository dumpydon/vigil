import {FIRST_DAY,utcDay,shiftDay,type Snapshot,type Mutation} from '../../shared/model'
import {project} from '../data/operations'

// Isolated, synthetic browser preview. It never reads or writes the live workspace.
export function previewFetcher():typeof fetch{
  const today=utcDay(),now=new Date().toISOString()
  let snapshot:Snapshot={entries:[],policies:[{date:FIRST_DAY,value:75}],overrides:[],trackingStart:shiftDay(today,-29),revision:1,goalRevision:0,serverNow:now}
  let applied=new Set<string>()
  for(let i=29;i>=0;i--){
    const date=shiftDay(today,-i),easy=i===0?26:Math.floor(16+(Math.sin(i*1.6)+1)*26),external=i===0?12:Math.floor(5+(Math.cos(i*.9)+1)*12)
    snapshot.entries.push({id:crypto.randomUUID(),date,easy,external,loggedAt:`${date}T10:00:00.000Z`,createdAt:now,updatedAt:now,version:1,backdated:false,deleted:false})
  }
  const key='apply-vigil-synthetic-server.v1'
  function reload(){try{const saved=localStorage.getItem(key);if(saved){const data=JSON.parse(saved) as {snapshot:Snapshot;applied:string[]};snapshot=data.snapshot;applied=new Set(data.applied)}}catch{/* A demo can still run in memory if storage is blocked. */}}
  function persist(){try{localStorage.setItem(key,JSON.stringify({snapshot,applied:[...applied]}))}catch{/* The preview does not need a server. */}}
  reload();persist()
  return async(input,init)=>{
    reload()
    const path=String(input),method=init?.method??'GET'
    if(method!=='GET'&&path!=='/api/login'&&path!=='/api/logout'){
      const op=JSON.parse(String(init?.body)) as Mutation
      if(!applied.has(op.id)){snapshot={...project(snapshot,[{operation:op,sequence:1,status:'pending'}]),revision:snapshot.revision+1,serverNow:new Date().toISOString()};applied.add(op.id)}
      persist()
      return new Response(JSON.stringify({revision:snapshot.revision,goalRevision:snapshot.goalRevision,entries:snapshot.entries}),{status:200})
    }
    return new Response(JSON.stringify(path.startsWith('/api/snapshot')?{...snapshot,acknowledged:[...applied],serverNow:new Date().toISOString()}:{authenticated:true}),{status:200})
  }
}

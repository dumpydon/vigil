import {openDB,type DBSchema} from 'idb'
import {canonical,DEFAULT_GOAL,FIRST_DAY,utcDay,validateMutation,ValidationError,type Mutation,type MutationResult,type Snapshot} from '../../shared/model'
import {endpoint,project} from './operations'

interface DeviceRecords extends DBSchema {
  meta:{key:string;value:Snapshot}
  receipts:{key:string;value:{request:string;result:MutationResult}}
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})

// Implements the shared engine's request contract entirely in IndexedDB. This
// adapter never calls fetch, creates a session, or reads the owner's workspace.
export class LocalWorkspace {
  private db
  constructor(name='apply-vigil-device-records-v1',private clock:()=>Date=()=>new Date()){
    this.db=openDB<DeviceRecords>(name,1,{upgrade(db){db.createObjectStore('meta');db.createObjectStore('receipts')}})
  }
  fetcher:typeof fetch=async(input,init={})=>{
    const path=String(input),method=init.method??'GET'
    if(!path.startsWith('/api/'))return json({error:'Only local workspace operations are available.'},403)
    if(path==='/api/login'||path==='/api/logout')return json({error:'This local workspace does not need an account.'},400)
    const now=this.clock(),today=utcDay(now),db=await this.db
    const tx=db.transaction(['meta','receipts'],'readwrite')
    const stored=await tx.objectStore('meta').get('snapshot')
    const snapshot:Snapshot=stored??{entries:[],policies:[{date:FIRST_DAY,value:DEFAULT_GOAL}],overrides:[],trackingStart:today,revision:0,goalRevision:0,serverNow:now.toISOString()}
    if(!stored)await tx.objectStore('meta').put(snapshot,'snapshot')
    if(method==='GET'&&path.split('?')[0]==='/api/snapshot'){
      const pending=new URLSearchParams(path.split('?')[1]??'').get('pending')?.split(',').slice(0,128)??[]
      const acknowledged:string[]=[]
      for(const id of pending)if(await tx.objectStore('receipts').get(id))acknowledged.push(id)
      await tx.done
      return json({...snapshot,serverNow:now.toISOString(),acknowledged})
    }
    let operation:Mutation
    try{operation=validateMutation(JSON.parse(String(init.body)),today)}catch(error){await tx.done;return json({error:error instanceof ValidationError?error.message:'This local operation is invalid.'},400)}
    const target=endpoint(operation)
    if(target.url!==path||target.method!==method){await tx.done;return json({error:'This local operation does not match its route.'},400)}
    const request=canonical(operation),receipt=await tx.objectStore('receipts').get(operation.id)
    if(receipt){await tx.done;return receipt.request===request?json(receipt.result):json({error:'This operation ID was already used with different data.',code:'IDEMPOTENCY_MISMATCH'},409)}
    const entry='entryId'in operation?snapshot.entries.find(e=>e.id===operation.entryId):undefined
    let changed=false
    if(operation.type==='update'||operation.type==='delete')changed=!entry||entry.deleted||entry.version!==operation.expectedVersion
    if(operation.type==='goal')changed=snapshot.goalRevision!==operation.expectedRevision
    if(operation.type==='create')changed=snapshot.entries.some(e=>e.id===operation.entry.id)
    if(operation.type==='day'){
      const entries=snapshot.entries.filter(e=>!e.deleted&&e.date===operation.date)
      changed=entries.length!==operation.expected.length||operation.expected.some(e=>!entries.some(current=>current.id===e.id&&current.version===e.version&&current.easy===e.easy&&current.external===e.external))
    }
    if(changed){await tx.done;return json({error:'This record changed in another window. Review the saved value before continuing.',code:'CONFLICT',snapshot,entry:entry??null},409)}
    const next={...project(snapshot,[{operation,sequence:1,status:'pending'}]),revision:snapshot.revision+1,serverNow:now.toISOString()}
    if(operation.type==='update'||operation.type==='delete')next.entries=next.entries.map(e=>e.id===operation.entryId?{...e,updatedAt:now.toISOString()}:e)
    const result:MutationResult={revision:next.revision,goalRevision:next.goalRevision}
    if(operation.type==='create')result.entry=next.entries.find(e=>e.id===operation.entry.id)
    else if(operation.type==='update'||operation.type==='delete')result.entry=next.entries.find(e=>e.id===operation.entryId)
    else if(operation.type==='day')result.entries=next.entries.filter(e=>e.date===operation.date)
    else if(operation.type==='import')result.imported=operation.items.length
    await tx.objectStore('meta').put(next,'snapshot')
    await tx.objectStore('receipts').put({request,result},operation.id)
    await tx.done
    return json(result)
  }
  async close(){(await this.db).close()}
}

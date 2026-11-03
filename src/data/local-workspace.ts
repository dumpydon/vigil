import {openDB,type DBSchema} from 'idb'
import {canonical,DEFAULT_GOAL,FIRST_DAY,makeBackup,utcDay,validateBackup,validateMutation,ValidationError,type Backup,type Mutation,type MutationResult,type Snapshot} from '../../shared/model'
import {endpoint,project} from './operations'
import {historyMissingFrom,validateHistoryImage,type LocalHistoryImage,type LocalHistorySafety} from './history-protection'
import {recoveryPreview} from '../utils/recovery'

interface DeviceRecords extends DBSchema {
  meta:{key:string;value:Snapshot}
  receipts:{key:string;value:{request:string;result:MutationResult}}
}
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}})

// Implements the shared engine's request contract entirely in IndexedDB. This
// adapter never calls fetch, creates a session, or reads the owner's workspace.
export class LocalWorkspace {
  private db
  private boot:Promise<void>|null=null
  private protectedImage:LocalHistoryImage|null=null
  constructor(name='apply-vigil-device-records-v1',private clock:()=>Date=()=>new Date(),private safety?:LocalHistorySafety){
    this.db=openDB<DeviceRecords>(name,1,{upgrade(db){db.createObjectStore('meta');db.createObjectStore('receipts')}})
  }
  private async initialize(){
    if(this.boot)return this.boot
    this.boot=this.recoverPrimary().catch(error=>{this.boot=null;throw error})
    return this.boot
  }
  private async recoverPrimary(){
    if(!this.safety)return
    const db=await this.db,stored=await db.get('meta','snapshot'),saved=await this.safety.load()
    const image=saved.image?validateHistoryImage(saved.image,utcDay(this.clock())):null
    this.protectedImage=image
    let valid=!!stored
    if(stored){try{validateHistoryImage({snapshot:stored,receipts:[]},utcDay(this.clock()))}catch{valid=false}}
    if(!image&&saved.needsHistoryChoice&&(!stored||valid&&stored.entries.length===0&&stored.revision===0))throw new Error('History protection: another history was detected. Review it before starting a separate empty history.')
    if((!stored||!valid)&&!image){
      if(stored||saved.needsHistoryChoice)throw new Error('History protection: another history or a damaged store was detected. Open History protection to recover it or explicitly start a separate history.')
      return
    }
    if(!image)return
    const missing=stored&&valid?historyMissingFrom(stored,image.snapshot):true
    const rolledBack=stored&&valid&&stored.revision<image.snapshot.revision
    if(!missing&&!rolledBack)return
    // Never overwrite new records with an older backup. An incompatible split
    // needs the normal reviewed, missing-ID merge instead of an automatic reset.
    if(stored&&valid&&historyMissingFrom(image.snapshot,stored))throw new Error('History protection: this store and its safety copy differ. Both are retained; review them in History protection.')
    const tx=db.transaction(['meta','receipts'],'readwrite')
    await tx.objectStore('meta').put(image.snapshot,'snapshot')
    for(const receipt of image.receipts)await tx.objectStore('receipts').put({request:receipt.request,result:receipt.result},receipt.id)
    await tx.done
    await this.safety.recovered?.('Your local history was recovered from its independent safety copy. Review the restored dates in History protection. Existing backup versions have been retained.')
  }
  private async protect(){
    if(!this.safety)return
    const db=await this.db,tx=db.transaction(['meta','receipts'],'readonly')
    const snapshot=await tx.objectStore('meta').get('snapshot'),keys=await tx.objectStore('receipts').getAllKeys(),values=await tx.objectStore('receipts').getAll()
    await tx.done
    if(snapshot){
      const image={snapshot,receipts:values.map((value,index)=>({id:keys[index],...value}))}
      await this.safety.save(image)
      if(!this.protectedImage||image.snapshot.revision>=this.protectedImage.snapshot.revision)this.protectedImage=image
    }
  }
  private async recover(backup:Backup,minimumRevision=0){
    if(!Number.isSafeInteger(minimumRevision)||minimumRevision<0||minimumRevision>=Number.MAX_SAFE_INTEGER)throw new ValidationError('Invalid cloud recovery revision.')
    const now=this.clock(),today=utcDay(now),source=validateBackup(backup,today),db=await this.db,saved=await this.safety?.load()
    const image=saved?.image?validateHistoryImage(saved.image,today):null
    const tx=db.transaction(['meta','receipts'],'readwrite'),stored=await tx.objectStore('meta').get('snapshot')
    let valid=!!stored
    if(stored){try{validateHistoryImage({snapshot:stored,receipts:[]},today)}catch{valid=false}}
    let next:Snapshot=stored&&valid?stored:image?.snapshot??{entries:[],policies:[{date:FIRST_DAY,value:DEFAULT_GOAL}],overrides:[],trackingStart:today,revision:0,goalRevision:0,serverNow:now.toISOString()}
    const empty=next.entries.length===0&&next.revision===0
    if(empty){
      // A fresh restore takes the complete historical goals, including the
      // current goal. Reviewed merges into an existing history retain its goals.
      next={...next,policies:source.policies,overrides:source.overrides,trackingStart:source.trackingStart}
    }
    const sources=image?[makeBackup(image.snapshot,now),source]:[source]
    for(const candidate of sources){
      const {backup:prepared,preview}=recoveryPreview(next,candidate,today)
      for(let index=0;index<Math.max(1,preview.items.length);index+=16){
        const operation=validateMutation({id:crypto.randomUUID(),type:'import',items:preview.items.slice(index,index+16),trackingStart:prepared.trackingStart},today)
        next={...project(next,[{operation,sequence:1,status:'pending'}]),revision:next.revision+1,serverNow:now.toISOString()}
        await tx.objectStore('receipts').put({request:canonical(operation),result:{revision:next.revision,goalRevision:next.goalRevision}},operation.id)
      }
    }
    if(minimumRevision>0)next={...next,revision:Math.max(next.revision,minimumRevision+1)}
    if(stored&&!valid)await tx.objectStore('meta').put(stored,'damaged-snapshot-before-recovery')
    await tx.objectStore('meta').put(next,'snapshot');await tx.done
    this.boot=Promise.resolve();await this.protect()
    return json({recovered:true})
  }
  fetcher:typeof fetch=async(input,init={})=>{
    const path=String(input),method=init.method??'GET'
    if(!path.startsWith('/api/'))return json({error:'Only local workspace operations are available.'},403)
    if(path==='/api/login'||path==='/api/logout')return json({error:'This local workspace does not need an account.'},400)
    if(path==='/api/local/recover'&&method==='POST'){
      const value=JSON.parse(String(init.body)) as Backup|{backup:Backup;minimumRevision:number}
      return 'backup'in value?this.recover(value.backup,value.minimumRevision):this.recover(value)
    }
    await this.initialize()
    const now=this.clock(),today=utcDay(now),db=await this.db
    if(this.safety&&this.protectedImage){
      const current=await db.get('meta','snapshot')
      let healthy=!!current
      if(current){try{validateHistoryImage({snapshot:current,receipts:[]},today)}catch{healthy=false}}
      if(!healthy||current&&historyMissingFrom(current,this.protectedImage.snapshot)||current&&current.revision<this.protectedImage.snapshot.revision)await this.recoverPrimary()
    }
    const tx=db.transaction(['meta','receipts'],'readwrite')
    const stored=await tx.objectStore('meta').get('snapshot')
    const snapshot:Snapshot=stored??{entries:[],policies:[{date:FIRST_DAY,value:DEFAULT_GOAL}],overrides:[],trackingStart:today,revision:0,goalRevision:0,serverNow:now.toISOString()}
    if(!stored)await tx.objectStore('meta').put(snapshot,'snapshot')
    if(method==='GET'&&path.split('?')[0]==='/api/snapshot'){
      const pending=new URLSearchParams(path.split('?')[1]??'').get('pending')?.split(',').slice(0,128)??[]
      const acknowledged:string[]=[]
      for(const id of pending)if(await tx.objectStore('receipts').get(id))acknowledged.push(id)
      await tx.done
      await this.protect()
      return json({...snapshot,serverNow:now.toISOString(),acknowledged})
    }
    let operation:Mutation
    try{operation=validateMutation(JSON.parse(String(init.body)),today)}catch(error){await tx.done;return json({error:error instanceof ValidationError?error.message:'This local operation is invalid.'},400)}
    const target=endpoint(operation)
    if(target.url!==path||target.method!==method){await tx.done;return json({error:'This local operation does not match its route.'},400)}
    const request=canonical(operation),receipt=await tx.objectStore('receipts').get(operation.id)
    if(receipt){await tx.done;if(receipt.request===request)await this.protect();return receipt.request===request?json(receipt.result):json({error:'This operation ID was already used with different data.',code:'IDEMPOTENCY_MISMATCH'},409)}
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
    await this.protect()
    return json(result)
  }
  async close(){(await this.db).close()}
}

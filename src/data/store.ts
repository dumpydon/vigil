import { openDB, type IDBPDatabase, type DBSchema } from 'idb'
import { DEFAULT_GOAL, FIRST_DAY, goalFor, planDayAdjustment, shiftDay, utcDay, validateMutation, type DayEntry, type Entry, type Mutation, type MutationResult, type Snapshot } from '../../shared/model'

export type QueueRecord={operation:Mutation;sequence:number;status:'pending'|'inflight'|'conflict'|'invalid';error?:string;cloudEntry?:Entry|null;cloudGoal?:number}
type Lease={owner:string;until:number}
interface LocalDB extends DBSchema {
  meta:{key:string;value:unknown}
  queue:{key:string;value:QueueRecord;indexes:{sequence:number}}
}
export type SyncStatus='loading'|'saving'|'saved'|'offline'|'retry'|'auth'
export interface AppState {
  snapshot:Snapshot|null;queue:QueueRecord[];status:SyncStatus;error:string|null;initialized:boolean;draft:unknown
}
type Options={name?:string;clock?:()=>Date;fetcher?:typeof fetch;online?:()=>boolean;broadcast?:boolean;autoRetry?:boolean}
const replaceGoal=(goals:Snapshot['policies'],date:string,value:number)=>[...goals.filter(g=>g.date!==date),{date,value}].sort((a,b)=>a.date.localeCompare(b.date))

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

export class SyncEngine {
  private db:IDBPDatabase<LocalDB>|null=null
  private listeners=new Set<()=>void>()
  private channel:BroadcastChannel|null=null
  private state:AppState={snapshot:null,queue:[],status:'loading',error:null,initialized:false,draft:null}
  private base:Snapshot|null=null
  private running:Promise<void>|null=null
  private retryTimer:ReturnType<typeof setTimeout>|null=null
  private backoff=1_000
  private instance=crypto.randomUUID()
  private refreshSequence=0
  private initPromise:Promise<void>|null=null
  private options:Required<Options>
  constructor(options:Options={}){
    this.options={name:options.name??'vigil-personal',clock:options.clock??(()=>new Date()),fetcher:options.fetcher??fetch.bind(globalThis),online:options.online??(()=>typeof navigator==='undefined'||navigator.onLine),broadcast:options.broadcast??true,autoRetry:options.autoRetry??true}
  }
  getState=()=>this.state
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn)}}
  private emit(patch:Partial<AppState>={}){this.state={...this.state,...patch};for(const fn of this.listeners)fn()}
  private broadcast(){this.channel?.postMessage({source:this.instance})}
  async init(sync=true):Promise<void>{
    if(this.initPromise)return this.initPromise
    this.initPromise=(async()=>{
      try{
        this.db=await openDB<LocalDB>(this.options.name,1,{upgrade(db){db.createObjectStore('meta');const queue=db.createObjectStore('queue',{keyPath:'operation.id'});queue.createIndex('sequence','sequence')},blocked:()=>this.emit({error:'Close older Vigil tabs to finish the local storage update.'})})
        await this.reloadLocal();this.emit({initialized:true,status:this.state.queue.length?'offline':'loading'})
        if(this.options.broadcast&&typeof BroadcastChannel!=='undefined'){
          this.channel=new BroadcastChannel(`${this.options.name}:changes`)
          this.channel.onmessage=()=>{void this.reloadLocal().then(()=>this.sync())}
        }
        if(typeof window!=='undefined'&&sync){
          window.addEventListener('online',this.wake);window.addEventListener('offline',this.wentOffline)
          window.addEventListener('focus',this.wake);document.addEventListener('visibilitychange',this.visibility)
        }
        if(sync)await this.sync()
      }catch{this.emit({initialized:true,status:'retry',error:'Local storage is unavailable. Logging is disabled until your browser can retain entries.'})}
    })()
    return this.initPromise
  }
  private wake=()=>{void this.sync()}
  private wentOffline=()=>this.emit({status:'offline'})
  private visibility=()=>{if(document.visibilityState==='visible')this.wake()}
  private async reloadLocal(){
    if(!this.db)return
    const tx=this.db.transaction(['meta','queue'],'readonly')
    const [base,queue,draft]=await Promise.all([tx.objectStore('meta').get('snapshot'),tx.objectStore('queue').index('sequence').getAll(),tx.objectStore('meta').get('draft')]);await tx.done
    this.base=(base as Snapshot|undefined)??null
    this.emit({snapshot:this.base?project(this.base,queue):null,queue,draft:draft??null})
  }
  private async request(url:string,init:RequestInit={}):Promise<Response>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15_000)
    try{return await this.options.fetcher(url,{...init,credentials:'same-origin',cache:'no-store',signal:controller.signal,headers:{...init.headers,'Content-Type':'application/json'}})}finally{clearTimeout(timer)}
  }
  async login(password:string){
    const response=await this.request('/api/login',{method:'POST',body:JSON.stringify({id:crypto.randomUUID(),password})})
    const body=await response.json() as {error?:string}
    if(!response.ok)throw new Error(body.error??'Sign-in failed.')
    this.emit({status:'saving',error:null});await this.sync();if(this.getState().status==='auth')await this.sync()
  }
  async logout(){
    await this.reloadLocal()
    if(this.state.queue.length)throw new Error('Sync your pending changes before signing out. They remain on this device.')
    const r=await this.request('/api/logout',{method:'POST',body:JSON.stringify({id:crypto.randomUUID()})})
    if(!r.ok)throw new Error('Sign-out could not be confirmed. Try again online.')
    this.emit({status:'auth',error:null});this.broadcast()
  }
  async refresh(){
    if(!this.db)return
    const sequence=++this.refreshSequence
    const pending=this.state.queue.slice(0,128).map(q=>q.operation.id)
    const r=await this.request(`/api/snapshot${pending.length?'?pending='+pending.join(','):''}`)
    if(r.status===401){this.emit({status:'auth',error:null});return}
    if(!r.ok)throw new Error('Cloud data is unavailable. Retry when the connection returns.')
    const incoming=await r.json() as Snapshot
    if(sequence!==this.refreshSequence)return
    const tx=this.db.transaction(['meta','queue'],'readwrite'),old=await tx.objectStore('meta').get('snapshot') as Snapshot|undefined
    if(!old||incoming.revision>=old.revision){
      await tx.objectStore('meta').put(incoming,'snapshot')
      for(const id of incoming.acknowledged??[])await tx.objectStore('queue').delete(id)
    }
    await tx.done;await this.reloadLocal()
  }
  async enqueue(build:(snapshot:Snapshot)=>Mutation|null):Promise<Mutation|null>{
    if(!this.db)throw new Error('Local storage is not ready. Nothing was added.')
    const tx=this.db.transaction(['meta','queue'],'readwrite')
    try{
      const base=await tx.objectStore('meta').get('snapshot') as Snapshot|undefined
      if(!base)throw new Error('Sign in and load your workspace once before logging offline.')
      const queue=await tx.objectStore('queue').index('sequence').getAll(),view=project(base,queue)
      const op=build(view)
      if(!op){await tx.done;return null}
      validateMutation(op,utcDay(this.options.clock()))
      const next=Number(await tx.objectStore('meta').get('sequence')??0)+1
      await tx.objectStore('meta').put(next,'sequence')
      await tx.objectStore('queue').add({operation:op,sequence:next,status:'pending'})
      await tx.done
      await this.reloadLocal();this.emit({status:this.options.online()?'saving':'offline',error:null});this.broadcast();void this.sync()
      return op
    }catch(error){try{tx.abort()}catch{/* Already finished. */}await tx.done.catch(()=>{});throw new Error(error instanceof Error?error.message:'The entry could not be retained. Nothing was added.')}
  }
  async createEntry(easy:number,external:number,date?:string){
    const now=this.options.clock(),assigned=date??utcDay(now)
    return this.enqueue(()=>({id:crypto.randomUUID(),type:'create',entry:{id:crypto.randomUUID(),easy,external,date:assigned,loggedAt:now.toISOString(),backdated:assigned!==utcDay(now)}}))
  }
  async updateEntry(id:string,easy:number,external:number,date:string,expectedVersion?:number){
    return this.enqueue(s=>{
      const entry=s.entries.find(e=>e.id===id&&!e.deleted)
      if(!entry)throw new Error('This entry is no longer active. Reload its cloud value.')
      return {id:crypto.randomUUID(),type:'update',entryId:id,expectedVersion:expectedVersion??entry.version,date,easy,external}
    })
  }
  async deleteEntry(id:string,expectedVersion?:number){
    return this.enqueue(s=>{
      const entry=s.entries.find(e=>e.id===id&&!e.deleted);if(!entry)return null
      return {id:crypto.randomUUID(),type:'delete',entryId:id,expectedVersion:expectedVersion??entry.version}
    })
  }
  async adjustDay(date:string,easy:number,external:number,expected:DayEntry[]){
    const now=this.options.clock()
    return this.enqueue(s=>{
      const current=s.entries.filter(e=>e.date===date&&!e.deleted)
      if(current.length!==expected.length||expected.some(e=>!current.some(c=>c.id===e.id&&c.version===e.version&&c.easy===e.easy&&c.external===e.external)))throw new Error('This day changed while you were reviewing it. Reopen its counts and confirm again.')
      const before=current.reduce((sum,e)=>({easy:sum.easy+e.easy,external:sum.external+e.external}),{easy:0,external:0})
      if(before.easy===easy&&before.external===external)return null
      return {id:crypto.randomUUID(),type:'day',date,easy,external,expected,additionId:crypto.randomUUID(),loggedAt:now.toISOString()}
    })
  }
  async setGoal(date:string,value:number,future:boolean,expectedRevision?:number){
    const now=this.options.clock()
    return this.enqueue(s=>({id:crypto.randomUUID(),type:'goal',date,value,future,expectedRevision:expectedRevision??s.goalRevision,loggedAt:now.toISOString()}))
  }
  async saveDraft(draft:unknown){
    if(!this.db)return
    await this.db.put('meta',draft,'draft');this.emit({draft})
  }
  async clearDraft(){if(this.db){await this.db.delete('meta','draft');this.emit({draft:null})}}
  private async acquireLease(){
    if(!this.db)return false
    const tx=this.db.transaction('meta','readwrite'),lease=await tx.store.get('lease') as Lease|undefined,now=Date.now()
    if(lease&&lease.owner!==this.instance&&lease.until>now){await tx.done;return false}
    await tx.store.put({owner:this.instance,until:now+30_000},'lease');await tx.done;return true
  }
  private async releaseLease(){
    if(!this.db)return
    const tx=this.db.transaction('meta','readwrite'),lease=await tx.store.get('lease') as Lease|undefined
    if(lease?.owner===this.instance)await tx.store.delete('lease');await tx.done
  }
  private async nextOperation():Promise<QueueRecord|null>{
    if(!this.db)return null
    const tx=this.db.transaction(['queue','meta'],'readwrite'),queue=await tx.objectStore('queue').index('sequence').getAll()
    // A conflict blocks later mutations until the owner explicitly resolves it.
    const next=queue[0]
    if(!next||next.status==='conflict'||next.status==='invalid'){await tx.done;return null}
    next.status='inflight';await tx.objectStore('queue').put(next)
    await tx.objectStore('meta').put({owner:this.instance,until:Date.now()+30_000},'lease');await tx.done
    return next
  }
  private async acknowledge(record:QueueRecord,result:MutationResult){
    if(!this.db)return
    const tx=this.db.transaction(['meta','queue'],'readwrite'),stored=await tx.objectStore('meta').get('snapshot') as Snapshot|undefined
    if(stored){
      const op=record.operation,s={...stored,entries:[...stored.entries],policies:[...stored.policies],overrides:[...stored.overrides]}
      for(const entry of result.entries??(result.entry?[result.entry]:[])){const old=s.entries.find(e=>e.id===entry.id);if(!old||old.version<=entry.version)s.entries=[...s.entries.filter(e=>e.id!==entry.id),entry]}
      if(result.revision>=s.revision){
        if(op.type==='goal'){s.overrides=replaceGoal(s.overrides,op.date,op.value);if(op.future)s.policies=replaceGoal(s.policies,shiftDay(op.date,1),op.value)}
        if(op.type==='import'){
          for(const item of op.items){if(item.kind==='entry'&&!s.entries.some(e=>e.id===item.entry.id))s.entries.push(item.entry);else if(item.kind==='policy'&&!s.policies.some(g=>g.date===item.date))s.policies.push({date:item.date,value:item.value});else if(item.kind==='override'&&!s.overrides.some(g=>g.date===item.date))s.overrides.push({date:item.date,value:item.value})}
          s.trackingStart=s.trackingStart<op.trackingStart?s.trackingStart:op.trackingStart
        }
        if(op.type==='day')s.trackingStart=s.trackingStart<op.date?s.trackingStart:op.date
        if(op.type==='create')s.trackingStart=s.trackingStart<op.entry.date?s.trackingStart:op.entry.date
        if(op.type==='update')s.trackingStart=s.trackingStart<op.date?s.trackingStart:op.date
        s.revision=result.revision;s.goalRevision=result.goalRevision
      }
      await tx.objectStore('meta').put(s,'snapshot')
    }
    await tx.objectStore('queue').delete(record.operation.id);await tx.done;await this.reloadLocal();this.broadcast()
  }
  private schedule(delay=this.backoff){
    if(!this.options.autoRetry||this.retryTimer)return
    this.retryTimer=setTimeout(()=>{this.retryTimer=null;void this.sync()},delay)
  }
  async sync():Promise<void>{
    if(this.running)return this.running
    if(!this.db)return
    if(!this.options.online()){this.emit({status:'offline'});return}
    this.running=this.runSync().finally(()=>{this.running=null})
    return this.running
  }
  private async runSync(){
    let lease=false
    try{
      await this.reloadLocal()
      if(!await this.acquireLease()){this.schedule(1_000);return}
      lease=true;this.emit({status:this.state.queue.length?'saving':this.state.status,error:null})
      // Authenticate and reconcile committed-but-unacknowledged IDs before replaying the queue.
      await this.refresh();if(this.state.status==='auth')return
      while(this.options.online()){
        const next=await this.nextOperation();if(!next)break
        const {url,method}=endpoint(next.operation)
        const r=await this.request(url,{method,body:JSON.stringify(next.operation)})
        const data=await r.json() as MutationResult&{error?:string;code?:string;entry?:Entry|null;snapshot?:Snapshot}
        if(r.status===401){this.emit({status:'auth',error:null});return}
        if(!r.ok){
          if((r.status===409||r.status===400)&&this.db){
            const tx=this.db.transaction(['queue','meta'],'readwrite'),current=await tx.objectStore('queue').get(next.operation.id)
            if(current)await tx.objectStore('queue').put({...current,status:r.status===409?'conflict':'invalid',error:data.error??'Review this pending change.',cloudEntry:data.entry,cloudGoal:current.operation.type==='goal'&&data.snapshot?goalFor(data.snapshot,current.operation.date):undefined})
            const old=await tx.objectStore('meta').get('snapshot') as Snapshot|undefined
            if(data.snapshot&&(!old||data.snapshot.revision>=old.revision))await tx.objectStore('meta').put(data.snapshot,'snapshot')
            await tx.done;await this.reloadLocal();this.emit({status:'retry',error:data.error??'Review your pending change.'});this.broadcast();return
          }
          throw new Error(data.error??'The cloud did not acknowledge this change.')
        }
        await this.acknowledge(next,data)
      }
      await this.refresh();await this.reloadLocal();this.backoff=1_000
      if(this.getState().status!=='auth')this.emit({status:this.state.queue.length?'retry':'saved',error:null})
    }catch(error){
      this.emit({status:this.options.online()?'retry':'offline',error:error instanceof Error?error.message:'Connection unavailable.'})
      this.schedule();this.backoff=Math.min(this.backoff*2,30_000)
    }finally{
      if(lease)await this.releaseLease()
      const first=this.state.queue[0]
      if(first&&(first.status==='pending'||first.status==='inflight')&&this.getState().status!=='auth'&&this.options.online())this.schedule(this.state.status==='retry'?this.backoff:50)
    }
  }
  async resolveConflict(id:string,choice:'cloud'|'mine'){
    if(!this.db)return
    const tx=this.db.transaction(['meta','queue'],'readwrite'),record=await tx.objectStore('queue').get(id),base=await tx.objectStore('meta').get('snapshot') as Snapshot|undefined
    if(!record||!base){await tx.done;return}
    const op=record.operation
    const queue=await tx.objectStore('queue').getAll()
    const entryId=op.type==='create'?op.entry.id:'entryId'in op?op.entryId:null
    if(choice==='cloud'){
      // Dependent edits cannot be reinterpreted as if their original predecessor succeeded.
      for(const q of queue)if(q.operation.id===id||(op.type==='day'&&q.sequence>record.sequence&&((q.operation.type==='day'&&q.operation.date===op.date)||('entryId'in q.operation&&(q.operation.entryId===op.additionId||op.expected.some(e=>e.id===('entryId'in q.operation?q.operation.entryId:null))))))||(q.sequence>record.sequence&&entryId&&'entryId'in q.operation&&q.operation.entryId===entryId))await tx.objectStore('queue').delete(q.operation.id)
    }else{
      let replacement:Mutation|null=null
      if(op.type==='goal')replacement={...op,id:crypto.randomUUID(),expectedRevision:base.goalRevision}
      else if(op.type==='update'||op.type==='delete'){
        const cloud=base.entries.find(e=>e.id===op.entryId&&!e.deleted)
        if(cloud)replacement={...op,id:crypto.randomUUID(),expectedVersion:cloud.version}
      }
      if(!replacement){tx.abort();throw new Error('This record cannot be reapplied. Keep the cloud value and create a new entry if needed.')}
      await tx.objectStore('queue').delete(id)
      await tx.objectStore('queue').put({operation:replacement,sequence:record.sequence,status:'pending'})
      // Rebase dependent operations onto the explicitly accepted new version.
      if('expectedVersion'in replacement){let version=replacement.expectedVersion+1;for(const q of queue.sort((a,b)=>a.sequence-b.sequence))if(q.sequence>record.sequence&&'entryId'in q.operation&&q.operation.entryId===entryId){q.operation={...q.operation,expectedVersion:version++};q.status='pending';await tx.objectStore('queue').put(q)}}
    }
    await tx.done;await this.reloadLocal();this.broadcast();void this.sync()
  }
  async importItems(items:Extract<Mutation,{type:'import'}>['items'],trackingStart:string){
    if(!this.db)throw new Error('Local storage is not ready. Nothing was imported.')
    const operations:Mutation[]=[],today=utcDay(this.options.clock())
    for(let i=0;i<Math.max(1,items.length);i+=16)operations.push(validateMutation({id:crypto.randomUUID(),type:'import',items:items.slice(i,i+16),trackingStart},today))
    // Retain the whole import in one local transaction before any chunk can reach the cloud.
    const tx=this.db.transaction(['meta','queue'],'readwrite')
    try{
      if(!await tx.objectStore('meta').get('snapshot'))throw new Error('Load your owner workspace before importing.')
      let sequence=Number(await tx.objectStore('meta').get('sequence')??0)
      for(const operation of operations)await tx.objectStore('queue').add({operation,sequence:++sequence,status:'pending'})
      await tx.objectStore('meta').put(sequence,'sequence');await tx.done
    }catch(error){try{tx.abort()}catch{/* Already closed. */}throw new Error(error instanceof Error?error.message:'Import could not be retained. Nothing was imported.')}
    await this.reloadLocal();this.emit({status:this.options.online()?'saving':'offline',error:null});this.broadcast();void this.sync()
  }
  dispose(){
    if(this.retryTimer)clearTimeout(this.retryTimer)
    this.channel?.close();this.db?.close()
    if(typeof window!=='undefined'){window.removeEventListener('focus',this.wake);window.removeEventListener('online',this.wake);window.removeEventListener('offline',this.wentOffline);document.removeEventListener('visibilitychange',this.visibility)}
  }
}
export const engine=new SyncEngine()
// Storage/sync code needs a clean instance on a development update. Durable state survives reload.
if(import.meta.hot)import.meta.hot.accept(()=>location.reload())
export function emptySnapshot(day=utcDay()):Snapshot{return {entries:[],policies:[{date:FIRST_DAY,value:DEFAULT_GOAL}],overrides:[],trackingStart:day,revision:0,goalRevision:0,serverNow:new Date().toISOString()}}

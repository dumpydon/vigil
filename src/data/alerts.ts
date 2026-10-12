import type {Snapshot} from '../../shared/model'
import {engine,type LocalMetadataStore} from './store'
import {emptyInbox,pruneAlerts,reconcileAlerts,type AlertInbox,type VigilAlert} from '../utils/notifications'

export interface AlertsState {items:VigilAlert[];pausedOn:string|null;ready:boolean;error:string|null}
const INBOX_KEY='ui.alerts.v1'

export class AlertsStore {
  private boot:Promise<void>|null=null
  private channel:BroadcastChannel|null=null
  private listeners=new Set<()=>void>()
  private fingerprint=''
  private state:AlertsState={items:[],pausedOn:null,ready:false,error:null}
  private storage:LocalMetadataStore
  private clock:()=>Date
  constructor(private options:{storage?:LocalMetadataStore;broadcast?:boolean;channelName?:string;clock?:()=>Date}={}){
    this.storage=options.storage??engine
    this.clock=options.clock??(()=>new Date())
  }
  getState=()=>this.state
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
  private emit(){for(const listener of this.listeners)listener()}
  private apply(inbox:AlertInbox){
    const fingerprint=JSON.stringify(inbox)
    if(this.state.ready&&!this.state.error&&fingerprint===this.fingerprint)return
    this.fingerprint=fingerprint
    this.state={items:inbox.items,pausedOn:inbox.pausedOn,ready:true,error:null};this.emit()
  }
  private fail(){this.state={...this.state,ready:true,error:'Alerts could not be saved on this device. Reopen Vigil to retry.'};this.emit()}
  async init():Promise<void>{
    if(this.boot)return this.boot
    this.boot=(async()=>{
      try{
        await this.load()
        if(this.options.broadcast!==false&&typeof BroadcastChannel!=='undefined'){
          this.channel=new BroadcastChannel(this.options.channelName??'vigil-alerts:changes')
          this.channel.onmessage=()=>{void this.refresh()}
        }
      }catch{this.fail()}
    })()
    return this.boot
  }
  private async load(){
    // UI metadata shares the existing cache; no database or schema is added.
    const result=await this.storage.updateLocalValue(INBOX_KEY,emptyInbox(),inbox=>pruneAlerts(inbox,this.clock()))
    this.apply(result.value)
    if(result.changed)this.channel?.postMessage('changed')
  }
  refresh=async()=>{await this.init();try{await this.load()}catch{this.fail()}}
  private async update(change:(inbox:AlertInbox)=>AlertInbox,now=this.clock()){
    await this.init()
    try{
      const result=await this.storage.updateLocalValue(INBOX_KEY,emptyInbox(),inbox=>change(pruneAlerts(inbox,now)))
      this.apply(result.value)
      if(result.changed)this.channel?.postMessage('changed')
    }catch{this.fail()}
  }
  generate(snapshot:Snapshot,now:Date,localHour:number){return this.update(inbox=>reconcileAlerts(inbox,snapshot,now,localHour),now)}
  markRead(id:string,now=this.clock()){return this.update(inbox=>inbox.items.some(item=>item.id===id&&!item.readAt)?{...inbox,items:inbox.items.map(item=>item.id===id?{...item,readAt:now.toISOString()}:item)}:inbox,now)}
  readAll(now=this.clock()){return this.update(inbox=>inbox.items.some(item=>!item.readAt)?{...inbox,items:inbox.items.map(item=>item.readAt?item:{...item,readAt:now.toISOString()})}:inbox,now)}
  clearRead(){return this.update(inbox=>inbox.items.some(item=>item.readAt)?{...inbox,items:inbox.items.filter(item=>!item.readAt)}:inbox)}
  togglePause(day:string){return this.update(inbox=>({...inbox,pausedOn:inbox.pausedOn===day?null:day}))}
  dispose(){this.channel?.close()}
}

export const alertsStore=new AlertsStore()
if(import.meta.hot)import.meta.hot.accept(()=>location.reload())

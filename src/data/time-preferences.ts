import {DEFAULT_TIME_PREFERENCES,normalizeTimeZone,readTimePreferences,type TimePreferences} from '../utils/time'
import {desktopCall,isNative} from '../desktop/bridge'

export const TIME_PREFERENCES_KEY='vigil.time-display.v1'
type StoragePort=Pick<Storage,'getItem'|'setItem'>
interface Options {
  storage:()=>StoragePort|null
  native?:{load:()=>Promise<unknown>;save:(value:TimePreferences)=>Promise<unknown>}
}

export class TimePreferencesStore {
  private value:TimePreferences
  private listeners=new Set<()=>void>()
  private initialized:Promise<void>|null=null
  private revision=0
  constructor(private options:Options){this.value=this.read()}
  private read():TimePreferences {
    try{return readTimePreferences(JSON.parse(this.options.storage()?.getItem(TIME_PREFERENCES_KEY)??'null'))}catch{return {...DEFAULT_TIME_PREFERENCES}}
  }
  private publish(value:TimePreferences){
    if(value.timeZone===this.value.timeZone&&value.clockFormat===this.value.clockFormat)return
    this.value=value;for(const listener of this.listeners)listener()
  }
  getSnapshot=()=>this.value
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener)}}
  refresh=()=>{if(!this.options.native)this.publish(this.read())}
  receive=(value:unknown)=>{this.revision++;this.publish(readTimePreferences(value))}
  init(){
    const revision=this.revision
    if(!this.initialized)this.initialized=this.options.native?this.options.native.load().then(value=>{if(revision===this.revision)this.receive(value)}).catch(()=>{this.initialized=null}):Promise.resolve()
    return this.initialized
  }
  async save(value:TimePreferences){
    const timeZone=normalizeTimeZone(value.timeZone)
    if(!timeZone||!['12h','24h'].includes(value.clockFormat))throw new Error('Choose a valid time zone and clock format.')
    this.revision++
    const next={timeZone,clockFormat:value.clockFormat}
    if(this.options.native){
      const saved=readTimePreferences(await this.options.native.save(next))
      // Native preferences also survive replacement of the app bundle/cache.
      try{this.options.storage()?.setItem(TIME_PREFERENCES_KEY,JSON.stringify(saved))}catch{/* UserDefaults is the durable native source. */}
      this.publish(saved)
    }else{
      const storage=this.options.storage()
      if(!storage)throw new Error('Time preferences could not be saved on this device.')
      storage.setItem(TIME_PREFERENCES_KEY,JSON.stringify(next));this.publish(next)
    }
  }
}

export const timePreferences=new TimePreferencesStore({
  storage:()=>typeof window==='undefined'?null:window.localStorage,
  native:isNative?{load:()=>desktopCall('timePreferences'),save:value=>desktopCall('setTimePreferences',{value})}:undefined,
})
if(typeof window!=='undefined'){
  window.addEventListener('storage',event=>{if(event.key===TIME_PREFERENCES_KEY||event.key===null)timePreferences.refresh()})
  window.addEventListener('apply-vigil:timePreferences',event=>timePreferences.receive((event as CustomEvent<unknown>).detail))
}

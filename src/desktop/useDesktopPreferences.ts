import {useEffect,useState} from 'react'
import {desktopCall,isDesktop,isDesktopPreview,type DesktopSettings} from './bridge'

export default function useDesktopPreferences(){
  const [settings,setSettings]=useState<DesktopSettings|null>(()=>isDesktopPreview?{launchAtLogin:false,loginStatus:'notRegistered',notifications:false,notificationStatus:'notDetermined',sound:'soft',menuDisplay:'count',pinned:false,version:'1.0.0'}:null)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false)
  useEffect(()=>{
    if(!isDesktop||isDesktopPreview)return
    let active=true
    void desktopCall<DesktopSettings>('settings').then(value=>{if(active)setSettings(value)}).catch(e=>{if(active)setError(e.message)})
    return()=>{active=false}
  },[])
  async function change(key:string,value:unknown){
    if(busy)return
    if(isDesktopPreview){setSettings(current=>current?{...current,[key]:value}:current);return}
    setBusy(true);setError('')
    try{setSettings(await desktopCall<DesktopSettings>('setPreference',{key,value}))}catch(e){setError(e instanceof Error?e.message:'This preference could not be changed.')}finally{setBusy(false)}
  }
  async function previewSound(){
    if(isDesktopPreview)return
    setError('')
    try{await desktopCall('previewSound')}catch(e){setError(e instanceof Error?e.message:'The sound could not be played.')}
  }
  return {settings,busy,error,change,previewSound}
}

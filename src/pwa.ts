import {isDesktop} from './desktop/bridge'

export interface InstallEvent extends Event {prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>}
export async function registerPwa(onUpdate:(worker:ServiceWorker)=>void,signal:AbortSignal){
  if(isDesktop||import.meta.env.DEV||!('serviceWorker'in navigator))return
  const registration=await navigator.serviceWorker.register('/dashboard/sw.js',{scope:'/dashboard/'})
  if(signal.aborted)return
  // Refresh the old worker to its retirement script, without clearing any records.
  void navigator.serviceWorker.getRegistration('/').then(legacy=>{
    if(legacy?.scope===location.origin+'/'&&legacy.active?.scriptURL===location.origin+'/sw.js')void legacy.update().catch(()=>{})
  }).catch(()=>{})
  if(registration.waiting)onUpdate(registration.waiting)
  registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&registration.active)onUpdate(worker)},{signal})},{signal})
  window.addEventListener('focus',()=>{void registration.update().catch(()=>{/* Existing shell remains available offline. */})},{signal})
}

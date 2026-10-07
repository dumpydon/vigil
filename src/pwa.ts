export interface InstallEvent extends Event {prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>}
export async function registerPwa(onUpdate:(worker:ServiceWorker)=>void){
  if(import.meta.env.DEV||!('serviceWorker'in navigator))return
  const registration=await navigator.serviceWorker.register('/sw.js')
  if(registration.waiting)onUpdate(registration.waiting)
  registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)onUpdate(worker)})})
  window.addEventListener('focus',()=>{void registration.update().catch(()=>{/* Existing shell remains available offline. */})})
}

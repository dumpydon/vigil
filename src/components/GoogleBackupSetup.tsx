import {useEffect,useState,useSyncExternalStore} from 'react'
import {cloudBackup} from '../desktop/cloud-backup'
import {desktopCall} from '../desktop/bridge'
import GoogleBackupButton from './GoogleBackupButton'
import './backup-reminder.css'
interface Review {status:string;email?:string;hasAccount:boolean;sameNamespace:boolean;error?:string;copy?:{backupJSON:string;revision:number;applications:number}|null}
export default function GoogleBackupSetup(){
  const status=useSyncExternalStore(cloudBackup.subscribe,cloudBackup.getState)
  const [review,setReview]=useState<Review|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{
    if(!status.googlePending||review?.status==='ready')return
    let active=true,inFlight=false
    const poll=async()=>{if(inFlight)return;inFlight=true;try{const result=await desktopCall<Review>('googlePoll');if(!active)return;if(result.status==='ready')setReview(result);else if(['failed','cancelled','consumed'].includes(result.status)){setError(result.error??'Start Google sign-in again.');await cloudBackup.googleCancel()}}catch(e){if(active){const message=e instanceof Error?e.message:'Google sign-in is waiting to reconnect.';setError(message);if(message.includes('Sign-in expired')){setReview(null);await cloudBackup.googleCancel()}}}finally{inFlight=false}}
    void poll();const timer=setInterval(()=>{void poll()},2500)
    return()=>{active=false;clearInterval(timer)}
  },[status.googlePending,review?.status])
  async function start(){setBusy(true);setError('');setReview(null);try{await cloudBackup.googleStart()}catch(e){setError(e instanceof Error?e.message:'Google could not open.')}finally{setBusy(false)}}
  async function finish(){if(!review)return;setBusy(true);setError('');try{await cloudBackup.googleFinish(review.hasAccount?'restore':'link',review.copy??undefined,review.sameNamespace);setReview(null)}catch(e){setError(e instanceof Error?e.message:'The backup could not be connected.')}finally{setBusy(false)}}
  return <div className="settings-card google-backup-setup">
    <strong>{status.googleEmail?'Recovery linked to Google':'Back up with Google'}</strong>
    <p className="fine-print">{status.googleEmail||'Keep using Vigil offline. Link Google to back up this Mac and recover your history after reinstalling.'}</p>
    {!status.googleEmail&&!status.googlePending&&<GoogleBackupButton onClick={()=>{void start()}} busy={busy}/>}
    {status.googlePending&&!review&&<p role="status" className="fine-print">Choose your Google account in the browser, then return here.</p>}
    {review&&<div className="import-preview"><strong>{review.email}</strong><p>{review.copy?`${review.copy.applications.toLocaleString()} applications in the saved cloud history.`:'Your saved history on this Mac will be copied to your private cloud backup.'}</p><p className="fine-print">Existing local records and saved deletions are kept. Different histories will not be silently combined.</p><button disabled={busy} onClick={()=>{void finish()}}>{busy?'Connecting…':review.copy?'Restore and connect':'Back up this Mac'}</button></div>}
    {status.googlePending&&<button className="text-button" disabled={busy} onClick={()=>{void cloudBackup.googleCancel().then(()=>{setReview(null);setError('')}).catch(e=>setError(String(e)))}}>Cancel sign-in</button>}
    {error&&<p className="form-error" role="alert">{error}</p>}
  </div>
}

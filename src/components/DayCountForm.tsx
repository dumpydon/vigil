import {useEffect,useRef,useState,type FormEvent} from 'react'
import {assertDay,parseCount,utcDay,type DayEntry} from '../../shared/model'
import {engine} from '../data/store'
import CountReview from './CountReview'

export interface DayDraft {kind:'day';date:string;easy:string;external:string;expected:DayEntry[]}
export default function DayCountForm({draft,onDone}:{draft:DayDraft;onDone:(message:string)=>void}){
  const [value,setValue]=useState(draft),[review,setReview]=useState<{easy:number;external:number}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),guard=useRef(false)
  const before=draft.expected.reduce((sum,e)=>({easy:sum.easy+e.easy,external:sum.external+e.external}),{easy:0,external:0})
  useEffect(()=>{void engine.saveDraft(value).catch(()=>setError('This draft could not be retained locally. Keep this window open.'))},[value])
  async function save(next:{easy:number;external:number}){
    if(guard.current)return;guard.current=true;setBusy(true);setError('')
    try{await engine.adjustDay(draft.date,next.easy,next.external,draft.expected);await engine.clearDraft();onDone(`Counts retained for ${draft.date} UTC.`)}catch(e){setError(e instanceof Error?e.message:'Could not retain this change.')}finally{guard.current=false;setBusy(false)}
  }
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError('')
    try{
      assertDay(draft.date,utcDay())
      const fields=new FormData(event.currentTarget),next={easy:parseCount(String(fields.get('easy')),0),external:parseCount(String(fields.get('external')),0)}
      if(next.easy===before.easy&&next.external===before.external){setError('Change at least one category total before saving.');return}
      if(draft.date<utcDay())setReview(next);else void save(next)
    }catch(e){setError(e instanceof Error?e.message:'Enter valid category totals.')}
  }
  if(review)return <CountReview before={[{date:draft.date,...before}]} after={[{date:draft.date,...review}]} busy={busy} error={error} onBack={()=>{setReview(null);setError('')}} onConfirm={()=>{void save(review)}}/>
  return <form onSubmit={submit} noValidate>
    <p className="form-note">Set the complete category totals for <strong>{draft.date} UTC</strong>. Today’s quick buttons continue to log today.</p>
    <label>LinkedIn Easy Apply total<input name="easy" autoFocus inputMode="numeric" maxLength={6} value={value.easy} onChange={e=>setValue({...value,easy:e.target.value})}/></label>
    <label>External / form total<input name="external" inputMode="numeric" maxLength={6} value={value.external} onChange={e=>setValue({...value,external:e.target.value})}/></label>
    <p className="fine-print">Use whole numbers from 0 to 10,000 per category. Reductions update the newest entries first; increases add a backdated entry. Original logging times and IDs are preserved.</p>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" disabled={busy} onClick={()=>{void engine.clearDraft();onDone('')}}>Cancel</button><button className="primary-button" disabled={busy}>{draft.date<utcDay()?'Review changes':busy?'Retaining…':'Save day counts'}</button></div>
  </form>
}

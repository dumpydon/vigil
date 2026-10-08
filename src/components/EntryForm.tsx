import { useEffect, useRef, useState, type FormEvent } from 'react'
import { assertDay, parseCount, utcDay } from '../../shared/model'
import { engine } from '../data/store'
import CountReview, {type DayCounts} from './CountReview'
export interface EntryDraft {kind:'entry';category:'easy'|'external'|'mixed';date:string;easy:string;external:string;entryId?:string;version?:number}
export default function EntryForm({draft,onDone}:{draft:EntryDraft;onDone:(message:string,entryId?:string)=>void}){
  const [review,setReview]=useState<{date:string;easy:number;external:number;before:DayCounts[];after:DayCounts[]}|null>(null),[value,setValue]=useState(draft),[busy,setBusy]=useState(false),[error,setError]=useState(''),submitting=useRef(false)
  useEffect(()=>{void engine.saveDraft(value).catch(()=>setError('This draft could not be retained locally. Keep this window open.'))},[value])
  const mixed=value.category==='mixed',sum=(/^\d+$/.test(value.easy)?Number(value.easy):0)+(/^\d+$/.test(value.external)?Number(value.external):0)
  async function save(next:{date:string;easy:number;external:number}){
    if(submitting.current)return;submitting.current=true;setError('');setBusy(true)
    try{
      const op=value.entryId?await engine.updateEntry(value.entryId,next.easy,next.external,next.date,value.version):await engine.createEntry(next.easy,next.external,next.date)
      await engine.clearDraft();onDone(value.entryId?'Entry updated.':`Added ${next.easy+next.external} applications.`,op?.type==='create'?op.entry.id:undefined)
    }catch(e){setError(e instanceof Error?e.message:'Could not save this entry.')}finally{submitting.current=false;setBusy(false)}
  }
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(submitting.current)return;setError('')
    try{
      const fields=new FormData(event.currentTarget),date=String(fields.get('date')??value.date)
      assertDay(date,utcDay())
      const easy=parseCount(String(fields.get('easy')??value.easy),mixed?0:value.category==='easy'?1:0),external=parseCount(String(fields.get('external')??value.external),mixed?0:value.category==='external'?1:0)
      if(easy+external===0)throw new Error('Use Delete to remove this entry, or add at least one application.')
      const snapshot=engine.getState().snapshot,original=snapshot?.entries.find(e=>e.id===value.entryId&&!e.deleted)
      if(value.entryId&&!original)throw new Error('This entry is no longer active. Reopen its history.')
      if(original&&original.easy===easy&&original.external===external&&original.date===date){setError('Change the counts or date before saving.');return}
      if(date<utcDay()||(original&&original.date<utcDay())){
        const days=[...new Set([date,...(original?[original.date]:[])])].sort()
        const before=days.map(day=>({date:day,...(snapshot?.entries.filter(e=>!e.deleted&&e.date===day).reduce((sum,e)=>({easy:sum.easy+e.easy,external:sum.external+e.external}),{easy:0,external:0})??{easy:0,external:0})}))
        const after=before.map(old=>({...old,easy:old.easy-(original?.date===old.date?original.easy:0)+(date===old.date?easy:0),external:old.external-(original?.date===old.date?original.external:0)+(date===old.date?external:0)}))
        setReview({date,easy,external,before,after})
      }else void save({date,easy,external})
    }catch(e){setError(e instanceof Error?e.message:'Could not save this entry.')}
  }
  if(review)return <CountReview before={review.before} after={review.after} busy={busy} error={error} onBack={()=>{setReview(null);setError('')}} onConfirm={()=>{void save(review)}}/>
  return <form onSubmit={submit} noValidate><p className="form-note">{value.entryId?'Edit the category counts and assigned UTC day.':'Log applications you have completed.'}</p>
    {(mixed||value.category==='easy')&&<label>LinkedIn Easy Apply<input name="easy" autoFocus inputMode="numeric" type="text" maxLength={6} value={value.easy} onChange={e=>setValue({...value,easy:e.target.value})}/></label>}
    {(mixed||value.category==='external')&&<label>External / form<input name="external" autoFocus={!mixed&&value.category==='external'} inputMode="numeric" type="text" maxLength={6} value={value.external} onChange={e=>setValue({...value,external:e.target.value})}/></label>}
    <label>Application date · UTC<input name="date" type="date" min="1970-01-01" max={utcDay()} value={value.date} onInput={e=>setValue({...value,date:e.currentTarget.value})} onChange={e=>setValue({...value,date:e.target.value})} onBlur={e=>setValue({...value,date:e.currentTarget.value})}/></label>
    {value.date!==utcDay()&&<p className="form-note">Assigned to {value.date}. The logging timestamp records when you make this entry.</p>}
    {mixed&&<p className="batch-total">Combined total <strong>{sum.toLocaleString()} applications</strong></p>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" disabled={busy} onClick={()=>{void engine.clearDraft();onDone('')}}>Cancel</button><button className="primary-button" type="submit" disabled={busy}>{busy?'Retaining…':value.entryId?'Save changes':'Add applications'}</button></div>
    <p className="fine-print">Whole numbers only, up to 10,000 per category.</p>
  </form>
}

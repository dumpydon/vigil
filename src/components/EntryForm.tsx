import { useEffect, useRef, useState, type FormEvent } from 'react'
import { parseCount, utcDay } from '../../shared/model'
import { engine } from '../data/store'
export interface EntryDraft {kind:'entry';category:'easy'|'external'|'mixed';date:string;easy:string;external:string;entryId?:string;version?:number}
export default function EntryForm({draft,onDone}:{draft:EntryDraft;onDone:(message:string,entryId?:string)=>void}){
  const [value,setValue]=useState(draft),[busy,setBusy]=useState(false),[error,setError]=useState(''),submitting=useRef(false)
  useEffect(()=>{void engine.saveDraft(value).catch(()=>setError('This draft could not be retained locally. Keep this window open.'))},[value])
  const mixed=value.category==='mixed',sum=(/^\d+$/.test(value.easy)?Number(value.easy):0)+(/^\d+$/.test(value.external)?Number(value.external):0)
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(submitting.current)return;submitting.current=true;setError('');setBusy(true)
    try{
      const fields=new FormData(event.currentTarget),date=String(fields.get('date')??value.date)
      const easy=parseCount(String(fields.get('easy')??value.easy),mixed?0:value.category==='easy'?1:0),external=parseCount(String(fields.get('external')??value.external),mixed?0:value.category==='external'?1:0)
      const op=value.entryId?await engine.updateEntry(value.entryId,easy,external,date,value.version):await engine.createEntry(easy,external,date)
      await engine.clearDraft();onDone(value.entryId?'Entry updated.':`Added ${easy+external} applications.`,op?.type==='create'?op.entry.id:undefined)
    }catch(e){setError(e instanceof Error?e.message:'Could not save this entry.')}finally{submitting.current=false;setBusy(false)}
  }
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

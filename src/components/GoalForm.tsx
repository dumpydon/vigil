import { useEffect, useRef, useState, type FormEvent } from 'react'
import { parseCount, utcDay } from '../../shared/model'
import { engine } from '../data/store'
export interface GoalDraft {kind:'goal';date:string;value:string;future:boolean;revision:number}
export default function GoalForm({draft,onDone}:{draft:GoalDraft;onDone:()=>void}){
  const [value,setValue]=useState(draft),[error,setError]=useState(''),[busy,setBusy]=useState(false),submitting=useRef(false)
  useEffect(()=>{void engine.saveDraft(value).catch(()=>setError('The draft could not be retained.'))},[value])
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(submitting.current)return;submitting.current=true;setBusy(true);setError('');try{await engine.setGoal(value.date,parseCount(value.value,1),value.date===utcDay()&&value.future,value.revision);await engine.clearDraft();onDone()}catch(e){setError(e instanceof Error?e.message:'Goal could not be retained.')}finally{submitting.current=false;setBusy(false)}}
  return <form onSubmit={submit} noValidate><p className="form-note">Goal for {value.date} · UTC. Past days keep their own goals.</p><label>Applications per day<input autoFocus type="text" inputMode="numeric" maxLength={6} value={value.value} onChange={e=>setValue({...value,value:e.target.value})}/></label>
    {value.date===utcDay()&&<label className="checkbox-label"><input type="checkbox" checked={value.future} onChange={e=>setValue({...value,future:e.target.checked})}/>Use for future days too</label>}
    {error&&<p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" disabled={busy} onClick={()=>{void engine.clearDraft();onDone()}}>Cancel</button><button type="submit" className="primary-button" disabled={busy}>{busy?'Retaining…':'Save goal'}</button></div>
  </form>
}

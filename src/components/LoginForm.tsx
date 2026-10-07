import { useRef, useState, type FormEvent } from 'react'
import { engine } from '../data/store'
export default function LoginForm({onDone}:{onDone:()=>void}){
  const [password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),submitting=useRef(false)
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(submitting.current)return;submitting.current=true;setBusy(true);setError('');try{await engine.login(password);setPassword('');onDone()}catch(e){setError(e instanceof Error?e.message:'Sign-in could not be completed.')}finally{submitting.current=false;setBusy(false)}}
  return <form onSubmit={submit}><p className="form-note">Your personal application tracker. Sign in once; this trusted device remembers your session for up to 90 days.</p><label>Owner password<input autoFocus type="password" autoComplete="current-password" value={password} maxLength={256} required onChange={e=>setPassword(e.target.value)}/></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary-button login-submit" disabled={busy}>{busy?'Signing in…':'Open Vigil'}</button><p className="fine-print">No registration. Your password stays out of local storage.</p></form>
}

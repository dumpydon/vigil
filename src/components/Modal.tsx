import { useEffect, useId, useRef, type ReactNode } from 'react'
import Icon from './Icon'
export default function Modal({title,children,onClose,busy=false,className='',initialFocus}:{title:string;children:ReactNode;onClose:()=>void;busy?:boolean;className?:string;initialFocus?:string}){
  const ref=useRef<HTMLDialogElement>(null),titleId=useId()
  useEffect(()=>{
    const dialog=ref.current,previous=dialog?.ownerDocument.activeElement as HTMLElement|null
    dialog?.showModal()
    const target=(initialFocus?dialog?.querySelector<HTMLElement>(initialFocus):null)??dialog?.querySelector<HTMLElement>('input:not([type="checkbox"]), textarea, select')
    target?.focus()
    return()=>{dialog?.close();if(previous?.isConnected&&typeof previous.focus==='function')previous.focus()}
  },[initialFocus])
  return <dialog ref={ref} className={`modal${className?' '+className:''}`} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();if(!busy)onClose()}}>
    <div className="modal-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><Icon name="close"/></button></div>{children}
  </dialog>
}

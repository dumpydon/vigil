import { useEffect, useId, useRef, type ReactNode } from 'react'
import Icon from './Icon'
export default function Modal({title,children,onClose,busy=false}:{title:string;children:ReactNode;onClose:()=>void;busy?:boolean}){
  const ref=useRef<HTMLDialogElement>(null),titleId=useId()
  useEffect(()=>{
    const previous=document.activeElement,dialog=ref.current
    dialog?.showModal()
    dialog?.querySelector<HTMLInputElement>('input:not([type="checkbox"]), textarea, select')?.focus()
    return()=>{dialog?.close();if(previous instanceof HTMLElement&&previous.isConnected)previous.focus()}
  },[])
  return <dialog ref={ref} className="modal" aria-labelledby={titleId} onCancel={e=>{e.preventDefault();if(!busy)onClose()}}>
    <div className="modal-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><Icon name="close"/></button></div>{children}
  </dialog>
}

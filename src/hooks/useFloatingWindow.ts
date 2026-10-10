import { useEffect, useRef, useState } from 'react'
import { copyPopoutStyles, openCompactPopout, pictureInPicture } from '../utils/popout'

export default function useFloatingWindow(onError:(message:string)=>void) {
  const [floatingWindow,setFloatingWindow]=useState<Window|null>(null)
  const [opening,setOpening]=useState(false)
  const current=useRef<Window|null>(null),pending=useRef(false),mounted=useRef(false)

  useEffect(()=>{
    mounted.current=true
    return()=>{
      mounted.current=false
      current.current?.close()
    }
  },[])

  async function open() {
    if(pending.current)return
    if(current.current&&!current.current.closed){current.current.focus();return}
    pending.current=true;setOpening(true)
    let popup:Window|null=null
    try{
      popup=await openCompactPopout(pictureInPicture())
      if(!mounted.current){popup.close();return}
      if(popup.closed)return
      copyPopoutStyles(document,popup.document)
      const opened=popup
      opened.addEventListener('pagehide',()=>{
        if(current.current!==opened)return
        current.current=null
        if(mounted.current)setFloatingWindow(null)
      },{once:true})
      current.current=opened;setFloatingWindow(opened)
    }catch(error){
      popup?.close()
      if(mounted.current)onError(pictureInPicture()
        ?'The floating window could not open. Click the button again in desktop Chrome.'
        :error instanceof Error?error.message:'Open Vigil directly in desktop Chrome to use floating view.')
    }finally{
      pending.current=false
      if(mounted.current)setOpening(false)
    }
  }

  return {floatingWindow,opening,open}
}

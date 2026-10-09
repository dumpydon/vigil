export interface DocumentPictureInPicture {
  window:Window|null
  requestWindow:(options:{width:number;height:number})=>Promise<Window>
}

export function pictureInPicture(host:Window=window):DocumentPictureInPicture|undefined {
  return (host as Window&{documentPictureInPicture?:DocumentPictureInPicture}).documentPictureInPicture
}

// Request from the click handler so Chrome retains the required user gesture.
export async function openCompactPopout(api:DocumentPictureInPicture|undefined):Promise<Window> {
  if(!api)throw new Error('Floating view requires desktop Chrome. Open Vigil directly in Chrome to use it.')
  const existing=api.window
  const popout=existing&&!existing.closed?existing:await api.requestWindow({width:420,height:400})
  popout.focus()
  return popout
}

// PiP is a separate document: copy both Vite's inline CSS and production links.
export function copyPopoutStyles(source:Document,target:Document){
  target.title='Vigil · Floating view'
  target.documentElement.lang=source.documentElement.lang||'en'
  const base=target.createElement('base');base.href=source.baseURI;target.head.appendChild(base)
  for(const element of source.querySelectorAll('style,link[rel="stylesheet"]'))target.head.appendChild(element.cloneNode(true))
}

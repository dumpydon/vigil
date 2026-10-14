export const DASHBOARD_PATH='/dashboard/'
export const COMPACT_PATH='/dashboard/compact/'

export const publicPages:Record<string,string>={
  '/':'index.html','/install/':'install.html','/privacy/':'privacy.html',
  '/changelog/':'changelog.html','/tour/':'demo.html','/first-launch/':'first-launch.html',
}

// Keep old public links and compact bookmarks useful, with one canonical URL.
export function siteRoute(url:URL):{redirect?:string;asset:string;dashboard:boolean}{
  const path=url.pathname
  let redirect:string|undefined
  if(path==='/download'||path==='/download/'||path==='/download/index.html'||path==='/index.html')redirect='/'
  else if(path==='/compact'||path==='/compact/')redirect=COMPACT_PATH
  else if(path==='/dashboard'||path==='/dashboard/index.html')redirect=DASHBOARD_PATH
  else if(path==='/dashboard/compact')redirect=COMPACT_PATH
  else for(const [canonical,file] of Object.entries(publicPages)){
    if(canonical==='/')continue
    if(path===canonical.slice(0,-1)||path==='/'+file||path==='/download/'+file||path==='/download/'+file.replace('.html','')||path==='/download/'+file.replace('.html','')+'/'){redirect=canonical;break}
  }
  // Old synthetic preview / day-history links belong to the app, not the homepage.
  if(path==='/'&&['desktop-preview','compact-preview','day'].some(key=>url.searchParams.has(key)))redirect=DASHBOARD_PATH
  return {redirect:redirect?redirect+url.search+url.hash:undefined,asset:path===COMPACT_PATH?DASHBOARD_PATH:path,dashboard:path==='/dashboard'||path.startsWith(DASHBOARD_PATH)}
}

type Name='today'|'history'|'settings'|'compact'|'expand'|'undo'|'close'|'arrow'|'download'|'upload'|'logout'|'check'|'refresh'
const paths:Record<Name,string[]>={
  today:['M3 10 12 3l9 7','M5 9v12h14V9','M9 21v-8h6v8'],history:['M4 20V10','M10 20V4','M16 20v-8','M22 20H2'],
  settings:['m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3Z','M15 12a3 3 0 1 1-6 0a3 3 0 0 1 6 0'],
  compact:['M4 4h16v16H4Z','M4 9h16','M9 9v11'],expand:['M14 3h7v7','M21 3l-9 9','M10 21H3v-7','M3 21l9-9'],
  undo:['M8 4 3 9l5 5','M3 9h10a7 7 0 1 1 0 14'],close:['m5 5 14 14','M19 5 5 19'],arrow:['M5 12h14','m13 6 6 6-6 6'],
  download:['M12 3v12','m6 10 6 6 6-6','M4 17v4h16v-4'],upload:['M12 16V4','m6 10 6-6 6 6','M4 17v4h16v-4'],logout:['M9 3H3v18h6','M9 12h12','m16 7 5 5-5 5'],
  check:['m5 12 4 4L19 6'],refresh:['M20 8a8 8 0 1 0 0 8','M20 3v5h-5'],
}
export default function Icon({name,size=16}:{name:Name;size?:number}){
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{paths[name].map((d,i)=><path d={d} key={i}/>)}</svg>
}

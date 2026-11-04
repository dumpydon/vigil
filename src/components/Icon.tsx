import {useId} from 'react'
import settingsGear from '../assets/settings-gear.png'

type Name='today'|'history'|'settings'|'compact'|'popout'|'undo'|'close'|'arrow'|'calendar'|'download'|'upload'|'logout'|'edit'|'bell'|'clock'|'trash'|'gauge'|'goal-check'|'check'|'pin'|'play'|'folder'
const paths:Record<Exclude<Name,'settings'>,string[]>={
  folder:['M3 7V4h6l2 3h10v13H3Z'],
  play:['m9 5 11 7-11 7Z'],
  pin:['m16 3 5 5-4 1-4 5v3l-2-2-6 6','m11 3 10 10','m11 3-1 4-4 4H3l10 10'],
  today:['M3 10 12 3l9 7','M5 9v12h14V9','M9 21v-8h6v8'],history:['M4 20V10','M10 20V4','M16 20v-8','M22 20H2'],
  compact:['M4 4h16v16H4Z','M4 9h16','M9 9v11'],
  popout:['M14 3h7v7','M21 3l-9 9','M10 3H3v18h18v-7'],
  calendar:['M4 5h16v16H4Z','M8 3v4','M16 3v4','M4 10h16'],
  bell:['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9','M10 21a2 2 0 0 0 4 0'],
  clock:['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18','M12 7v5l3 2'],
  trash:['M3 6h18','M9 6V3h6v3','M5 6l1 15h12l1-15','M10 10v7','M14 10v7'],
  gauge:['M3.34 19a10 10 0 1 1 17.32 0','M12 13l4-5'],
  'goal-check':['M21 11.1V12a9 9 0 1 1-5.34-8.23','m9 11 3 3L22 4'],
  check:['m5 12 4 4L19 6'],
  undo:['M8 4 3 9l5 5','M3 9h10a7 7 0 1 1 0 14'],close:['m5 5 14 14','M19 5 5 19'],arrow:['M5 12h14','m13 6 6 6-6 6'],
  download:['M12 3v12','m6 10 6 6 6-6','M4 17v4h16v-4'],upload:['M12 16V4','m6 10 6-6 6 6','M4 17v4h16v-4'],logout:['M9 3H3v18h6','M9 12h12','m16 7 5 5-5 5'],
  edit:['m16 4 4 4','M4 20l5-1L20 8a2.83 2.83 0 0 0-4-4L5 15l-1 5Z'],
}
export default function Icon({name,size=16}:{name:Name;size?:number}){
  const id=useId()
  const dimension=`${size/16}rem`
  if(name==='settings')return <svg width={dimension} height={dimension} viewBox="0 0 24 24" aria-hidden="true" data-icon="settings">
    <defs>
      <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24" style={{maskType:'luminance'}}><image href={settingsGear} width="24" height="24"/></mask>
    </defs>
    <rect width="24" height="24" fill="currentColor" mask={`url(#${id}-mask)`}/>
  </svg>
  return <svg width={dimension} height={dimension} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{paths[name].map((d,i)=><path d={d} key={i}/>)}</svg>
}

import {useEffect,useId,useLayoutEffect,useMemo,useRef,useState,type CSSProperties,type KeyboardEvent} from 'react'
import {EASY_STREAK_TARGET,shiftDay,type Snapshot} from '../../shared/model'
import {longDate,shortDate} from '../utils/format'
import {rhythm,RHYTHM_CELL_GAP,RHYTHM_MONTH_BATCH,RHYTHM_MONTH_GAP,RHYTHM_WEEKDAYS,type RhythmDay} from '../utils/rhythm'
import Icon from './Icon'
import './Rhythm.css'

const number=(value:number)=>value.toLocaleString('en')
const weekdayFormatter=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:'short'})
type Hot={date:string;x:number;y:number;below:boolean}
function tooltipPosition(container:HTMLElement,node:HTMLElement,date:string):Hot{
  const tile=node.getBoundingClientRect(),box=container.getBoundingClientRect(),scale=box.width/container.offsetWidth||1
  const header=container.closest('.workspace')?.querySelector('.header')?.getBoundingClientRect().bottom??0
  const below=tile.top-Math.max(0,header)<58*scale
  return {date,x:(tile.left+tile.width/2-box.left)/box.width*100,y:((below?tile.bottom:tile.top)-box.top)/scale+(below?8:-8),below}
}

export default function Rhythm({snapshot,today,selected,onSelect}:{snapshot:Snapshot;today:string;selected:string|null;onSelect:(day:string)=>void}){
  const [monthCount,setMonthCount]=useState(RHYTHM_MONTH_BATCH)
  const data=useMemo(()=>rhythm(snapshot,today,monthCount),[snapshot,today,monthCount]),id=useId(),root=useRef<HTMLElement>(null),scroller=useRef<HTMLDivElement>(null),followLatest=useRef(true),expansion=useRef<{left:number;width:number}|null>(null)
  const [width,setWidth]=useState(0),[hot,setHot]=useState<Hot|null>(null),[focusDate,setFocusDate]=useState<string|null>(null),[edges,setEdges]=useState({earlier:true,later:false})
  const gapWidth=(data.visibleColumns-data.visibleMonths)*RHYTHM_CELL_GAP+(data.visibleMonths-1)*RHYTHM_MONTH_GAP
  const cell=Math.max(10,Math.min(22,((width||360)-6-gapWidth)/Math.max(1,data.visibleColumns)))
  const firstMonth=data.months[0].key,lastMonth=data.months[data.months.length-1].key,detail=hot?data.byDate.get(hot.date):null
  useLayoutEffect(()=>{
    const node=scroller.current;if(!node)return
    const observer=new ResizeObserver(([entry])=>{setWidth(entry.contentRect.width);setHot(null)})
    observer.observe(node);return()=>observer.disconnect()
  },[])
  useLayoutEffect(()=>{
    const node=scroller.current
    if(!node)return
    if(expansion.current){
      node.scrollLeft=expansion.current.left+node.scrollWidth-expansion.current.width
      expansion.current=null
    }else if(followLatest.current)node.scrollLeft=node.scrollWidth-node.clientWidth
  },[cell,today,firstMonth,lastMonth])
  useEffect(()=>{
    const container=root.current,workspace=container?.closest('.workspace')
    if(!container)return
    const reposition=()=>setHot(previous=>{
      if(!previous)return previous
      const node=container.querySelector<HTMLElement>(`[data-date="${previous.date}"]`),view=scroller.current?.getBoundingClientRect()
      if(!node||!view)return null
      const tile=node.getBoundingClientRect(),header=workspace?.querySelector('.header')?.getBoundingClientRect().bottom??0,bottom=Math.min(innerHeight,workspace?.getBoundingClientRect().bottom??innerHeight)
      if(tile.top<header||tile.bottom>bottom||tile.right<=view.left||tile.left>=view.right)return null
      const next=tooltipPosition(container,node,previous.date)
      return previous.x===next.x&&previous.y===next.y&&previous.below===next.below?previous:next
    })
    workspace?.addEventListener('scroll',reposition,{passive:true});window.addEventListener('scroll',reposition,{passive:true})
    return()=>{workspace?.removeEventListener('scroll',reposition);window.removeEventListener('scroll',reposition)}
  },[])

  function show(day:RhythmDay,node:HTMLElement){
    const container=root.current;if(!container)return
    setHot(tooltipPosition(container,node,day.date))
  }
  function scrollChanged(){
    const node=scroller.current;if(!node)return
    const viewport=node.getBoundingClientRect(),track=node.firstElementChild?.getBoundingClientRect(),scale=viewport.width/node.offsetWidth||1
    const earlier=node.scrollLeft>2,later=!!track&&track.right>viewport.right+2*scale
    followLatest.current=!later
    setEdges(previous=>previous.earlier===earlier&&previous.later===later?previous:{earlier,later})
    const focused=document.activeElement
    if(focused instanceof HTMLButtonElement&&node.contains(focused)&&focused.dataset.date){
      const day=data.byDate.get(focused.dataset.date),box=focused.getBoundingClientRect()
      if(day&&box.left>=viewport.left&&box.right<=viewport.right){show(day,focused);return}
    }
    setHot(null)
  }
  function page(direction:-1|1){
    const node=scroller.current;if(!node)return
    const maximum=node.scrollWidth-node.clientWidth,next=node.scrollLeft+direction*node.clientWidth*.85
    const target=direction>0&&maximum-next<cell+RHYTHM_CELL_GAP?maximum:next
    followLatest.current=target>=maximum
    node.scrollTo({left:target,behavior:'auto'});scrollChanged()
  }
  function loadEarlier(){
    const node=scroller.current
    if(!node||!data.hasEarlier)return
    expansion.current={left:node.scrollLeft,width:node.scrollWidth}
    followLatest.current=false;setHot(null)
    setMonthCount(count=>count+RHYTHM_MONTH_BATCH)
  }
  function keyboard(event:KeyboardEvent<HTMLButtonElement>,day:RhythmDay){
    if(event.key==='Escape'){setHot(null);event.stopPropagation();return}
    const delta=event.key==='ArrowLeft'?-7:event.key==='ArrowRight'?7:event.key==='ArrowUp'?-1:event.key==='ArrowDown'?1:null
    const next=event.key==='Home'?data.byDate.keys().next().value:event.key==='End'?today:delta===null?null:shiftDay(day.date,delta)
    if(!next||!data.byDate.has(next))return
    event.preventDefault()
    const target=scroller.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)
    if(target){setFocusDate(next);target.focus()}
  }
  const busiest=data.busiest.length===1?`${RHYTHM_WEEKDAYS[data.busiest[0]]}s`:data.busiest.length===2?data.busiest.map(index=>RHYTHM_WEEKDAYS[index].slice(0,3)).join(' & '):data.busiest.length?'Multiple days':'—'
  const busiestHelp=data.busiest.length?`${data.busiest.map(index=>RHYTHM_WEEKDAYS[index]).join(', ')}: ${number(data.weekdayTotals[data.busiest[0]])} applications across the last 90 days.`:'No applications in the last 90 days.'
  const streakHelp=`Longest all-time streak: ${data.longest.days} consecutive ${data.longest.days===1?'day':'days'} with at least ${EASY_STREAK_TARGET} LinkedIn Easy Apply applications per day. External/form applications do not count.${data.longest.from&&data.longest.to?` ${longDate(data.longest.from)} – ${longDate(data.longest.to)}.`:''}`
  return <section className="section rhythm" ref={root} aria-labelledby={`${id}-heading`} style={{'--rhythm-cell':`${cell}px`,'--rhythm-gap':`${RHYTHM_CELL_GAP}px`,'--rhythm-month-gap':`${RHYTHM_MONTH_GAP}px`} as CSSProperties}>
    <div className="section-heading rhythm-heading"><h2 id={`${id}-heading`}>Rhythm</h2><div className="rhythm-navigation" role="group" aria-label="Rhythm history">{data.hasEarlier&&<button className="text-button rhythm-load-earlier" aria-label="Load earlier months" title="Load six more months to the left" onClick={loadEarlier}>Load earlier months</button>}<button className="icon-button" disabled={!edges.earlier} aria-label="Earlier Rhythm months" title="Earlier months" onClick={()=>page(-1)}><Icon name="arrow" size={14}/></button><button className="icon-button" disabled={!edges.later} aria-label="Later Rhythm months" title="Later months" onClick={()=>page(1)}><Icon name="arrow" size={14}/></button></div></div>
    <p className="rhythm-summary"><strong data-testid="rhythm-total">{number(data.total)}</strong><span>applications in the last 90 days</span></p>
    <div className="rhythm-scroll" ref={scroller} onScroll={scrollChanged} aria-label="Application activity by month. Scroll horizontally for earlier months." aria-describedby={`${id}-help`}>
      <div className="rhythm-months">{data.months.map((month,index)=><div className="rhythm-month" key={month.key} data-month={month.key} style={{width:month.columns*cell+(month.columns-1)*RHYTHM_CELL_GAP}}>
        <div className="rhythm-month-days" style={{gridTemplateColumns:`repeat(${month.columns},var(--rhythm-cell))`}}>{month.cells.map((day,position)=>day?<button key={day.date} className={`rhythm-day${day.date===today?' is-today':''}${day.date===selected?' is-selected':''}${day.date===hot?.date?' is-hot':''}`} data-date={day.date} data-level={day.level} aria-label={`${longDate(day.date)} UTC. ${number(day.total)} applications: ${number(day.easy)} LinkedIn Easy Apply, ${number(day.external)} external/form.${day.tracked?'':' Before tracking began.'}`} aria-describedby={day.date===hot?.date?`${id}-tooltip`:undefined} aria-pressed={day.date===selected} tabIndex={day.date===(focusDate??today)?0:-1} onMouseEnter={event=>show(day,event.currentTarget)} onMouseLeave={event=>{if(document.activeElement!==event.currentTarget)setHot(null)}} onFocus={event=>{setFocusDate(day.date);show(day,event.currentTarget)}} onBlur={()=>setHot(null)} onClick={event=>{setFocusDate(day.date);show(day,event.currentTarget);onSelect(day.date)}} onKeyDown={event=>keyboard(event,day)}/>:<span className="rhythm-placeholder" key={`blank-${position}`} aria-hidden="true"/>)}</div>
        <time className="rhythm-month-label" dateTime={month.key} title={`${month.label} ${month.year}`}>{month.label}{(index===0||month.key.endsWith('-01'))&&<small>{month.year.slice(-2)}</small>}</time>
      </div>)}</div>
    </div>
    <span id={`${id}-help`} className="visually-hidden">The view opens at the latest 90 days, including today, with six months available to scroll. Load earlier months adds six more to the left. Arrow keys explore days, Home and End move to the first loaded or latest date, and Enter opens that day’s history. Counts use saved UTC application dates.</span>
    <span className="visually-hidden" role="status" aria-live="polite">{data.months.length} months loaded. {data.months[0].label} {data.months[0].year} through {data.months.at(-1)!.label} {data.months.at(-1)!.year}.</span>
    <div className="rhythm-legend"><span>{number(data.activeDays)} active {data.activeDays===1?'day':'days'}<span className="rhythm-utc"> · UTC</span></span><div aria-label="Application activity: zero, 1–9, 10–19, 20–39, and 40 or more applications per day."><span>Less</span>{[0,1,2,3,4].map(level=><i key={level} data-level={level} aria-hidden="true"/>)}<span>More</span></div></div>
    <div className="rhythm-stats"><div title={busiestHelp}><span>Busiest on</span><strong data-testid="rhythm-busiest">{busiest}</strong></div><div title={streakHelp}><span>Longest streak</span><strong data-testid="rhythm-longest">{number(data.longest.days)} <small>{data.longest.days===1?'day':'days'}</small></strong></div></div>
    {hot&&detail&&<div id={`${id}-tooltip`} role="tooltip" className={`rhythm-tooltip${hot.below?' below':''}`} style={{left:`clamp(min(50%, 12rem), ${hot.x}%, max(50%, calc(100% - 12rem)))`,top:hot.y}}>
      <strong><span className="rhythm-tooltip-weekday">{weekdayFormatter.format(new Date(`${detail.date}T00:00:00.000Z`))}</span> · {shortDate(detail.date)}{detail.date.slice(0,4)!==today.slice(0,4)?`, ${detail.date.slice(0,4)}`:''}</strong><span aria-hidden="true">·</span><b>{number(detail.total)} {detail.total===1?'application':'applications'}</b><span className="easy-text">{number(detail.easy)} Easy Apply</span><span className="external-text">{number(detail.external)} form {detail.external===1?'fill':'fills'}</span>{!detail.tracked&&<small>Before tracking began</small>}
    </div>}
  </section>
}

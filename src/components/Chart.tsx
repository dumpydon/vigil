import { useEffect, useId, useRef, useState } from 'react'
import type { Daily } from '../../shared/model'
import { longDate, shortDate } from '../utils/format'

const number=(n:number)=>n.toLocaleString('en')
function topPath(x:number,y:number,w:number,h:number){const r=Math.min(8,w/2,h);return `M${x},${y+h}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${y+h}Z`}
export default function Chart({series,selected,onSelect}:{series:Daily[];selected:string|null;onSelect:(day:string)=>void}){
  const ref=useRef<HTMLDivElement>(null),id=useId().replace(/[^a-z0-9]/gi,''),[width,setWidth]=useState(820),[hot,setHot]=useState<number|null>(null),[pinned,setPinned]=useState(false)
  useEffect(()=>{if(!ref.current)return;const ro=new ResizeObserver(([entry])=>setWidth(Math.max(260,entry.contentRect.width)));ro.observe(ref.current);return()=>ro.disconnect()},[])
  const gutter=36,right=8,plotWidth=width-gutter-right,plotHeight=264,top=16,bottom=top+plotHeight,slot=plotWidth/series.length,chartHeight=bottom+42
  const hasGoal=(d:Daily)=>d.tracking&&Number.isFinite(d.goal)&&d.goal>0
  const maximum=25*Math.ceil(Math.max(25,...series.map(d=>Math.max(d.total,hasGoal(d)?d.goal:0)))/25),barWidth=slot*.88
  const barGap=slot-barWidth,focusStroke=Math.min(1.5,barGap),focusPadding=Math.min(2,(barGap-focusStroke)/2)
  const labelGap=44*1.75,tickStep=Math.max(series.length===7?1:series.length===15?3:7,Math.ceil(labelGap/slot))
  const axisStep=Math.max(25,25*Math.ceil(maximum/3/25)),axisTicks=Array.from({length:Math.floor(maximum/axisStep)+1},(_,i)=>i*axisStep)
  if(axisTicks[axisTicks.length-1]!==maximum)axisTicks.push(maximum)
  const detail=hot===null?null:series[hot],hotX=hot===null?0:(gutter+slot*(hot+.5))/width*100
  function focusDay(index:number){const target=ref.current?.querySelector(`[data-day-index="${Math.max(0,Math.min(series.length-1,index))}"]`);if(target instanceof SVGElement)target.focus()}
  return <div className="chart" ref={ref} onKeyDown={e=>{if(e.key==='Escape'){setHot(null);setPinned(false)}}}>
    <svg width="100%" viewBox={`0 0 ${width} ${chartHeight}`} aria-label={`Applications over ${series.length} UTC days`}>
      <g aria-hidden="true" pointerEvents="none">
        {series.map((d,i)=>{
          if(!hasGoal(d))return null
          const x=gutter+slot*(i+.5)-barWidth/2,h=d.goal/maximum*plotHeight
          return <path key={d.date} className="bar-goal" d={topPath(x,bottom-h,barWidth,h)}/>
        })}
      </g>
      {axisTicks.map(value=><g key={value}><line x1={gutter} x2={width-right} y1={bottom-value/maximum*plotHeight} y2={bottom-value/maximum*plotHeight} className="chart-grid"/><text x={0} y={bottom-value/maximum*plotHeight+4} className="axis">{value>=1000?`${+(value/1000).toFixed(1)}k`:value}</text></g>)}
      {series.map((d,i)=>{
        const x=gutter+slot*(i+.5)-barWidth/2,h=d.total/maximum*plotHeight,easyH=d.easy/maximum*plotHeight,y=bottom-h,showLabel=i===series.length-1||(i%tickStep===0&&(series.length-1-i)*slot>=labelGap)
        return <g key={d.date} role="button" tabIndex={0} data-day-index={i} aria-label={`${longDate(d.date)} UTC. ${number(d.total)} applications: ${number(d.easy)} Easy Apply, ${number(d.external)} External. Goal ${d.goal}. ${ (d.total/d.goal*100).toFixed(1)} percent. Open day history.`}
          className={`chart-day${selected===d.date?' selected':''}${hot===i?' hot':''}`} onMouseEnter={()=>{if(!pinned)setHot(i)}} onMouseLeave={()=>{if(!pinned)setHot(null)}} onFocus={()=>{setHot(i);setPinned(false)}} onBlur={()=>{if(!pinned)setHot(null)}}
          onClick={()=>{onSelect(d.date);setHot(i);setPinned(true)}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(d.date);setPinned(true)}else if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();focusDay(i+(e.key==='ArrowRight'?1:-1))}}}>
          <rect x={gutter+i*slot} y={top} width={slot} height={plotHeight+40} fill="transparent"/>
          {d.total>0?<><defs><clipPath id={`${id}-${i}`}><path d={topPath(x,y,barWidth,h)}/></clipPath></defs><g clipPath={`url(#${id}-${i})`}><rect x={x} y={bottom-easyH} width={barWidth} height={easyH} className="bar-easy"/><rect x={x} y={y} width={barWidth} height={h-easyH} className="bar-external"/></g></>:<circle cx={x+barWidth/2} cy={bottom} r="1.5" className="zero-marker"/>}
          <rect className="bar-focus" x={x-focusPadding} y={y-2} width={barWidth+focusPadding*2} height={Math.max(h+4,5)} rx="4" fill="none" style={{strokeWidth:focusStroke}}/>
          {showLabel&&<text x={Math.min(gutter+slot*(i+.5),width-42)} y={bottom+34} textAnchor="middle" className="axis date-axis">{shortDate(d.date)}</text>}
        </g>
      })}
    </svg>
    {detail&&<div className="chart-tooltip" role="tooltip" style={{left:`clamp(min(50%, 7.75rem), ${hotX}%, max(50%, calc(100% - 7.75rem)))`}}><strong>{longDate(detail.date)} · UTC</strong><div><span>Total</span><b>{number(detail.total)}</b></div><div><span className="easy-text">Easy Apply</span><b>{number(detail.easy)}</b></div><div><span className="external-text">External / form</span><b>{number(detail.external)}</b></div><div><span>Goal {number(detail.goal)}</span><b>{(detail.total/detail.goal*100).toFixed(1)}%</b></div>{!detail.tracking&&<small>Before tracking began</small>}</div>}
  </div>
}

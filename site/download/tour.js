import {createTourClock,TOUR_DURATION,SCENE_DURATION} from './tour-timeline.js'

const scenes=[
  ['Your daily watch','Keep your progress close.','Log what you finish. Your count and daily goal update together.'],
  ['The compact window','A little window. Always there.','Keep logging above your other apps. Move the window to where you need it.'],
  ['Your effort over time','The bigger picture, made clear.','Explore a date, change the range, then scroll through your totals and history.'],
  ['Quiet encouragement','A nudge when it matters.','Read a progress alert, clear your inbox, or pause encouragement for today.'],
  ['Local by design','Your history stays yours.','No account or activity upload. Keep a JSON backup to move or restore your history.'],
]
const cues=[
  ['Your day, at a glance','One application counted','Two channels, one daily total','Progress updates with every count'],
  ['The same counts in a smaller window','Log without leaving your work','Your goal stays in view','Place it where it suits you'],
  ['Hover a day for its details','Switch to a wider view','Compare your UTC period totals','Scroll into your entry history'],
  ['A gentle halfway update','Read it when you are ready','Keep a clear inbox','Pause alerts for the rest of today'],
  ['Start with your own empty workspace','Keep your history on this Mac','Export a portable JSON backup','Restore it whenever you need it'],
]
const one=selector=>document.querySelector(selector)
const text=(selector,value)=>{const element=one(selector);if(element.textContent!==value)element.textContent=value}
const frames=Array.from(document.querySelectorAll('[data-tour-frame]'))
const app=one('.tour-app'),local=one('.tour-local'),play=one('#tour-play')
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),clock=createTourClock(),loaded=new Set()
let ready=false,current=-1,animation=0,resumeAfterHidden=false,run=0,previousPlaying=false
const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t)}

function render(){
  const state=clock.snapshot(),changed=current!==state.index
  document.body.classList.toggle('paused',!state.playing)
  if(changed){
    current=state.index
    const [eyebrow,title,copy]=scenes[current]
    one('#tour-eyebrow').textContent=eyebrow;one('#tour-title').textContent=title;one('#tour-copy').textContent=copy
    document.querySelectorAll('[data-scene]').forEach(button=>{const selected=Number(button.dataset.scene)===current;button.classList.toggle('on',selected);button.setAttribute('aria-pressed',String(selected))})
    frames.forEach(frame=>frame.classList.toggle('active',Number(frame.dataset.tourFrame)===current))
    app.hidden=current===4;local.hidden=current!==4
    one('.tour-copy').classList.remove('enter');void one('.tour-copy').offsetWidth;one('.tour-copy').classList.add('enter')
  }
  const phase=Math.min(3,Math.floor(Math.max(0,state.time-.45)/1.4))
  text('#tour-cue',cues[current][phase])
  text('#tour-menu-count',`◉  ${state.total} / 75`)
  const move=current===1&&!reduced.matches?smooth((state.time-3.15)/1.5):0
  app.style.setProperty('--tour-x',`${-65*move}px`);app.style.setProperty('--tour-y',`${35*move}px`)
  local.querySelectorAll('[data-local-step]').forEach((row,index)=>{row.classList.toggle('revealed',state.time>=.55+index*1.45);row.classList.toggle('done',state.time>=1.15+index*1.45)})
  local.classList.toggle('complete',state.ended)
  one('#tour-fill').style.width=`${state.elapsed/TOUR_DURATION*100}%`
  one('.tour-track').setAttribute('aria-valuenow',state.elapsed.toFixed(1))
  text('#tour-time',`0:${String(Math.floor(state.elapsed)).padStart(2,'0')} / 0:30`)
  play.textContent=state.playing?'Ⅱ':'▶';play.setAttribute('aria-label',state.playing?'Pause product tour':state.ended?'Play product tour again':'Play product tour')
  // Stop every preview when pausing or changing chapters; no independent demo timers.
  if(changed||previousPlaying!==state.playing)frames.forEach(frame=>frame.contentWindow?.postMessage({applyVigilPreview:{action:'tour-pause'}},location.origin))
  if(ready&&current<4)frames[current].contentWindow?.postMessage({applyVigilPreview:{action:'tour',...state,run}},location.origin)
  previousPlaying=state.playing
  return state
}
function tick(){animation=0;if(render().playing)animation=requestAnimationFrame(tick)}
function update(){cancelAnimationFrame(animation);animation=0;if(render().playing)animation=requestAnimationFrame(tick)}
function markReady(frame){
  loaded.add(frame)
  if(loaded.size!==frames.length||ready)return
  ready=true;play.disabled=false;one('#tour-replay').disabled=false;one('#tour-loading').hidden=true
  if(!reduced.matches){if(document.hidden)resumeAfterHidden=true;else clock.play()}
  update()
}
frames.forEach(frame=>{frame.addEventListener('load',()=>markReady(frame),{once:true});if(frame.contentDocument?.readyState==='complete'&&frame.contentDocument.querySelector('.surface'))markReady(frame)})
document.querySelectorAll('[data-scene]').forEach(button=>button.addEventListener('click',()=>{clock.seek(Number(button.dataset.scene)*SCENE_DURATION);update()}))
play.addEventListener('click',()=>{const state=clock.snapshot();if(state.playing)clock.pause();else{if(state.ended)run++;clock.play()}update()})
one('#tour-replay').addEventListener('click',()=>{run++;current=-1;clock.replay();update()})
one('#tour-download').addEventListener('click',event=>{if(window!==parent){event.preventDefault();parent.postMessage({applyVigilSite:'show-download'},location.origin)}})
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){resumeAfterHidden=clock.snapshot().playing;clock.pause()}
  else if(resumeAfterHidden){resumeAfterHidden=false;clock.play()}
  update()
})
addEventListener('pagehide',()=>cancelAnimationFrame(animation))
addEventListener('keydown',event=>{if(event.key==='Escape'&&window!==parent)parent.postMessage({applyVigilSite:'close-modal'},location.origin)})
render()

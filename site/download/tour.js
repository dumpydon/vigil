(() => {
  const scenes=[
    ['Your daily watch','Keep your progress close.','Your applications and your daily goal, one click away in the menu bar.','overview.html'],
    ['The compact window','A little window. Always there.','Log an application from the floating window while you keep working in another app.','compact.html?animate=1'],
    ['Your effort over time','The bigger picture, made clear.','Explore daily counts, category breakdowns, goal streaks, and compact entry history.','usage.html?tooltip=1'],
    ['Quiet encouragement','A nudge when it matters.','Opening overviews, halfway milestones, goal celebrations, and sounds at your volume.','alerts.html'],
    ['Local by design','Your history stays yours.','Start with a fresh local workspace. Export a backup whenever you want to move your history.',null],
  ]
  const frame=document.querySelector('#tour-frame'),app=document.querySelector('.tour-app'),local=document.querySelector('.tour-local'),play=document.querySelector('#tour-play')
  let elapsed=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,current=-1,changeTimer
  function scene(index){
    if(index===current)return;current=index;clearTimeout(changeTimer)
    const [eyebrow,title,copy,src]=scenes[index]
    document.querySelector('#tour-eyebrow').textContent=eyebrow;document.querySelector('#tour-title').textContent=title;document.querySelector('#tour-copy').textContent=copy
    document.querySelectorAll('[data-scene]').forEach(button=>button.classList.toggle('on',Number(button.dataset.scene)===index))
    app.classList.add('fade')
    changeTimer=setTimeout(()=>{app.hidden=!src;local.hidden=!!src;if(src){frame.title=`Apply Vigil ${scenes[index][0].toLowerCase()} demonstration`;frame.src=`previews/${src}`;app.classList.remove('fade')}},350)
  }
  function render(){scene(Math.min(4,Math.floor(elapsed/18)));document.querySelector('#tour-fill').style.width=`${elapsed/90*100}%`;document.querySelector('#tour-time').textContent=`${Math.floor(elapsed/60)}:${String(Math.floor(elapsed%60)).padStart(2,'0')} / 1:30`;play.textContent=paused?'▶':'Ⅱ';play.setAttribute('aria-label',paused?'Play product tour':'Pause product tour')}
  document.querySelectorAll('[data-scene]').forEach(button=>button.addEventListener('click',()=>{elapsed=Number(button.dataset.scene)*18;render()}))
  play.addEventListener('click',()=>{if(elapsed>=90)elapsed=0;paused=!paused;render()})
  document.querySelector('#tour-replay').addEventListener('click',()=>{elapsed=0;current=-1;paused=false;render()})
  document.querySelector('#tour-download').addEventListener('click',event=>{if(window!==parent){event.preventDefault();parent.postMessage({applyVigilSite:'show-download'},location.origin)}})
  frame.addEventListener('load',()=>{if(current===0&&!paused)frame.contentWindow.postMessage({applyVigilPreview:{action:'play'}},location.origin)})
  const timer=setInterval(()=>{if(!paused&&!document.hidden&&elapsed<90){elapsed+=.25;if(elapsed>=90)paused=true;render()}},250)
  addEventListener('pagehide',()=>{clearInterval(timer);clearTimeout(changeTimer)})
  addEventListener('keydown',event=>{if(event.key==='Escape'&&window!==parent)parent.postMessage({applyVigilSite:'close-modal'},location.origin)})
  render()
})()

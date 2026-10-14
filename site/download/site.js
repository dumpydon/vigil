/* Apply Vigil landing interactions. No analytics, account access, or app data. */
import {createReplayLoop,pageReplayBudget} from './replay-loop.js'
(() => {
  'use strict'
  const one=(selector,root=document)=>root.querySelector(selector)
  const all=(selector,root=document)=>Array.from(root.querySelectorAll(selector))
  const reduced=matchMedia('(prefers-reduced-motion: reduce)')
  // Existing installed web apps retain their identity while moving to /dashboard/.
  if(location.pathname==='/'&&matchMedia('(display-mode: standalone)').matches){location.replace('/dashboard/'+location.search+location.hash);return}
  if('serviceWorker'in navigator)void navigator.serviceWorker.getRegistration('/').then(legacy=>{
    if(legacy?.scope===location.origin+'/'&&legacy.active?.scriptURL===location.origin+'/sw.js')void legacy.update().catch(()=>{})
  }).catch(()=>{})
  const nav=one('.navtoggle'),navMenu=one('#navmenu')
  function navClose(){navMenu?.classList.remove('on');nav?.setAttribute('aria-expanded','false')}
  nav?.addEventListener('click',()=>{const open=navMenu.classList.toggle('on');nav.setAttribute('aria-expanded',String(open))})
  all('a',navMenu).forEach(link=>link.addEventListener('click',navClose))
  function menusClose(){all('.dlgrp').forEach(group=>{group.classList.remove('open');one('.dlbtn',group).setAttribute('aria-expanded','false')})}
  all('.dlgrp').forEach(group=>{
    const button=one('.dlbtn',group)
    button.addEventListener('click',()=>{const open=!group.classList.contains('open');menusClose();group.classList.toggle('open',open);button.setAttribute('aria-expanded',String(open))})
    button.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();menusClose();group.classList.add('open');button.setAttribute('aria-expanded','true');one('[role="menuitem"]',group).focus()}})
    all('[role="menuitem"]',group).forEach((link,index,links)=>link.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();links[(index+(event.key==='ArrowDown'?1:links.length-1))%links.length].focus()}}))
  })
  document.addEventListener('click',event=>{if(!event.target.closest('.dlgrp'))menusClose();if(!event.target.closest('nav'))navClose()})

  let returnFocus=null,activeModal=null,toastTimer=null
  const toast=one('#dltoast')
  function toastHide(){toast?.classList.remove('on');toast?.setAttribute('aria-hidden','true');clearTimeout(toastTimer)}
  function fitTour(){const frame=one('#demofr');if(frame)frame.style.transform=`scale(${Math.min(innerWidth*.94/1280,innerHeight*.88/800,1)})`}
  function openModal(kind){
    closeModal(false);menusClose();navClose();returnFocus=document.activeElement
    activeModal=one(kind==='tour'?'#demomodal':'#instmodal')
    const frame=one('iframe',activeModal);frame.src=kind==='tour'?'demo.html?embed=1':'install.html?embed=1'
    activeModal.classList.add('on');activeModal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden'
    one('.demox',activeModal).focus();if(kind==='tour')fitTour()
  }
  function closeModal(restore=true){
    if(!activeModal)return
    activeModal.classList.remove('on');activeModal.setAttribute('aria-hidden','true')
    one('iframe',activeModal).src='about:blank';activeModal=null;document.body.style.overflow=''
    if(restore&&returnFocus?.isConnected)returnFocus.focus()
  }
  all('[data-demo],[data-install]').forEach(link=>link.addEventListener('click',event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();openModal(link.hasAttribute('data-demo')?'tour':'install')}))
  all('.demomodal,.pagemodal').forEach(modal=>{
    one('.demox',modal).addEventListener('click',()=>closeModal())
    modal.addEventListener('click',event=>{if(event.target===modal)closeModal()})
  })
  all('a[data-arch],a[data-default-download]').forEach(link=>link.addEventListener('click',()=>{menusClose();navClose();toast.classList.add('on');toast.setAttribute('aria-hidden','false');clearTimeout(toastTimer);toastTimer=setTimeout(toastHide,16000)}))
  one('#dltx')?.addEventListener('click',toastHide)
  one('#dlguide')?.addEventListener('click',()=>{toastHide();openModal('install')})
  addEventListener('keydown',event=>{
    if(event.key==='Escape'){closeModal();menusClose();navClose();toastHide()}
    if(event.key==='Tab'&&activeModal){const items=all('button,a,iframe',activeModal);const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
  })
  addEventListener('message',event=>{
    if(event.origin!==location.origin||!activeModal||event.source!==one('iframe',activeModal).contentWindow)return
    if(event.data?.applyVigilSite==='close-modal')closeModal()
    else if(event.data?.applyVigilSite==='show-download'){closeModal();one('#download').scrollIntoView({behavior:reduced.matches?'auto':'smooth'})}
  })
  addEventListener('message',event=>{
    const guide=event.data?.applyVigilInstallGuide
    if(event.origin!==location.origin||!guide)return
    const frame=all('[data-install-walkthrough]').find(frame=>frame.contentWindow===event.source)
    if(!frame)return
    if(guide.close===true){closeModal();return}
    if(Number.isFinite(guide.height)&&guide.height>=200&&guide.height<=1600)frame.style.height=`${Math.ceil(guide.height)}px`
  })
  if(location.hash==='#install')openModal('install')

  // Reference reveals: .85-second soft rise, once at 22% visibility.
  if(!reduced.matches&&typeof IntersectionObserver==='function'){
    const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('in');observer.unobserve(entry.target)}}),{threshold:.22})
    all('.io').forEach(element=>observer.observe(element))
  }else all('.io').forEach(element=>element.classList.add('in'))
  let queued=false
  function parallax(){queued=false;if(reduced.matches)return;all('.glow').forEach(glow=>{const rect=glow.parentElement.getBoundingClientRect(),p=(rect.top+rect.height/2-innerHeight/2)/innerHeight;glow.style.transform=`translate(-50%,calc(-50% + ${p*60}px))`})}
  addEventListener('scroll',()=>{if(!queued){queued=true;requestAnimationFrame(parallax)}},{passive:true})

  function fitSnaps(){all('.snap').forEach(wrapper=>{
    const frame=one('iframe',wrapper);if(!frame)return
    const width=Number(frame.dataset.w),height=Number(frame.dataset.h),parent=wrapper.parentElement,style=getComputedStyle(parent)
    // A mobile grid column can briefly collapse while its absolute iframe is resized.
    // The full-width block is the same stable fallback used by the reference site.
    const available=parent.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)||wrapper.closest('.block')?.clientWidth
    if(!available)return
    const scale=Math.min(Number(frame.dataset.maxScale)||1,available/width)
    wrapper.style.width=`${Math.round(width*scale)}px`;wrapper.style.height=`${Math.ceil(height*scale)}px`;frame.style.transform=`scale(${scale})`
  })}
  all('.snap iframe').forEach(frame=>frame.addEventListener('load',fitSnaps));fitSnaps()
  if(typeof ResizeObserver==='function')new ResizeObserver(fitSnaps).observe(document.body)
  addEventListener('resize',()=>{fitSnaps();fitTour();fitHero();paintWallpaper();parallax()})

  // Native details remain usable without JS; JS adds the reference's grid spring.
  all('.faq details').forEach(detail=>{
    let closeTimer
    one('summary',detail).addEventListener('click',event=>{
      if(reduced.matches){detail.classList.remove('faq-animated');return}
      detail.classList.add('faq-animated')
      event.preventDefault();clearTimeout(closeTimer)
      if(!detail.open){detail.open=true;requestAnimationFrame(()=>requestAnimationFrame(()=>detail.classList.add('op')))}
      else{detail.classList.remove('op');closeTimer=setTimeout(()=>{detail.open=false},360)}
    })
  })

  let playing=null
  all('[data-snd]').forEach(button=>button.addEventListener('click',async()=>{
    playing?.pause();all('[data-snd]').forEach(item=>item.classList.remove('playing'))
    playing=new Audio(`assets/sounds/${button.dataset.snd}.wav`);playing.volume=.35;button.classList.add('playing')
    playing.addEventListener('ended',()=>button.classList.remove('playing'),{once:true})
    try{await playing.play()}catch{button.classList.remove('playing')}
  }))
  document.addEventListener('visibilitychange',()=>{if(document.hidden){playing?.pause();all('[data-snd]').forEach(button=>button.classList.remove('playing'))}})

  const stage=one('#herostage'),cursor=one('#hcur'),pop=one('#hpop'),compact=one('#hifr'),notice=one('.hero-notification')
  let timers=[]
  const heroLoop=createReplayLoop({budget:pageReplayBudget(window,'hero'),replay:heroRun,onChange:()=>{
    if(stage){stage.dataset.playCount=String(heroLoop.plays);stage.dataset.replayWaiting=String(heroLoop.waiting)}
  }})
  function heroAvailability(){heroLoop.setEnabled(!document.hidden&&!reduced.matches)}
  document.addEventListener('visibilitychange',heroAvailability)
  reduced.addEventListener('change',heroAvailability)
  heroAvailability()
  function send(action,extra={}){for(const frame of [pop,compact])frame?.contentWindow?.postMessage({applyVigilPreview:{action,...extra}},location.origin)}
  function fitHero(){if(!stage)return;stage.style.setProperty('--tower-scale',Math.min(.66,(stage.clientHeight-58)/636,(stage.clientWidth-32)/460));compact.style.setProperty('--compact-scale',Math.min(1.1,(stage.clientWidth-20)/460))}
  function point(x,y){cursor.style.left=`${x}px`;cursor.style.top=`${y}px`}
  function trayPoint(){const a=stage.getBoundingClientRect(),b=one('.htray',stage).getBoundingClientRect();return[b.left-a.left+b.width/2,b.top-a.top+b.height/2]}
  function click(){cursor.classList.add('click');timers.push(setTimeout(()=>cursor.classList.remove('click'),500))}
  function later(delay,fn){timers.push(setTimeout(fn,delay))}
  function heroRun(){
    if(!stage)return
    heroLoop.begin()
    timers.forEach(clearTimeout);timers=[];stage.classList.remove('tower','settled');stage.classList.add('live');notice.classList.remove('on');cursor.classList.remove('on','click');send('reset');one('#hero-count').textContent='38 / 75';fitHero()
    if(reduced.matches){stage.classList.add('tower','settled');return}
    later(300,()=>{point(stage.clientWidth*.72,stage.clientHeight*.72);cursor.classList.add('on')})
    later(450,()=>point(...trayPoint()));later(2200,click);later(3200,()=>stage.classList.add('tower'))
    later(4000,()=>point(stage.clientWidth*.74,stage.clientHeight*.64));later(4700,()=>{click();send('add',{category:'easy',amount:1});one('#hero-count').textContent='39 / 75'})
    later(5700,()=>{send('add',{category:'external',amount:2});one('#hero-count').textContent='41 / 75'})
    later(6400,()=>cursor.classList.remove('on'));later(9800,()=>{send('add',{category:'easy',amount:5});one('#hero-count').textContent='46 / 75'})
    later(10600,()=>stage.classList.remove('tower'));later(11600,()=>{point(stage.clientWidth*.48,stage.clientHeight*.65);cursor.classList.add('on')})
    later(16200,()=>notice.classList.add('on'));later(20400,()=>{click();send('add',{category:'easy',amount:3});one('#hero-count').textContent='49 / 75'})
    later(22400,()=>{send('add',{category:'external',amount:1});one('#hero-count').textContent='50 / 75'})
    later(24100,()=>point(...trayPoint()));later(25250,click);later(25400,()=>stage.classList.add('tower'));later(26900,()=>notice.classList.remove('on'))
    later(30200,()=>cursor.classList.remove('on'));later(31000,()=>{stage.classList.add('settled');if(!reduced.matches)heroLoop.finish()})
  }
  one('#heroreplay')?.addEventListener('click',heroRun)
  if(stage){
    let started=false
    const initialHero=()=>{
      if(started||pop.contentDocument?.body?.dataset.preview!=='overview'||compact.contentDocument?.body?.dataset.preview!=='compact'||pop.contentDocument.readyState!=='complete'||compact.contentDocument.readyState!=='complete')return
      started=true;pop.removeEventListener('load',initialHero);compact.removeEventListener('load',initialHero);fitHero();heroRun()
    }
    pop.addEventListener('load',initialHero);compact.addEventListener('load',initialHero);initialHero();fitHero()
  }

  function paintWallpaper(){
    const canvas=one('#hwall');if(!canvas)return
    const width=canvas.parentElement.clientWidth,height=canvas.parentElement.clientHeight,ratio=Math.min(2,window.devicePixelRatio||1)
    canvas.width=width*ratio;canvas.height=height*ratio;const context=canvas.getContext('2d');context.setTransform(ratio,0,0,ratio,0,0);context.fillStyle='#050506';context.fillRect(0,0,width,height)
    function ribbon(cx,cy,radius,rotation,spacing,tone,spec){context.save();context.translate(cx,cy);context.rotate(rotation);for(let i=0;i<26;i++){const r=radius+i*spacing,gradient=context.createLinearGradient(-r,0,r,0);gradient.addColorStop(0,'rgba(0,0,0,0)');gradient.addColorStop(.35,`rgba(${tone},${.05+.012*Math.sin(i*.7)})`);gradient.addColorStop(.62,`rgba(${spec},${.05+.05*Math.max(0,Math.sin(i*.42+1.2))})`);gradient.addColorStop(1,'rgba(0,0,0,0)');context.strokeStyle=gradient;context.lineWidth=spacing*1.5;context.beginPath();context.arc(0,0,r,Math.PI*.95,Math.PI*1.85);context.stroke()}context.restore()}
    ribbon(width*.3,height*.95,height*.28,-.12,height*.016,'34,34,44','200,205,225');ribbon(width*.78,height*1.25,height*.42,-.55,height*.019,'28,28,36','185,190,215');ribbon(width*.05,height*.3,height*.2,.65,height*.013,'24,24,32','150,150,175')
    const vignette=context.createRadialGradient(width*.5,height*.45,height*.2,width*.5,height*.5,height*.95);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(1,'rgba(0,0,0,.55)');context.fillStyle=vignette;context.fillRect(0,0,width,height)
  }
  paintWallpaper();parallax()
  fetch('release.json').then(response=>response.ok?response.json():null).then(release=>{if(!release)return;all('[data-version]').forEach(element=>{element.textContent=release.version});all('[data-dlsize]').forEach(element=>{const asset=release.assets?.find(asset=>asset.architecture===element.dataset.dlsize&&asset.file.endsWith('.dmg'));if(asset)element.textContent=`${(asset.bytes/1048576).toFixed(1)} MB`})}).catch(()=>{})
})()

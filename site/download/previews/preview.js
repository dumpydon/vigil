/* Deterministic marketing demos. No storage, auth, native bridge, requests or telemetry. */
(function(){
  'use strict';
  const query=new URLSearchParams(location.search);
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const state={easy:26,external:12,goal:75},initial={...state},undo=[];
  let toastTimer,tipTimer,storyTimers=[],usageController=null;
  const all=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
  const one=(selector,root=document)=>root.querySelector(selector);
  const number=(value)=>Number(value).toLocaleString('en');
  const label=(category)=>category==='easy'?'LinkedIn Easy Apply':'External / form';
  function render(){
    if(usageController){usageController.render();return}
    const total=state.easy+state.external,remaining=Math.max(0,state.goal-total);
    const values={...state,total,remaining,alltime:3114+total-38};
    all('[data-count]').forEach(el=>{el.textContent=number(values[el.dataset.count])});
    const completed=Math.min(100,total/state.goal*100),left=Math.max(0,100-completed),rounded=Math.round(left);
    const color=rounded>=80?'#ef4444':rounded>=60?'#f87171':rounded>=40?'#fbbf24':rounded>=20?'#4ade80':'#3de045';
    all('[data-meter]').forEach(meter=>{
      meter.style.setProperty('--completed',completed+'%');meter.style.setProperty('--progress-color',color);
      one('[data-complete]',meter).textContent=Math.round(completed)+'%';
      one('[data-left]',meter).textContent=(left>0&&left<1?'<1':Math.round(left))+'%';
      one('[role="progressbar"]',meter).setAttribute('aria-valuenow',completed.toFixed(2));
    });
  }
  function message(text){
    const box=one('.demo-message');if(!box)return;
    one('[data-message]',box).textContent=text;box.classList.add('on');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.classList.remove('on'),2400);
  }
  function tip(text){const box=one('.demo-tip');if(!box)return;box.textContent=text;box.classList.add('on');clearTimeout(tipTimer);tipTimer=setTimeout(()=>box.classList.remove('on'),2600)}
  function pulse(){if(motion.matches)return;all('.metric,.category-count').forEach(el=>{el.classList.remove('pulse');void el.offsetWidth;el.classList.add('pulse')})}
  function add(category,amount){
    if(usageController){usageController.add(category,amount);return}
    if(!['easy','external'].includes(category)||!Number.isInteger(amount)||amount<1||amount>500)return;
    undo.push({...state});state[category]+=amount;render();pulse();message('Added '+number(amount)+' '+label(category)+' application'+(amount===1?'':'s'));
  }
  function dialog({title,description,fields=[],confirm='Save',danger=false,onConfirm}){
    if(one('.preview-dialog'))return;
    const d=document.createElement('dialog');d.className='preview-dialog';
    const form=document.createElement('form');form.method='dialog';
    const h=document.createElement('h2');h.textContent=title;form.append(h);
    if(description){const p=document.createElement('p');p.textContent=description;form.append(p)}
    fields.forEach(f=>{const l=document.createElement('label');l.textContent=f.label;const input=document.createElement('input');input.type='number';input.name=f.name;input.value=String(f.value);input.min=String(f.min??0);input.max=String(f.max??999);input.step='1';input.required=true;l.append(input);form.append(l)});
    const actions=document.createElement('div');actions.className='preview-dialog-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>d.close();actions.append(cancel);
    const save=document.createElement('button');save.type='submit';save.textContent=confirm;save.className=danger?'danger':'primary';actions.append(save);form.append(actions);
    form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;const values={};fields.forEach(f=>{values[f.name]=Number(form.elements.namedItem(f.name).value)});onConfirm(values);d.close()});
    d.append(form);document.body.append(d);d.addEventListener('close',()=>d.remove(),{once:true});d.addEventListener('click',e=>{const r=d.getBoundingClientRect();if(e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))d.close()});d.showModal();
  }
  all('[data-add]').forEach(b=>b.addEventListener('click',()=>add(b.dataset.add,Number(b.dataset.amount))));
  all('[data-undo]').forEach(b=>b.addEventListener('click',()=>{const previous=undo.pop();if(!previous){message('No new sample entry to undo');return}Object.assign(state,previous);render();message('Latest entry undone')}));
  all('[data-goal]').forEach(b=>b.addEventListener('click',()=>dialog({title:b.textContent.trim()==='Edit counts'?'Edit day counts':'Daily goal',description:'Try changing this sample. Your own records are never used in the preview.',fields:b.textContent.trim()==='Edit counts'?[{name:'easy',label:'LinkedIn Easy Apply',value:state.easy},{name:'external',label:'External / form',value:state.external}]:[{name:'goal',label:'Applications per day',value:state.goal,min:1,max:999}],onConfirm:values=>{undo.push({...state});Object.assign(state,values);render();message('Sample updated')}})));
  all('[data-custom]').forEach(b=>b.addEventListener('click',()=>{const category=b.dataset.custom;dialog({title:category==='mixed'?'Mixed batch':'Custom application count',fields:category==='mixed'?[{name:'easy',label:'LinkedIn Easy Apply',value:1},{name:'external',label:'External / form',value:1}]:[{name:'count',label:label(category)+' applications',value:1,min:1}],onConfirm:values=>{if(category==='mixed'){undo.push({...state});state.easy+=values.easy;state.external+=values.external;render();pulse();message('Mixed batch added')}else add(category,values.count)}})}));
  all('[data-preview-link]').forEach(b=>b.addEventListener('click',()=>{const next=b.dataset.previewLink;if(/^(overview|compact|usage|alerts|progress)\.html(?:\?sounds=1)?$/.test(next))location.href=next}));
  all('[data-about]').forEach(b=>b.addEventListener('click',()=>tip('Interactive preview · All counts shown are sample data')));
  all('[data-pin]').forEach(b=>b.addEventListener('click',()=>{const pinned=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(pinned));b.classList.toggle('active',pinned);b.title=pinned?'Unpin panel':'Keep panel open';tip(pinned?'Panel stays open while you work':'Panel closes when you click away')}));
  all('[data-entry-edit]').forEach(b=>b.addEventListener('click',()=>{const row=b.closest('[data-entry-row]'),count=one('[data-entry-count]',row);dialog({title:'Edit application entry',fields:[{name:'count',label:'Application count',value:Number(count.textContent.replace('+','')),min:1}],onConfirm:values=>{count.textContent='+'+values.count;message('Sample entry updated')}})}));
  all('[data-entry-delete]').forEach(b=>b.addEventListener('click',()=>dialog({title:'Delete this entry?',description:'Remove this sample application entry from the preview?',confirm:'Delete entry',danger:true,onConfirm:()=>{b.closest('[data-entry-row]').remove();message('Sample entry deleted')}})));
  if(document.body.dataset.preview==='usage')usageController=createUsageDemo();
  function read(card){card.classList.add('read');const b=one('[data-read]',card);if(b){b.textContent='✓';b.disabled=true;b.setAttribute('aria-label','Read')}}
  all('[data-read]').forEach(b=>b.addEventListener('click',()=>read(b.closest('.alert-card'))));one('[data-read-all]')?.addEventListener('click',()=>all('.alert-card').forEach(read));
  all('[data-alert-tab]').forEach(b=>b.addEventListener('click',()=>{all('[data-alert-tab]').forEach(x=>x.classList.toggle('on',x===b));all('.alert-card').forEach(card=>{card.style.display=b.dataset.alertTab==='activity'&&!card.classList.contains('read')?'none':''});if(b.dataset.alertTab==='activity'&&!one('.alert-card.read'))tip('Nothing read yet. Read alerts will appear here.')}));
  one('[data-pause]')?.addEventListener('click',e=>{const b=e.currentTarget,pause=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(pause));b.style.color=pause?'#fbbf24':'';tip(pause?'New alerts are paused for today · UTC':'Alerts resumed')});
  if(query.get('sounds')==='1'){document.body.classList.add('sound-mode');one('.sound-panel')?.removeAttribute('hidden')}
  all('[data-sound]').forEach(b=>b.addEventListener('click',()=>{all('[data-sound]').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-checked',String(x===b))});one('[data-sound-label]').textContent=b.dataset.sound+' selected · visual preview'}));
  function reset(){Object.assign(state,initial);undo.length=0;if(usageController)usageController.reset();render();one('.demo-message')?.classList.remove('on');one('.virtual-cursor')?.classList.remove('on')}
  function story(){if(motion.matches)return;storyTimers.forEach(clearTimeout);storyTimers=[];reset();const cursor=one('.virtual-cursor'),target=one('[data-add="easy"][data-amount="1"]');if(!cursor||!target)return;const r=target.getBoundingClientRect(),p=cursor.parentElement.getBoundingClientRect();cursor.style.left=(r.left-p.left+r.width/2)+'px';cursor.style.top=(r.top-p.top+r.height/2)+'px';storyTimers.push(setTimeout(()=>cursor.classList.add('on'),500),setTimeout(()=>{cursor.classList.add('click');add('easy',1)},1500),setTimeout(()=>cursor.classList.remove('click'),1700),setTimeout(()=>{const next=one('[data-add="external"][data-amount="2"]');if(!next)return;const n=next.getBoundingClientRect();cursor.style.left=(n.left-p.left+n.width/2)+'px';cursor.style.top=(n.top-p.top+n.height/2)+'px'},2600),setTimeout(()=>{cursor.classList.add('click');add('external',2)},3600),setTimeout(()=>cursor.classList.remove('click'),3800),setTimeout(()=>cursor.classList.remove('on'),4600))}
  if(query.get('animate')==='1'&&!motion.matches){if(typeof IntersectionObserver==='function'){const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){story();observer.disconnect()}},{threshold:.2});observer.observe(one('.surface'))}else story()}
  // Optional same-origin parent orchestration for the landing page's cinematic hero.
  addEventListener('message',event=>{if(event.source!==parent||event.origin!==location.origin)return;const data=event.data?.applyVigilPreview;if(!data||typeof data!=='object')return;if(data.action==='reset')reset();else if(data.action==='play')story();else if(data.action==='add')add(data.category,data.amount);else if(data.action==='tooltip'){usageController?.tooltip('2026-10-09')}else if(data.action==='alert')message('Sample goal update · 38 of 75 today')});

  // BEGIN SAMPLE MODEL — fixed UTC data, shared by every section of the Usage media.
  function makeUsageSample(){
    const today='2026-10-14',now='2026-10-14T16:30:00.000Z',first='2026-08-15';
    const shift=(day,amount)=>new Date(Date.parse(day+'T00:00:00Z')+amount*86400000).toISOString().slice(0,10);
    const recent=[[37,16],[43,19],[29,14],[45,16],[51,24],[33,18],[26,12]];
    const seeds=Array.from({length:61},(_,i)=>{
      const offset=60-i,counts=offset<=6?recent[6-offset]:[18+(offset*19+7)%37,6+(offset*7+3)%16];
      return {date:shift(today,-offset),easy:counts[0],external:counts[1]};
    });
    let serial=0,entries=[],goals=new Map();
    function entry(date,category,amount,time){return {id:'sample-'+(++serial),date,easy:category==='easy'?amount:0,external:category==='external'?amount:0,loggedAt:date+'T'+time+':00.000Z',deleted:false,backdated:false}}
    seeds.forEach(day=>{
      if(day.date===today){
        [[5,'14:24'],[3,'13:41'],[5,'11:36'],[5,'10:05'],[5,'09:40'],[3,'08:19']].forEach(([n,t])=>entries.push(entry(day.date,'easy',n,t)));
        [[2,'13:58'],[4,'12:10'],[3,'10:44'],[3,'09:12']].forEach(([n,t])=>entries.push(entry(day.date,'external',n,t)));
      }else{
        ['easy','external'].forEach((category,c)=>{let remaining=day[category],i=0;while(remaining){const count=Math.min(5,remaining),hour=8+Math.floor(i/2),minute=(i*13+c*7+day.date.charCodeAt(9))%60;entries.push(entry(day.date,category,count,String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')));remaining-=count;i++}});
      }
    });
    const baseline=entries.map(e=>({...e}));
    function active(){return entries.filter(e=>!e.deleted).sort((a,b)=>b.loggedAt.localeCompare(a.loggedAt)||b.id.localeCompare(a.id))}
    function counts(date){let easy=0,external=0;entries.forEach(e=>{if(!e.deleted&&e.date===date){easy+=e.easy;external+=e.external}});return {date,easy,external,total:easy+external,goal:goals.get(date)||75}}
    function range(days){return Array.from({length:days},(_,i)=>counts(shift(today,i-days+1)))}
    function windowCounts(start,end,includeToday=false){let easy=0,external=0;entries.forEach(e=>{if(!e.deleted&&e.date>=start&&(includeToday?e.date<=end:e.date<end)){easy+=e.easy;external+=e.external}});return {easy,external,total:easy+external}}
    function change(current,previous){if(current===previous)return {kind:'same',text:'0%'};if(previous===0)return {kind:'new',text:'New'};const amount=Math.abs((current-previous)/previous*100);return {kind:current>previous?'increase':'decrease',text:amount<1?'<1%':Math.round(amount)+'%'}}
    function periods(){
      const rows=[{id:'today',label:'Today · so far',description:'Today from 00:00 UTC through 16:30 UTC. Today is unfinished, so no comparison is shown.',start:today,end:today,counts:windowCounts(today,today,true)}];
      [['yesterday','Yesterday',1,'The last completed UTC day, compared with the UTC day before it.'],['week','Last 7 days',7,'Seven completed UTC days, excluding today. Compared with the preceding seven completed UTC days.'],['month30','Last 30 days',30,'Thirty completed UTC days, excluding today. Compared with the preceding thirty completed UTC days.']].forEach(([id,label,days,description])=>{
        const start=shift(today,-days),previousStart=shift(today,-days*2),current=windowCounts(start,today),previous=windowCounts(previousStart,start);
        rows.push({id,label,description,start,end:today,counts:current,comparison:{start:previousStart,end:start,counts:previous,change:change(current.total,previous.total)}});
      });
      rows.push({id:'month',label:'This month',description:'The current UTC calendar month from October 1 through October 14 at 16:30 UTC. No month comparison is shown.',start:'2026-10-01',end:today,counts:windowCounts('2026-10-01',today,true)});
      return {rows,pace:Math.round(rows[4].counts.total/13.6875*31)};
    }
    function closedAverage(days){const closed=range(days).filter(d=>d.date<today);return closed.length?closed.reduce((n,d)=>n+d.total,0)/closed.length:null}
    function streak(){let cursor=counts(today).total>=counts(today).goal?today:shift(today,-1),n=0;while(cursor>=first&&counts(cursor).total>=counts(cursor).goal){n++;cursor=shift(cursor,-1)}return n}
    function hourly(date){const hours=Array(24).fill(0);let backdated=0,otherDates=0;entries.forEach(e=>{if(e.deleted)return;if(e.loggedAt.slice(0,10)===date){hours[new Date(e.loggedAt).getUTCHours()]+=e.easy+e.external;if(e.backdated||e.date!==date)backdated+=e.easy+e.external}else if(e.date===date)otherDates+=e.easy+e.external});return {hours,backdated,otherDates}}
    function add(category,amount,date=today){if(!['easy','external'].includes(category)||!Number.isInteger(amount)||amount<1||amount>999)return false;const e=entry(date,category,amount,'16:30');e.loggedAt=now;e.backdated=date!==today;entries.push(e);return true}
    function adjustDay(date,easy,external){
      const before=counts(date);let removeEasy=Math.max(0,before.easy-easy),removeExternal=Math.max(0,before.external-external);
      active().filter(e=>e.date===date).forEach(e=>{const rEasy=Math.min(e.easy,removeEasy),rExternal=Math.min(e.external,removeExternal);e.easy-=rEasy;e.external-=rExternal;removeEasy-=rEasy;removeExternal-=rExternal;if(e.easy+e.external===0)e.deleted=true});
      if(easy>before.easy)add('easy',easy-before.easy,date);if(external>before.external)add('external',external-before.external,date);
    }
    function update(id,values){const e=entries.find(e=>e.id===id&&!e.deleted);if(!e)return false;if(values.easy!==undefined)e.easy=values.easy;if(values.external!==undefined)e.external=values.external;if(e.easy+e.external===0)e.deleted=true;return true}
    function remove(id){const e=entries.find(e=>e.id===id&&!e.deleted);if(!e)return false;e.deleted=true;return true}
    function undoLatest(){const last=active()[0];return last?remove(last.id):false}
    function reset(){entries=baseline.map(e=>({...e}));goals=new Map()}
    return {today,now,first,shift,counts,range,periods,closedAverage,streak,hourly,active,add,adjustDay,update,remove,undoLatest,reset};
  }
  // END SAMPLE MODEL

  function createUsageDemo(){
    const model=makeUsageSample(),view=one('.usage-scroll'),plot=one('[data-chart-plot]'),tooltip=one('.demo-tooltip');
    let days=7,selected=null,visible=10,pinnedTooltip=null,openPeriod=null;
    const short=(date)=>new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
    const long=(date)=>new Date(date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:'UTC'});
    const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node};
    const selectedDay=()=>selected||model.today;
    function showTooltip(bar){
      if(!bar||!tooltip)return;
      const day=model.counts(bar.dataset.chartDay);
      one('[data-tip-date]',tooltip).textContent=new Date(day.date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})+' · UTC';
      one('[data-tip-total]',tooltip).textContent=number(day.total);one('[data-tip-easy]',tooltip).textContent=number(day.easy);one('[data-tip-external]',tooltip).textContent=number(day.external);one('[data-tip-goal]',tooltip).textContent=number(day.goal);one('[data-tip-percentage]',tooltip).textContent=(day.total/day.goal*100).toFixed(1)+'%';
      const rect=bar.getBoundingClientRect(),bounds=bar.closest('.chart-wrap').getBoundingClientRect();tooltip.style.left=Math.max(113,Math.min(bounds.width-113,rect.left-bounds.left+rect.width/2))+'px';tooltip.classList.add('on');
      all('[data-chart-day]').forEach(x=>x.classList.toggle('hot',x===bar));
    }
    function hideTooltip(force=false){if(!force&&(pinnedTooltip||query.get('tooltip')==='1'))return;tooltip.classList.remove('on');all('[data-chart-day]').forEach(x=>x.classList.remove('hot'));if(force)pinnedTooltip=null}
    function renderChart(){
      const current=model.range(days),maximum=25*Math.ceil(Math.max(25,...current.map(d=>Math.max(d.total,d.goal)))/25),axisStep=Math.max(25,25*Math.ceil(maximum/3/25));
      const ticks=[];for(let i=0;i<=maximum;i+=axisStep)ticks.push(i);if(ticks[ticks.length-1]!==maximum)ticks.push(maximum);
      one('.axis-y').replaceChildren(...ticks.reverse().map(n=>el('span','',number(n))));
      plot.style.gap=days===7?'7px':days===15?'4px':'2px';plot.style.setProperty('--grid-step',(100/(ticks.length-1))+'%');plot.setAttribute('aria-label','Applications over '+days+' UTC days');
      const focused=document.activeElement?.dataset.chartDay,fragment=document.createDocumentFragment();
      current.forEach(day=>{
        const b=el('button','chart-bar'+(selected===day.date?' selected':'')+(day.total===0?' empty':''));b.type='button';b.dataset.chartDay=day.date;
        b.style.setProperty('--easy-height',day.easy/maximum*100+'%');b.style.setProperty('--external-height',day.external/maximum*100+'%');b.style.setProperty('--goal-height',day.goal/maximum*100+'%');
        b.setAttribute('aria-label',long(day.date)+' UTC. '+number(day.total)+' applications: '+number(day.easy)+' Easy Apply, '+number(day.external)+' External. Goal '+day.goal+'. Open day history.');
        b.setAttribute('aria-describedby','usage-chart-tooltip');if(selected===day.date)b.setAttribute('aria-pressed','true');
        if(day.external)b.append(el('i','external'));if(day.easy)b.append(el('i','easy'+(day.external?'':' top')));fragment.append(b);
      });
      plot.replaceChildren(fragment);
      const indices=days===7?[0,2,4,6]:days===15?[0,5,10,14]:[0,10,20,29];one('.axis-x').replaceChildren(...indices.map(i=>el('span','',short(current[i].date))));
      const summary=one('[data-chart-summary]');summary.replaceChildren(el('strong','',number(current.reduce((n,d)=>n+d.total,0))),document.createTextNode(' applications in this view · '+days+' UTC days'));
      if(focused)one('[data-chart-day="'+focused+'"]')?.focus({preventScroll:true});
      const pinned=pinnedTooltip||query.get('tooltip')==='1'&&'2026-10-09';if(pinned){const target=one('[data-chart-day="'+pinned+'"]');if(target)showTooltip(target);else hideTooltip(true)}else hideTooltip();
    }
    function renderDay(){
      const date=selectedDay(),day=model.counts(date);one('[data-selected-date]').textContent=long(date);one('[data-selected-total]').textContent=number(day.total);one('[data-selected-easy]').textContent=number(day.easy);one('[data-selected-external]').textContent=number(day.external);one('[data-day-picker]').value=date;one('[data-past-day-note]').hidden=date===model.today;
      one('[data-day-step="-1"]').disabled=date<=model.first;one('[data-day-step="1"]').disabled=date>=model.today;
    }
    function renderPeriods(){
      const summary=model.periods(),group=one('[data-period-rows]'),fragment=document.createDocumentFragment();
      summary.rows.forEach(row=>{
        const line=el('div','period-row');line.setAttribute('role','row');const labelNode=el('span','period-label',row.label);labelNode.setAttribute('role','rowheader');labelNode.title=row.description;line.append(labelNode);
        const changeCell=el('div','period-change-cell');changeCell.setAttribute('role','cell');
        if(row.comparison){
          const change=row.comparison.change,b=el('button','period-change '+change.kind);b.type='button';b.dataset.period=row.id;b.setAttribute('aria-expanded',String(openPeriod===row.id));b.setAttribute('aria-controls','period-'+row.id);b.setAttribute('aria-label',row.label+' change: '+change.text+'. Show UTC comparison details.');
          if(['increase','decrease'].includes(change.kind))b.append(el('span','period-arrow',change.kind==='increase'?'▲':'▼'));b.append(document.createTextNode(change.text));changeCell.append(b);
        }else changeCell.setAttribute('aria-label','No comparison for this unfinished period');
        const total=el('strong','period-total',number(row.counts.total));total.setAttribute('role','cell');
        const breakdown=el('div','period-breakdown');breakdown.setAttribute('role','cell');breakdown.append(el('span','easy-text',number(row.counts.easy)+' Easy'),el('span','period-separator','·'),el('span','external-text',number(row.counts.external)+' External'));
        line.append(changeCell,total,breakdown);
        if(row.comparison){
          const details=el('div','period-comparison');details.id='period-'+row.id;details.setAttribute('role','tooltip');details.hidden=openPeriod!==row.id;
          details.append(el('strong','',row.label+' · UTC'),el('p','',row.description));
          const current=el('p','', 'Current: '+number(row.counts.total)+' applications');current.append(el('small','',short(row.start)+' 00:00 UTC → '+short(row.end)+' 00:00 UTC (end excluded)'));
          const previous=el('p','', 'Previous: '+number(row.comparison.counts.total)+' applications');previous.append(el('small','',short(row.comparison.start)+' 00:00 UTC → '+short(row.comparison.end)+' 00:00 UTC (end excluded)'));details.append(current,previous);line.append(details);
        }
        fragment.append(line);
      });
      group.replaceChildren(fragment);const pace=one('[data-period-pace]');pace.replaceChildren(document.createTextNode('Current pace: ~ '),el('strong','',number(summary.pace)),document.createTextNode(' applications/month'));pace.title='Simple pace estimate: month-to-date applications divided by elapsed fractional UTC days, multiplied by 31 days. Sample time: October 14 at 16:30 UTC.';
    }
    function showPeriod(id,open){openPeriod=open?id:null;all('[data-period]').forEach(b=>{const show=open&&b.dataset.period===id;b.setAttribute('aria-expanded',String(show));document.getElementById(b.getAttribute('aria-controls')).hidden=!show})}
    function renderHours(){
      const date=selectedDay(),hourly=model.hourly(date),maximum=Math.max(1,...hourly.hours),container=one('[data-hour-bars]');
      one('[data-hour-date]').textContent='UTC · '+short(date);one('[data-hour-today]').hidden=!selected;
      container.replaceChildren(...hourly.hours.map((n,i)=>{const bar=el('div'),fill=el('i');fill.style.height=n?n/maximum*100+'%':'0';bar.title=String(i).padStart(2,'0')+':00 UTC · '+number(n)+' applications';bar.append(fill);return bar}));
      container.setAttribute('aria-label','Applications logged by UTC hour on '+date+': '+hourly.hours.map((n,i)=>i+':00 '+n).join(', '));
      let note='When you logged, not when you submitted.';if(hourly.backdated)note+=' Includes '+number(hourly.backdated)+' applications assigned to an earlier date.';if(hourly.otherDates)note+=' '+number(hourly.otherDates)+' applications assigned to this day were logged on other dates.';one('[data-hour-note]').textContent=note;
    }
    function renderEntries(){
      const allEntries=model.active(),current=selected?allEntries.filter(e=>e.date===selected):allEntries,container=one('[data-entry-list]');
      one('[data-recent-title]').textContent=selected?'Entries · '+short(selected):'Recent entries';one('[data-entry-filter]').value=selected||'';one('[data-all-entries]').hidden=!selected;one('[data-active-entry-count]').textContent=selected?'':number(allEntries.length)+' active entries';
      one('[data-usage-undo]').disabled=!allEntries.length;
      if(!current.length){const empty=el('div','entries-empty','No applications assigned to this UTC day.');empty.append(el('p','', 'Choose another day to review its sample entries.'));container.replaceChildren(empty)}else{
        const fragment=document.createDocumentFragment();current.slice(0,visible).forEach(e=>{
          const row=el('div','entry-row');row.dataset.entryId=e.id;const time=el('div','entry-time',e.loggedAt.slice(11,16)+' UTC');time.append(el('small','',short(e.date)+(e.backdated?' · backdated':'')));
          const detail=el('div','entry-detail'),category=e.easy&&e.external?'mixed':e.easy?'easy':'external',copy=el('span','entry-label '+(category==='mixed'?'':category+'-text'),category==='mixed'?'Easy '+e.easy+' + External '+e.external:label(category));detail.append(copy);
          const count=el('strong',category==='mixed'?'':category+'-text','+'+number(e.easy+e.external)),actions=el('div','entry-actions');
          [['edit','Edit'],['delete','Delete']].forEach(([action,text])=>{const button=el('button','',text);button.type='button';button.dataset.usageEntryAction=action;button.setAttribute('aria-label',text+' '+label(category)+' sample entry at '+e.loggedAt);actions.append(button)});
          row.append(time,detail,count,actions);fragment.append(row);
        });container.replaceChildren(fragment);
      }
      one('[data-more-entries]').hidden=current.length<=visible;
    }
    function render(){
      const today=model.counts(model.today);state.easy=today.easy;state.external=today.external;state.goal=today.goal;
      renderDay();renderChart();renderPeriods();renderHours();renderEntries();
      const average=model.closedAverage(days),streak=model.streak();one('[data-closed-average]').textContent=average===null?'—':average.toFixed(1);one('[data-goal-streak]').textContent=streak+' '+(streak===1?'day':'days');
    }
    function chooseDay(date,{scroll=false}={}){
      if(date!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<model.first||date>model.today))return;
      selected=date;visible=10;render();
      if(scroll){const card=one('.usage-day-history'),offset=card.getBoundingClientRect().top-view.getBoundingClientRect().top+view.scrollTop-12;view.scrollTo({top:Math.max(0,offset),behavior:motion.matches?'auto':'smooth'})}
    }
    plot.addEventListener('pointerover',event=>{const bar=event.target.closest('[data-chart-day]');if(bar&&!pinnedTooltip)showTooltip(bar)});
    plot.addEventListener('focusin',event=>{const bar=event.target.closest('[data-chart-day]');if(bar)showTooltip(bar)});
    plot.addEventListener('focusout',()=>hideTooltip());one('.chart-wrap').addEventListener('pointerleave',()=>hideTooltip());
    plot.addEventListener('click',event=>{const bar=event.target.closest('[data-chart-day]');if(!bar)return;pinnedTooltip=bar.dataset.chartDay;chooseDay(pinnedTooltip);showTooltip(one('[data-chart-day="'+pinnedTooltip+'"]'))});
    plot.addEventListener('keydown',event=>{
      const bar=event.target.closest('[data-chart-day]');if(!bar)return;
      if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();const bars=all('[data-chart-day]',plot),index=bars.indexOf(bar)+(event.key==='ArrowRight'?1:-1);pinnedTooltip=null;bars[Math.max(0,Math.min(bars.length-1,index))]?.focus({preventScroll:true})}
      if(event.key==='Enter'||event.key===' '){event.preventDefault();pinnedTooltip=bar.dataset.chartDay;chooseDay(pinnedTooltip)}
      if(event.key==='Escape'){hideTooltip(true);event.stopPropagation()}
    });
    all('[data-range]').forEach(b=>b.addEventListener('click',()=>{days=Number(b.dataset.range);all('[data-range]').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',String(x===b))});pinnedTooltip=null;render()}));
    all('[data-day-step]').forEach(b=>b.addEventListener('click',()=>chooseDay(model.shift(selectedDay(),Number(b.dataset.dayStep)))));
    all('[data-day-today],[data-hour-today],[data-all-entries]').forEach(b=>b.addEventListener('click',()=>chooseDay(null)));
    one('[data-day-picker]').addEventListener('change',event=>{if(event.target.value)chooseDay(event.target.value)});one('[data-entry-filter]').addEventListener('change',event=>chooseDay(event.target.value||null));
    one('[data-day-edit]').addEventListener('click',()=>{const date=selectedDay(),day=model.counts(date);dialog({title:'Edit day counts · '+short(date)+' UTC',description:date===model.today?'Change the counts for this sample day.': 'Review the sample counts before changing a past UTC day.',fields:[{name:'easy',label:'LinkedIn Easy Apply',value:day.easy},{name:'external',label:'External / form',value:day.external}],onConfirm:values=>{model.adjustDay(date,values.easy,values.external);render();message('Sample day counts updated')}})});
    one('[data-usage-undo]').addEventListener('click',()=>{if(model.undoLatest()){render();message('Latest sample entry undone')}});
    one('[data-more-entries]').addEventListener('click',()=>{visible+=10;renderEntries()});
    one('[data-entry-list]').addEventListener('click',event=>{
      const b=event.target.closest('[data-usage-entry-action]');if(!b)return;
      const row=b.closest('[data-entry-id]'),entry=model.active().find(e=>e.id===row.dataset.entryId);if(!entry)return;
      if(b.dataset.usageEntryAction==='edit'){
        const fields=[];if(entry.easy)fields.push({name:'easy',label:'LinkedIn Easy Apply',value:entry.easy,min:entry.external?0:1});if(entry.external)fields.push({name:'external',label:'External / form',value:entry.external,min:entry.easy?0:1});
        dialog({title:'Edit application entry',description:short(entry.date)+' UTC · '+entry.loggedAt.slice(11,16)+' logged',fields,onConfirm:values=>{model.update(entry.id,values);render();message('Sample entry updated')}});
      }else dialog({title:'Delete this entry?',description:'Remove '+number(entry.easy+entry.external)+' applications from '+short(entry.date)+' UTC in this preview?',confirm:'Delete entry',danger:true,onConfirm:()=>{model.remove(entry.id);render();message('Sample entry deleted')}});
    });
    one('[data-period-rows]').addEventListener('click',event=>{const b=event.target.closest('[data-period]');if(b)showPeriod(b.dataset.period,true)});
    one('[data-period-rows]').addEventListener('pointerover',event=>{const b=event.target.closest('[data-period]');if(b&&!b.contains(event.relatedTarget))showPeriod(b.dataset.period,true)});
    one('[data-period-rows]').addEventListener('pointerout',event=>{const b=event.target.closest('[data-period]');if(b&&!b.contains(event.relatedTarget)&&document.activeElement!==b)showPeriod(b.dataset.period,false)});
    one('[data-period-rows]').addEventListener('focusin',event=>{const b=event.target.closest('[data-period]');if(b)showPeriod(b.dataset.period,true)});
    one('[data-period-rows]').addEventListener('focusout',event=>{const b=event.target.closest('[data-period]');if(b&&!b.parentElement.parentElement.contains(event.relatedTarget))showPeriod(b.dataset.period,false)});
    view.addEventListener('keydown',event=>{if(event.key==='Escape'){hideTooltip(true);showPeriod(null,false)}});
    view.addEventListener('scroll',()=>hideTooltip(),{passive:true});
    render();
    return {render,add:(category,amount)=>{if(model.add(category,amount)){render();message('Added '+number(amount)+' '+label(category)+' applications')}},reset:()=>{model.reset();days=7;selected=null;visible=10;pinnedTooltip=null;openPeriod=null;all('[data-range]').forEach(b=>{b.classList.toggle('on',b.dataset.range==='7');b.setAttribute('aria-pressed',String(b.dataset.range==='7'))});view.scrollTop=0;render()},tooltip:date=>showTooltip(one('[data-chart-day="'+date+'"]'))};
  }

  render();
})();

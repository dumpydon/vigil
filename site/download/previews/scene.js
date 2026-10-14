(() => {const canvas=document.querySelector('[data-wallpaper]');if(canvas){const x=canvas.getContext('2d');canvas.width=1540;canvas.height=1184;x.scale(2,2);x.fillStyle='#060608';x.fillRect(0,0,770,592);for(let i=0;i<45;i++){const r=180+i*8,g=x.createLinearGradient(0,100,770,592);g.addColorStop(0,'rgba(135,139,170,.01)');g.addColorStop(.5,'rgba(182,187,211,.06)');g.addColorStop(1,'rgba(100,110,150,0)');x.strokeStyle=g;x.lineWidth=11;x.beginPath();x.ellipse(370,640,r,r*.9,-.5,Math.PI,Math.PI*1.9);x.stroke()}}})();
// Keep the illustrative menu-bar count in sync with its own quick-add card.
addEventListener('message',event=>{
  const frame=document.querySelector('.scene-compact'),counts=event.data?.applyVigilLogging;
  if(event.origin!==location.origin||event.source!==frame?.contentWindow||!counts)return;
  if(![counts.total,counts.goal].every(value=>Number.isInteger(value)&&value>=0&&value<=100000))return;
  document.querySelector('[data-scene-total]').textContent=counts.total.toLocaleString('en');
  document.querySelector('[data-scene-goal]').textContent=counts.goal.toLocaleString('en');
});

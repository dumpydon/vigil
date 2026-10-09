export default function RemainingProgress({remaining,goal}:{remaining:number;goal:number}) {
  const fraction=Math.min(1,Math.max(0,remaining/goal)),percentage=fraction*100
  const label=percentage>0&&percentage<1?'<1':String(Math.round(percentage)),detail=Number(percentage.toFixed(2))
  return <div className="remaining-progress">
    <div className="progress-wrap">
      <i className="progress-marker" aria-hidden="true" style={{left:`clamp(.3125rem, ${percentage}%, calc(100% - .3125rem))`}}/>
      <div className="progress" role="progressbar" aria-label="Daily goal remaining" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} aria-valuetext={`${remaining.toLocaleString('en')} applications remaining of ${goal.toLocaleString('en')}, ${detail} percent left`}>
        <i style={{width:`${percentage}%`}}/>
      </div>
    </div>
    <span className="progress-left" title={`${detail}% of your daily goal remains`}>{label}% left</span>
  </div>
}

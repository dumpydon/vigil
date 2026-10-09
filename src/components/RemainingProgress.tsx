import { progressTone } from '../utils/progress'

export default function RemainingProgress({remaining,goal}:{remaining:number;goal:number}) {
  const fraction=Math.min(1,Math.max(0,remaining/goal)),percentage=fraction*100,completedPercentage=100-percentage
  const label=percentage>0&&percentage<1?'<1':String(Math.round(percentage)),detail=Number(percentage.toFixed(2))
  const markerPosition={left:`clamp(.3125rem, ${completedPercentage}%, calc(100% - .3125rem))`}
  return <div className="remaining-progress" data-tone={progressTone(percentage)}>
    <div className="progress-wrap">
      <span className="progress-done" aria-hidden="true" style={markerPosition}>{Math.round(completedPercentage)}%</span>
      <i className="progress-marker" aria-hidden="true" style={markerPosition}/>
      <div className="progress" role="progressbar" aria-label="Daily goal progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completedPercentage} aria-valuetext={`${Number(completedPercentage.toFixed(2))} percent complete; ${remaining.toLocaleString('en')} applications remaining of ${goal.toLocaleString('en')}, ${detail} percent left`}>
        <i style={{width:`${completedPercentage}%`}}/>
      </div>
    </div>
    <span className="progress-left" title={`${detail}% of your daily goal remains`}>{label}% left</span>
  </div>
}

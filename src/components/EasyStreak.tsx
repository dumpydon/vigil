import type {easyApplyStreak} from '../../shared/model'

export default function EasyStreak({streak}:{streak:ReturnType<typeof easyApplyStreak>}){
  const percentage=Math.round(streak.fraction*100),count=streak.days.toLocaleString('en')
  const label=`${count}-day Easy Apply streak. ${streak.todayEasy} of ${streak.target} Easy Apply applications today; ${percentage}% complete.`
  return <div className={`easy-streak${streak.reached?' reached':''}`} role="img" aria-label={label} title={`${label}\n20 or more Easy Apply applications qualify a day. External/form applications do not count. Today joins the streak at 20; an unfinished today keeps yesterday’s streak.`}>
    <div className="easy-streak-ring">
      <svg viewBox="0 0 48 48" aria-hidden="true"><circle className="easy-streak-track" cx="24" cy="24" r="20"/><circle className="easy-streak-fill" cx="24" cy="24" r="20" pathLength="100" strokeDasharray="100" strokeDashoffset={100-percentage} style={{opacity:percentage?1:0}}/></svg>
      <strong data-testid="easy-streak-days">{count}</strong>
    </div>
    <span className="easy-streak-label">Easy streak</span>
    <span className="visually-hidden" data-testid="easy-streak-today">{streak.todayEasy}/{streak.target}</span>
  </div>
}

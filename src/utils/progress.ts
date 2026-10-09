export type ProgressTone='deep-red'|'red'|'amber'|'light-green'|'green'

// Match the displayed whole percentage at band boundaries.
export function progressTone(remainingPercentage:number):ProgressTone {
  const displayed=Math.round(remainingPercentage)
  if(displayed>=80)return 'deep-red'
  if(displayed>=60)return 'red'
  if(displayed>=40)return 'amber'
  if(displayed>=20)return 'light-green'
  return 'green'
}

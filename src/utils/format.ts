export const shortDate=(day:string)=>new Intl.DateTimeFormat('en',{timeZone:'UTC',month:'short',day:'numeric'}).format(new Date(day+'T00:00:00Z'))
export const longDate=(day:string)=>new Intl.DateTimeFormat('en',{timeZone:'UTC',weekday:'short',month:'short',day:'numeric',year:'numeric'}).format(new Date(day+'T00:00:00Z'))
export function headerDate(day:string){return new Date(`${day}T12:00:00.000Z`).toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric'})}

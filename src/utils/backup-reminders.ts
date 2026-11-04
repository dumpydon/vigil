/** Lifetime active application totals, independent of the selected day/range. */
export const BACKUP_MILESTONES=[5,10,15,20,30,40,50,60,75,90,100] as const
export interface BackupReminderState {version:1;highestShown:number}
export const EMPTY_BACKUP_REMINDER:BackupReminderState={version:1,highestShown:0}
export function readBackupReminder(value:unknown):BackupReminderState{
  if(!value||typeof value!=='object')return {...EMPTY_BACKUP_REMINDER}
  const state=value as Partial<BackupReminderState>
  return state.version===1&&Number.isInteger(state.highestShown)&&[0,...BACKUP_MILESTONES].includes(state.highestShown!)?{version:1,highestShown:state.highestShown!}:{...EMPTY_BACKUP_REMINDER}
}
export function nextBackupReminder(total:number,state:BackupReminderState,googleLinked:boolean):number|null{
  if(googleLinked||!Number.isSafeInteger(total)||total<0)return null
  const highest=BACKUP_MILESTONES.filter(count=>count<=total).at(-1)
  return highest!==undefined&&highest>state.highestShown?highest:null
}
export function acknowledgeBackupReminder(state:BackupReminderState,milestone:number):BackupReminderState{
  if(!(BACKUP_MILESTONES as readonly number[]).includes(milestone))return state
  return {version:1,highestShown:Math.max(state.highestShown,milestone)}
}

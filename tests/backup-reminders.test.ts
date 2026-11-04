import {describe,it,expect} from 'vitest'
import {BACKUP_MILESTONES,EMPTY_BACKUP_REMINDER,acknowledgeBackupReminder,nextBackupReminder,readBackupReminder} from '../src/utils/backup-reminders'
describe('optional Google backup reminders',()=>{
  it('uses the requested lifetime milestones and has no first-open prompt',()=>{
    let state={...EMPTY_BACKUP_REMINDER}
    expect(nextBackupReminder(0,state,false)).toBeNull()
    for(const milestone of BACKUP_MILESTONES){
      expect(nextBackupReminder(milestone-1,state,false)).toBeNull()
      expect(nextBackupReminder(milestone,state,false)).toBe(milestone)
      state=acknowledgeBackupReminder(state,milestone)
      expect(nextBackupReminder(milestone,state,false)).toBeNull()
    }
    expect(nextBackupReminder(200,state,false)).toBeNull()
  })
  it('coalesces a batch across thresholds into one prompt',()=>{
    expect(nextBackupReminder(17,EMPTY_BACKUP_REMINDER,false)).toBe(15)
    expect(nextBackupReminder(101,EMPTY_BACKUP_REMINDER,false)).toBe(100)
  })
  it('does not repeat after undo, replay, restart, or a new day',()=>{
    const state=readBackupReminder(JSON.parse(JSON.stringify(acknowledgeBackupReminder(EMPTY_BACKUP_REMINDER,20))))
    for(const total of [0,15,19,20,21,29])expect(nextBackupReminder(total,state,false)).toBeNull()
    expect(nextBackupReminder(30,state,false)).toBe(30)
    expect(acknowledgeBackupReminder(state,10)).toEqual(state)
  })
  it('suppresses prompts when Google is linked',()=>{
    for(const count of BACKUP_MILESTONES)expect(nextBackupReminder(count,EMPTY_BACKUP_REMINDER,true)).toBeNull()
  })
  it('rejects damaged settings and invalid counts',()=>{
    for(const value of [null,{}, {version:2,highestShown:20},{version:1,highestShown:12}])expect(readBackupReminder(value)).toEqual(EMPTY_BACKUP_REMINDER)
    for(const count of [NaN,Infinity,-1,5.1])expect(nextBackupReminder(count,EMPTY_BACKUP_REMINDER,false)).toBeNull()
  })
})

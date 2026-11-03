import {describe,expect,it} from 'vitest'
import type {CloudStatus} from '../src/desktop/cloud-backup'
import {backupStatusLabel} from '../src/utils/backup-status'
const base:CloudStatus={connected:true,phase:'backedUp',origin:'https://vigil.test',error:'',revision:200,verifiedAt:'2026-11-04T00:00:00.000Z',applications:486}
describe('independent cloud status',()=>{
  it('reports verified only when the latest local revision is acknowledged and no edits are pending',()=>{
    expect(backupStatusLabel(base,200,false)).toBe('Backed up')
    expect(backupStatusLabel(base,201,false)).toBe('Backup pending')
    expect(backupStatusLabel(base,200,true)).toBe('Backup pending')
  })
  it('distinguishes setup, restoration, opt-out, and credential errors without asking for sign-in',()=>{
    expect(backupStatusLabel({...base,connected:false,phase:'pending'},200,false)).toBe('Connecting backup…')
    expect(backupStatusLabel({...base,connected:false,phase:'error'},200,false)).toBe('Backup needs attention')
    expect(backupStatusLabel({...base,connected:false,phase:'paused'},200,false)).toBe('Cloud backup off')
    expect(backupStatusLabel({...base,phase:'restoring'},200,false)).toBe('Restoring backup…')
    expect(backupStatusLabel({...base,phase:'uploading'},200,false)).toBe('Backing up…')
  })
})

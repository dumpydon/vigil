import type {CloudStatus} from '../desktop/cloud-backup'

export function backupStatusLabel(status:CloudStatus,localRevision:number,hasPending:boolean){
  if(status.phase==='paused')return 'Cloud backup off'
  if(status.phase==='error')return 'Backup needs attention'
  if(!status.connected||status.phase==='connecting')return 'Connecting backup…'
  if(status.phase==='restoring')return 'Restoring backup…'
  if(status.phase==='uploading')return 'Backing up…'
  if(status.phase==='backedUp'&&!hasPending&&(status.revision??-1)>=localRevision)return 'Backed up'
  return 'Backup pending'
}

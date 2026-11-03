import {makeBackup,utcDay,validateBackup,type MutationResult,type Snapshot} from '../../shared/model'

export interface LocalHistoryImage {
  snapshot:Snapshot
  receipts:{id:string;request:string;result:MutationResult}[]
}
export interface LocalHistorySafety {
  load:()=>Promise<{image:LocalHistoryImage|null;needsHistoryChoice?:boolean}>
  save:(image:LocalHistoryImage)=>Promise<void>
  recovered?:(message:string)=>Promise<void>
}

export function validateHistoryImage(input:unknown,today=utcDay()):LocalHistoryImage {
  const value=input as LocalHistoryImage
  if(!value?.snapshot||!Array.isArray(value.receipts))throw new Error('The safety copy is not a valid local history.')
  validateBackup(makeBackup(value.snapshot),today)
  if(!Number.isSafeInteger(value.snapshot.revision)||value.snapshot.revision<0||!Number.isSafeInteger(value.snapshot.goalRevision)||value.snapshot.goalRevision<0)throw new Error('The safety copy has an invalid history revision.')
  const ids=new Set<string>()
  for(const receipt of value.receipts){
    if(!receipt||typeof receipt.id!=='string'||typeof receipt.request!=='string'||!receipt.result||!Number.isSafeInteger(receipt.result.revision)||ids.has(receipt.id))throw new Error('The safety copy contains invalid operation receipts.')
    ids.add(receipt.id)
  }
  return value
}

// Deletions are tombstones. A saved entry ID must never silently disappear from
// a complete local snapshot, even at a Sunday, month, year or version boundary.
export function historyMissingFrom(current:Snapshot,previous:Snapshot):boolean {
  const ids=new Set(current.entries.map(entry=>entry.id))
  return previous.entries.some(entry=>!ids.has(entry.id))
}

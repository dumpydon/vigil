import {describe,expect,it} from 'vitest'
import {FIRST_DAY,makeBackup,type Entry,type Snapshot} from '../shared/model'
import {recoveryIdentityCompatible,recoveryPreview} from '../src/utils/recovery'
const day='2026-11-03',entry=(easy:number):Entry=>({id:crypto.randomUUID(),date:day,easy,external:0,version:1,deleted:false,backdated:false,loggedAt:day+'T12:00:00.000Z',createdAt:day+'T12:00:00.000Z',updatedAt:day+'T12:00:00.000Z'})
const snapshot=(entries:Entry[]):Snapshot=>({entries,policies:[{date:FIRST_DAY,value:75}],overrides:[],trackingStart:day,revision:200,goalRevision:0,serverNow:day+'T12:00:00.000Z'})
describe('recovery identity safety',()=>{
  it('permits a fresh store to recover without an account',()=>{
    const backup=makeBackup(snapshot([entry(486)]))
    expect(recoveryIdentityCompatible(null,backup,false)).toBe(true)
    expect(recoveryIdentityCompatible(snapshot([]),backup,false)).toBe(true)
  })
  it('reconnects cached history after the credential alone is lost, without adding 227 again',()=>{
    const old=entry(227),newer=entry(259),current=snapshot([old,newer]),backup=makeBackup(snapshot([old]))
    expect(recoveryIdentityCompatible(current,backup,false)).toBe(true)
    expect(recoveryPreview(current,backup,day).preview.items).toHaveLength(0)
    expect(current.entries.reduce((sum,entry)=>sum+entry.easy,0)).toBe(486)
  })
  it('accepts a newer backup extending a stale cache, while preserving conflicts for review',()=>{
    const old=entry(227),newer=entry(259),current=snapshot([{...old,easy:228,version:2}]),backup=makeBackup(snapshot([old,newer]))
    expect(recoveryIdentityCompatible(current,backup,false)).toBe(true)
    const preview=recoveryPreview(current,backup,day).preview
    expect(preview.conflicts).toHaveLength(1);expect(preview.items).toHaveLength(1)
    expect(current.entries[0].easy).toBe(228)
  })
  it('rejects unrelated histories even if both have a total of 486',()=>{
    expect(recoveryIdentityCompatible(snapshot([entry(486)]),makeBackup(snapshot([entry(486)])),false)).toBe(false)
  })
  it('rejects diverging histories and an empty foreign backup without silently changing identity',()=>{
    const common=entry(1),current=snapshot([common,entry(485)])
    expect(recoveryIdentityCompatible(current,makeBackup(snapshot([common,entry(489)])),false)).toBe(false)
    expect(recoveryIdentityCompatible(current,makeBackup(snapshot([])),false)).toBe(false)
    expect(recoveryIdentityCompatible(current,makeBackup(snapshot([common,entry(489)])),true)).toBe(true)
  })
})

import 'fake-indexeddb/auto'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SyncEngine} from '../src/data/store'
import {LocalWorkspace} from '../src/data/local-workspace'
import {analytics,importPreview,makeBackup} from '../shared/model'

const day='2026-10-14',clock=()=>new Date(`${day}T10:00:00.000Z`)
const engines:SyncEngine[]=[],records:LocalWorkspace[]=[]
afterEach(async()=>{for(const engine of engines.splice(0))engine.dispose();for(const workspace of records.splice(0))await workspace.close()})
function workspace(name=crypto.randomUUID()){const value=new LocalWorkspace(name,clock);records.push(value);return value}
async function engine(store:LocalWorkspace,name=crypto.randomUUID(),fetcher=store.fetcher){
  const value=new SyncEngine({name,clock,fetcher,localOnly:true,online:()=>false,broadcast:false,autoRetry:false});engines.push(value);await value.init();return value
}
const total=(value:SyncEngine)=>analytics(value.getState().snapshot!,7,day).total

describe('public local-only workspace',()=>{
  it('starts empty without login and retains offline entries, goals, drafts, edits and undo across reload',async()=>{
    const store=workspace(),name=crypto.randomUUID(),one=await engine(store,name)
    expect(one.getState().status).toBe('saved');expect(total(one)).toBe(0)
    const created=await one.createEntry(2,3);await one.sync();if(created?.type!=='create')throw new Error('Expected create')
    await one.setGoal(day,80,true);await one.sync();await one.saveDraft({kind:'entry',easy:'4'})
    const two=await engine(store,name)
    expect(total(two)).toBe(5);expect(analytics(two.getState().snapshot!,7,day).goal).toBe(80);expect(two.getState().draft).toEqual({kind:'entry',easy:'4'})
    await two.updateEntry(created.entry.id,4,2,day);await two.sync();expect(total(two)).toBe(6)
    await two.deleteEntry(created.entry.id);await two.sync();expect(total(two)).toBe(0);expect(two.getState().queue).toHaveLength(0)
  })
  it('shares an atomic local workspace between two window engines',async()=>{
    const name=crypto.randomUUID(),store=workspace(),one=await engine(store,name),two=await engine(store,name)
    await Promise.all([one.createEntry(1,0),two.createEntry(0,2)])
    await Promise.all([one.sync(),two.sync()]);await two.sync()
    expect(total(two)).toBe(3);expect(two.getState().queue).toHaveLength(0)
  })
  it('recovers a lost local acknowledgment exactly once',async()=>{
    const store=workspace(),name=crypto.randomUUID();let lose=true,writes=0
    const fetcher:typeof fetch=async(input,init)=>{const result=await store.fetcher(input,init);if(init?.method==='POST'){writes++;if(lose){lose=false;throw new Error('Lost local acknowledgment')}}return result}
    const one=await engine(store,name,fetcher)
    await one.createEntry(3,2);await one.sync();expect(one.getState().queue).toHaveLength(1)
    const reopened=await engine(store,name,fetcher)
    expect(total(reopened)).toBe(5);expect(reopened.getState().queue).toHaveLength(0);expect(writes).toBe(1)
  })
  it('preserves a newer saved record when an older window submits a stale edit',async()=>{
    const store=workspace(),one=await engine(store),created=await one.createEntry(1,0);await one.sync();if(created?.type!=='create')throw new Error('Expected create')
    await store.fetcher(`/api/entries/${created.entry.id}`,{method:'PATCH',body:JSON.stringify({id:crypto.randomUUID(),type:'update',entryId:created.entry.id,expectedVersion:1,date:day,easy:9,external:0})})
    await one.updateEntry(created.entry.id,4,0,day,1);await one.sync()
    const conflict=one.getState().queue[0];expect(conflict.status).toBe('conflict');expect(conflict.cloudEntry?.easy).toBe(9)
    await one.resolveConflict(conflict.operation.id,'cloud');await one.sync();expect(total(one)).toBe(9)
  })
  it('exports and restores a backup without duplicating records',async()=>{
    const one=await engine(workspace());await one.createEntry(3,4);await one.sync();await one.setGoal(day,90,false);await one.sync()
    const backup=makeBackup(one.getState().snapshot!,clock()),two=await engine(workspace()),preview=importPreview(two.getState().snapshot!,backup)
    await two.importItems(preview.items,backup.trackingStart);await two.sync()
    expect(total(two)).toBe(7);expect(analytics(two.getState().snapshot!,7,day).goal).toBe(90)
    const repeated=importPreview(two.getState().snapshot!,backup);expect(repeated.items).toHaveLength(0)
  })
  it('does not call network fetch and rejects remote URLs and account requests locally',async()=>{
    const remote=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Network must not be used'))
    try{
      const store=workspace(),one=await engine(store);await one.createEntry(1,1);await one.sync()
      expect(remote).not.toHaveBeenCalled()
      expect((await store.fetcher('https://vigil.dumpydon.workers.dev/api/snapshot')).status).toBe(403)
      expect((await store.fetcher('/api/login',{method:'POST',body:'{}'})).status).toBe(400)
    }finally{remote.mockRestore()}
  })
})

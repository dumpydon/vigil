import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {FIRST_DAY,makeBackup,type Snapshot} from '../shared/model'
import type {AppState} from '../src/data/store'

const mocks=vi.hoisted(()=>({state:null as AppState|null,bridge:vi.fn(),recover:vi.fn()}))
vi.mock('../src/desktop/bridge',()=>({isNative:true,isLocalOnly:true,desktopCall:mocks.bridge}))
vi.mock('../src/data/store',()=>({engine:{getState:()=>mocks.state!,recoverLocalHistory:mocks.recover}}))
const day='2026-10-07',stamp=day+'T12:00:00.000Z'
const snapshot=(count=0):Snapshot=>({entries:count?[{id:crypto.randomUUID(),date:day,easy:count,external:0,loggedAt:stamp,createdAt:stamp,updatedAt:stamp,version:1,deleted:false,backdated:false}]:[],policies:[{date:FIRST_DAY,value:75}],overrides:[{date:day,value:55}],trackingStart:day,revision:count?200:0,goalRevision:1,serverNow:stamp})
let source:Snapshot
const connected={connected:true,phase:'pending',origin:'https://vigil.dumpydon.workers.dev',identityId:'private-identity',recoveryFileSaved:false,error:'',revision:null,verifiedAt:null,applications:null}
beforeEach(()=>{
  vi.resetModules();mocks.bridge.mockReset();mocks.recover.mockReset()
  source=snapshot(486)
  mocks.state={snapshot:snapshot(),status:'saved',queue:[],draft:null,error:null,initialized:true}
  mocks.bridge.mockImplementation(async(command:string,value?:{revision:number;backupJSON:string})=>{
    if(command==='cloudSetup')return connected
    if(command==='cloudList')return {backups:[{id:'saved-copy',revision:200,entries:1}]}
    if(command==='cloudRead')return {backupJSON:JSON.stringify(makeBackup(source,new Date(stamp))),revision:200}
    if(command==='cloudSave')return {...connected,phase:'backedUp',revision:value!.revision,applications:JSON.parse(value!.backupJSON).entries.reduce((sum:number,entry:{easy:number;external:number;deleted:boolean})=>sum+(entry.deleted?0:entry.easy+entry.external),0)}
    throw new Error('Unexpected native command: '+command)
  })
  mocks.recover.mockImplementation(async(backup:ReturnType<typeof makeBackup>,minimumRevision:number)=>{
    mocks.state={...mocks.state!,snapshot:{...mocks.state!.snapshot!,...backup,revision:minimumRevision+1},status:'saved'}
  })
})
afterEach(()=>{vi.clearAllMocks()})

describe('automatic cloud backup startup and recovery',()=>{
  it('restores a fresh local history before uploading, without an owner login',async()=>{
    const {cloudBackup}=await import('../src/desktop/cloud-backup')
    await cloudBackup.sync()
    expect(mocks.recover).toHaveBeenCalledWith(expect.objectContaining({entries:source.entries,overrides:source.overrides}),200)
    const commands=mocks.bridge.mock.calls.map(call=>call[0])
    expect(commands).toEqual(['cloudSetup','cloudList','cloudRead','cloudSave'])
    expect(mocks.bridge.mock.calls.at(-1)?.[1]).toMatchObject({revision:201})
    expect(cloudBackup.getState()).toMatchObject({phase:'backedUp',revision:201,applications:486})
  })
  it('never adds the older 227 total on top of an existing 486 history',async()=>{
    mocks.state!.snapshot=snapshot(486);source=snapshot(227)
    const before=structuredClone(mocks.state!.snapshot)
    const {cloudBackup}=await import('../src/desktop/cloud-backup');await cloudBackup.sync()
    expect(mocks.recover).not.toHaveBeenCalled()
    expect(mocks.bridge.mock.calls.some(call=>call[0]==='cloudRead')).toBe(false)
    expect(mocks.state!.snapshot).toEqual(before)
    expect(cloudBackup.getState()).toMatchObject({phase:'backedUp',applications:486})
  })
  it('does not resurrect intentionally deleted entries whose total is zero',async()=>{
    const deleted=snapshot(486);deleted.entries[0].deleted=true;mocks.state!.snapshot=deleted
    const {cloudBackup}=await import('../src/desktop/cloud-backup');await cloudBackup.sync()
    expect(mocks.recover).not.toHaveBeenCalled()
    expect(mocks.state!.snapshot!.entries[0].deleted).toBe(true)
    expect(cloudBackup.getState()).toMatchObject({phase:'backedUp',applications:0})
  })
  it('stops automatic recovery if local records were added while the cloud copy loaded',async()=>{
    const original=mocks.bridge.getMockImplementation()!
    mocks.bridge.mockImplementation(async(command,...args)=>{
      const response=await original(command,...args)
      if(command==='cloudRead')mocks.state!.snapshot=snapshot(1)
      return response
    })
    const {cloudBackup}=await import('../src/desktop/cloud-backup');await cloudBackup.sync()
    expect(mocks.recover).not.toHaveBeenCalled()
    expect(mocks.bridge.mock.calls.some(call=>call[0]==='cloudSave')).toBe(false)
    expect(cloudBackup.getState()).toMatchObject({phase:'error',error:expect.stringContaining('both histories are retained')})
    expect(mocks.state!.snapshot!.entries[0].easy).toBe(1)
  })
  it('coalesces simultaneous retries instead of uploading or restoring duplicates',async()=>{
    const {cloudBackup}=await import('../src/desktop/cloud-backup')
    await Promise.all([cloudBackup.sync(),cloudBackup.sync(),cloudBackup.sync()])
    expect(mocks.recover).toHaveBeenCalledTimes(1)
    expect(mocks.bridge.mock.calls.filter(call=>call[0]==='cloudSave')).toHaveLength(1)
  })
  it('keeps a goal change made while an automatic recovery is loading',async()=>{
    const original=mocks.bridge.getMockImplementation()!
    mocks.bridge.mockImplementation(async(command,...args)=>{
      const response=await original(command,...args)
      if(command==='cloudRead')mocks.state!.snapshot={...mocks.state!.snapshot!,revision:1,overrides:[{date:day,value:20}]}
      return response
    })
    const {cloudBackup}=await import('../src/desktop/cloud-backup');await cloudBackup.sync()
    expect(mocks.recover).not.toHaveBeenCalled()
    expect(mocks.bridge.mock.calls.some(call=>call[0]==='cloudSave')).toBe(false)
    expect(mocks.state!.snapshot!.overrides).toEqual([{date:day,value:20}])
    expect(cloudBackup.getState()).toMatchObject({phase:'error',error:expect.stringContaining('both histories are retained')})
  })
  it('honors an explicit opt-out across startup',async()=>{
    mocks.bridge.mockResolvedValue({...connected,connected:false,phase:'paused'})
    const {cloudBackup}=await import('../src/desktop/cloud-backup');await cloudBackup.sync()
    expect(mocks.bridge.mock.calls.map(call=>call[0])).toEqual(['cloudSetup'])
    expect(mocks.recover).not.toHaveBeenCalled()
  })
})

describe('Google completion preserves local history',()=>{
  it('refuses an unrelated cloud history before changing the saved connection',async()=>{
    mocks.state!.snapshot=snapshot(486)
    const {cloudBackup}=await import('../src/desktop/cloud-backup')
    await expect(cloudBackup.googleFinish('restore',{backupJSON:JSON.stringify(makeBackup(source)),revision:200},false)).rejects.toThrow('different history')
    expect(mocks.bridge.mock.calls.some(call=>call[0]==='googleFinish')).toBe(false)
  })
  it('stops recovery if a new unrelated local entry arrives during sign-in',async()=>{
    const original=mocks.bridge.getMockImplementation()!
    mocks.bridge.mockImplementation(async(command,...args)=>{
      if(command==='googleFinish'){mocks.state!.snapshot=snapshot(1);return {...connected,googleEmail:'person@example.test'}}
      return original(command,...args)
    })
    const {cloudBackup}=await import('../src/desktop/cloud-backup')
    await expect(cloudBackup.googleFinish('restore',{backupJSON:JSON.stringify(makeBackup(source)),revision:200},false)).rejects.toThrow('Local history changed')
    expect(mocks.recover).not.toHaveBeenCalled()
    expect(mocks.state!.snapshot!.entries[0].easy).toBe(1)
  })
})

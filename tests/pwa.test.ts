import {afterEach,describe,expect,it,vi} from 'vitest'
import {registerPwa} from '../src/pwa'

afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()})

describe('PWA listener lifecycle',()=>{
  it('removes focus and update listeners when the dashboard unmounts',async()=>{
    vi.stubEnv('DEV',false)
    const host=new EventTarget(),worker=Object.assign(new EventTarget(),{state:'installing'})
    const registration=Object.assign(new EventTarget(),{waiting:null,installing:worker,update:vi.fn().mockResolvedValue(undefined)})
    vi.stubGlobal('window',host)
    vi.stubGlobal('navigator',{serviceWorker:{controller:{},register:vi.fn().mockResolvedValue(registration)}})
    const controller=new AbortController(),onUpdate=vi.fn()
    await registerPwa(onUpdate,controller.signal)
    host.dispatchEvent(new Event('focus'))
    expect(registration.update).toHaveBeenCalledOnce()
    registration.dispatchEvent(new Event('updatefound'))
    worker.state='installed';worker.dispatchEvent(new Event('statechange'))
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith(worker)
    controller.abort()
    host.dispatchEvent(new Event('focus'));worker.dispatchEvent(new Event('statechange'))
    expect(registration.update).toHaveBeenCalledOnce()
    expect(onUpdate).toHaveBeenCalledOnce()
  })

  it('ignores registration that finishes after the dashboard unmounts',async()=>{
    vi.stubEnv('DEV',false)
    let finish!:(registration:ServiceWorkerRegistration)=>void
    const pending=new Promise<ServiceWorkerRegistration>(resolve=>{finish=resolve})
    const host=new EventTarget(),waiting={},registration={waiting,addEventListener:vi.fn(),update:vi.fn()} as unknown as ServiceWorkerRegistration
    vi.stubGlobal('window',host)
    vi.stubGlobal('navigator',{serviceWorker:{register:vi.fn().mockReturnValue(pending)}})
    const controller=new AbortController(),onUpdate=vi.fn(),task=registerPwa(onUpdate,controller.signal)
    controller.abort();finish(registration);await task
    host.dispatchEvent(new Event('focus'))
    expect(onUpdate).not.toHaveBeenCalled()
    expect(registration.addEventListener).not.toHaveBeenCalled()
    expect(registration.update).not.toHaveBeenCalled()
  })
})

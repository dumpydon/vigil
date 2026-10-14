import {describe,it,expect,vi} from 'vitest'
import {nativeRequest,validApiRequest} from '../src/desktop/bridge'

describe('desktop API boundary',()=>{
  it('allows only known routes and methods',()=>{
    expect(validApiRequest('/api/snapshot?pending=4c4c4c4c-1234-4321-abcd-123456789012','GET')).toBe(true)
    expect(validApiRequest('/api/days/2026-10-13','PUT')).toBe(true)
    expect(validApiRequest('/api/entries/4c4c4c4c-1234-4321-abcd-123456789012','PATCH')).toBe(true)
    for(const path of ['https://evil.test/api/snapshot','//evil.test/api/snapshot','/api/../private','/api/%2e%2e/private','/api/snapshot#fragment','/api/snapshot?redirect=evil','/api/snapshot?pending=abc?extra','/api/snapshot\\private','/api/unknown'])expect(validApiRequest(path,'GET'),path).toBe(false)
    expect(validApiRequest('/api/snapshot','POST')).toBe(false)
    expect(validApiRequest('/api/login','GET')).toBe(false)
    expect(validApiRequest('/api/logout','DELETE')).toBe(false)
  })
  it('returns ordinary responses, including expired-session errors, to the shared sync engine',async()=>{
    const send=vi.fn().mockResolvedValue({status:401,body:'{"error":"Sign in to sync"}'})
    const response=await nativeRequest('/api/snapshot',{},send)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({error:'Sign in to sync'})
    expect(send).toHaveBeenCalledWith('request',{path:'/api/snapshot',method:'GET',body:undefined})
  })
  it('preserves operation bodies and never forwards caller-supplied credentials or headers',async()=>{
    const send=vi.fn().mockResolvedValue({status:200,body:'{}'}),body='{"id":"retained-operation-id","type":"create"}'
    await nativeRequest('/api/entries',{method:'POST',body,headers:{Cookie:'ignored',Authorization:'ignored'}},send)
    expect(send).toHaveBeenCalledWith('request',{path:'/api/entries',method:'POST',body})
  })
  it('rejects blocked requests before calling the native host',async()=>{
    const send=vi.fn()
    await expect(nativeRequest('https://evil.test/',{},send)).rejects.toThrow('not allowed')
    expect(send).not.toHaveBeenCalled()
  })
  it('supports an aborted request without pretending its write was acknowledged',async()=>{
    const controller=new AbortController(),send=vi.fn(()=>new Promise<{status:number;body:string}>(()=>{}))
    const request=nativeRequest('/api/entries',{method:'POST',body:'{}',signal:controller.signal},send)
    controller.abort()
    await expect(request).rejects.toMatchObject({name:'AbortError'})
    const already=new AbortController();already.abort()
    await expect(nativeRequest('/api/snapshot',{signal:already.signal},send)).rejects.toMatchObject({name:'AbortError'})
    expect(send).toHaveBeenCalledTimes(1)
  })
})

import { describe,expect,it,vi } from 'vitest'
import { openCompactPopout,pictureInPicture,type DocumentPictureInPicture } from '../src/utils/popout'

function popup(){return {closed:false,focus:vi.fn()} as unknown as Window}

describe('always-on-top compact window',()=>{
  it('requests Document Picture-in-Picture instead of a browser popup or tab',async()=>{
    const floating=popup(),api:DocumentPictureInPicture={window:null,requestWindow:vi.fn().mockResolvedValue(floating)}
    expect(await openCompactPopout(api)).toBe(floating)
    expect(api.requestWindow).toHaveBeenCalledExactlyOnceWith({width:420,height:400})
    expect(floating.focus).toHaveBeenCalledOnce()
  })
  it('reuses the active floating window without resetting its size or form',async()=>{
    const floating=popup(),api:DocumentPictureInPicture={window:floating,requestWindow:vi.fn()}
    expect(await openCompactPopout(api)).toBe(floating)
    expect(api.requestWindow).not.toHaveBeenCalled()
    expect(floating.focus).toHaveBeenCalledOnce()
  })
  it('opens again after the floating window closes',async()=>{
    const closed={closed:true} as Window,floating=popup(),api:DocumentPictureInPicture={window:closed,requestWindow:vi.fn().mockResolvedValue(floating)}
    expect(await openCompactPopout(api)).toBe(floating)
    expect(api.requestWindow).toHaveBeenCalledOnce()
  })
  it('reports unsupported browsers without silently opening a normal tab',async()=>{
    expect(pictureInPicture({} as Window)).toBeUndefined()
    await expect(openCompactPopout(undefined)).rejects.toThrow('requires desktop Chrome')
  })
  it('propagates a denied request so the interface can explain the failure',async()=>{
    const api:DocumentPictureInPicture={window:null,requestWindow:vi.fn().mockRejectedValue(new Error('Request denied'))}
    await expect(openCompactPopout(api)).rejects.toThrow('Request denied')
  })
})

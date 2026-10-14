import {describe,it,expect,vi} from 'vitest'
import {createHandler} from '../worker/index'
import type {Env} from '../worker/security'
import {readFile} from 'node:fs/promises'
import {runInNewContext} from 'node:vm'

const origin='https://vigil.example'
function site(){
  const assets=new Map([['/','Public download'],['/dashboard/','Owner dashboard'],['/install/','Install guide'],['/download/previews/usage.html','Sample preview']])
  const fetchAsset=vi.fn(async(request:Request)=>new Response(assets.get(new URL(request.url).pathname)??'Not found',{status:assets.has(new URL(request.url).pathname)?200:404}))
  const env={ASSETS:{fetch:fetchAsset}} as unknown as Env
  return {fetchAsset,fetch:(path:string)=>createHandler()(new Request(origin+path),env)}
}
describe('one Worker, public home and owner dashboard',()=>{
  it('serves the download at the root and a separate app shell at /dashboard/',async()=>{
    const app=site(),home=await app.fetch('/'),dashboard=await app.fetch('/dashboard/'),compact=await app.fetch('/dashboard/compact/?day=2026-10-09')
    expect(await home.text()).toBe('Public download')
    expect(await dashboard.text()).toBe('Owner dashboard');expect(await compact.text()).toBe('Owner dashboard')
    expect(home.headers.get('content-security-policy')).toContain("frame-ancestors 'self'")
    expect(dashboard.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    expect(app.fetchAsset.mock.calls.at(-1)?.[0].url).toBe(origin+'/dashboard/?day=2026-10-09')
  })
  it('redirects old pages and bookmarks, preserving their query strings',async()=>{
    const app=site()
    for(const [from,to] of [
      ['/download/','/'],['/download','/'],['/download/install.html?embed=1','/install/?embed=1'],
      ['/download/first-launch.html?embed=1','/first-launch/?embed=1'],['/download/privacy','/privacy/'],
      ['/download/demo.html','/tour/'],['/dashboard','/dashboard/'],['/compact?day=2026-10-09','/dashboard/compact/?day=2026-10-09'],
      ['/?desktop-preview=1&compact-preview=1','/dashboard/?desktop-preview=1&compact-preview=1'],
    ]){const response=await app.fetch(from);expect(response.status).toBe(308);expect(response.headers.get('location')).toBe(to)}
    expect(app.fetchAsset).not.toHaveBeenCalled()
  })
  it('keeps preview assets working and returns real 404s for missing files',async()=>{
    const app=site(),preview=await app.fetch('/download/previews/usage.html')
    expect(await preview.text()).toBe('Sample preview')
    expect(preview.headers.get('content-security-policy')).toContain("frame-ancestors 'self'")
    expect((await app.fetch('/missing.js')).status).toBe(404)
  })
})

it('falls back only to the dashboard shell offline, never the public home',async()=>{
  const listeners=new Map<string,(event:unknown)=>void>(),match=vi.fn().mockResolvedValue(new Response('Offline dashboard'))
  const source=(await readFile(new URL('../public/sw.js',import.meta.url),'utf8')).replace('__ASSETS__',JSON.stringify(['/dashboard/','/assets/app.js']))
  runInNewContext(source,{self:{location:{origin},addEventListener:(name:string,listener:(event:unknown)=>void)=>listeners.set(name,listener)},URL,fetch:vi.fn().mockRejectedValue(new Error('Offline')),caches:{open:vi.fn().mockResolvedValue({match})}})
  const respondWith=vi.fn();listeners.get('fetch')!({request:{url:origin+'/dashboard/compact/',method:'GET',mode:'navigate'},respondWith})
  expect(await (await respondWith.mock.calls[0][0]).text()).toBe('Offline dashboard')
  expect(match).toHaveBeenCalledWith('/dashboard/')
})

it('retires the legacy root worker without clearing records or pending work',async()=>{
  const listeners=new Map<string,(event?:unknown)=>unknown>(),unregister=vi.fn().mockResolvedValue(true),claim=vi.fn().mockResolvedValue(undefined),clear=vi.fn()
  runInNewContext(await readFile(new URL('../public/legacy-sw.js',import.meta.url),'utf8'),{
    self:{skipWaiting:vi.fn(),clients:{claim},registration:{unregister},addEventListener:(name:string,listener:(event?:unknown)=>unknown)=>listeners.set(name,listener)},
    caches:{delete:clear},indexedDB:{deleteDatabase:clear},localStorage:{clear},
  })
  const waitUntil=vi.fn();listeners.get('activate')!({waitUntil});await waitUntil.mock.calls[0][0]
  expect(claim).toHaveBeenCalledOnce();expect(unregister).toHaveBeenCalledOnce();expect(clear).not.toHaveBeenCalled()
  expect(listeners.has('fetch')).toBe(false)
})

it('retains the installed app identity and moves its launch, scope and shortcut together',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../public/manifest.webmanifest',import.meta.url),'utf8'))
  expect(manifest.id).toBe('/');expect(manifest.start_url).toBe('/dashboard/');expect(manifest.scope).toBe('/dashboard/')
  expect(manifest.shortcuts[0].url).toBe('/dashboard/compact/')
})

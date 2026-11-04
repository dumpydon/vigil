import {afterEach,beforeEach,describe,it,expect} from 'vitest'
import {makeEnvironment} from './helpers'
import {googleBackupFlow,type GoogleBackupEnv} from '../worker/google-backup-flow'
let test:Awaited<ReturnType<typeof makeEnvironment>>,env:GoogleBackupEnv
beforeEach(async()=>{test=await makeEnvironment();env={...test.env,GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret'}},30000)
afterEach(async()=>{await test.dispose()})
const secret='a'.repeat(64)
const call=(path:string,body?:unknown)=>googleBackupFlow(new Request('https://vigil.test'+path,body===undefined?{}:{method:'POST',body:JSON.stringify(body)}),env,test.clock())
async function start(){const result=await call('/api/google/start',{pollSecret:secret});expect(result?.status).toBe(200);return new URL((await result!.json() as {authorizationURL:string}).authorizationURL)}
describe('Google browser confirmation flow',()=>{
  it('creates a private expiring PKCE request without a backup identity or upload',async()=>{
    const url=await start();expect(url.origin).toBe('https://accounts.google.com');expect(url.searchParams.get('scope')).toBe('openid email');expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('redirect_uri')).toBe('https://vigil.test/api/google/callback')
    const row=await test.env.DB.prepare('SELECT * FROM google_backup_requests').first<{poll_hash:string;verifier:string;expires_at:number}>()
    expect(row?.poll_hash).not.toBe(secret);expect(row?.expires_at).toBe(test.clock().getTime()+600000)
    expect(url.href).not.toContain(row!.verifier);expect(url.href).not.toContain(secret)
    expect((await test.env.DB.prepare('SELECT COUNT(*) AS n FROM backup_devices').first<{n:number}>())?.n).toBe(0)
    expect(await (await call('/api/google/status',{pollSecret:secret}))!.json()).toMatchObject({status:'pending'})
  })
  it('rejects polling with a different key or after expiry',async()=>{
    await start();expect((await call('/api/google/status',{pollSecret:'b'.repeat(64)}))?.status).toBe(410)
    test.setTime('2026-10-07T11:11:00Z');expect((await call('/api/google/status',{pollSecret:secret}))?.status).toBe(410)
  })
  it('keeps cancelled browser sign-in terminal and refuses callback replay',async()=>{
    const url=await start(),state=url.searchParams.get('state')!
    await call('/api/google/callback?state='+state+'&error=access_denied')
    expect(await (await call('/api/google/status',{pollSecret:secret}))!.json()).toMatchObject({status:'failed'})
    await call('/api/google/callback?state='+state+'&code=other-code')
    expect(await (await call('/api/google/status',{pollSecret:secret}))!.json()).toMatchObject({status:'failed'})
  })
  it('refuses forged existing-device authorization',async()=>{
    const request=new Request('https://vigil.test/api/google/start',{method:'POST',headers:{Authorization:'Bearer '+'b'.repeat(64)},body:JSON.stringify({pollSecret:secret})})
    expect((await googleBackupFlow(request,env,test.clock()))?.status).toBe(401)
  })
  it('reports missing production configuration without attempting Google',async()=>{
    expect((await googleBackupFlow(new Request('https://vigil.test/api/google/start',{method:'POST'}),test.env,test.clock()))?.status).toBe(503)
  })
})

describe('successful Google callback exchange',()=>{
  it('uses edge-supported redirect handling and validates a real signed identity before readiness',async()=>{
    const url=await start(),nonce=url.searchParams.get('nonce')!,state=url.searchParams.get('state')!
    const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify'])
    const encode=(value:Uint8Array|string)=>Buffer.from(value).toString('base64url')
    const seconds=Math.floor(test.clock().getTime()/1000)
    const payload=encode(JSON.stringify({alg:'RS256',kid:'google-test'}))+'.'+encode(JSON.stringify({iss:'https://accounts.google.com',aud:'test-client',nonce,sub:'confirmed-user',email:'confirmed@example.test',email_verified:true,iat:seconds,exp:seconds+3600}))
    const token=payload+'.'+encode(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(payload))))
    const transport:typeof fetch=async(input,options)=>{
      expect(options?.redirect).toBe('manual')
      if(String(input).endsWith('/token'))return Response.json({id_token:token})
      return Response.json({keys:[{...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'google-test'}]})
    }
    const request=new Request('https://vigil.test/api/google/callback?state='+state+'&code=one-time-code')
    expect(await (await googleBackupFlow(request,env,test.clock(),transport))!.text()).toContain('Google confirmed your account')
    expect(await (await call('/api/google/status',{pollSecret:secret}))!.json()).toMatchObject({status:'ready',email:'confirmed@example.test',hasAccount:false})
    expect(await (await googleBackupFlow(request,env,test.clock(),async()=>{throw new Error('A reload must not exchange the code twice')}))!.text()).toContain('Google confirmed your account')
    const row=await test.env.DB.prepare('SELECT verifier FROM google_backup_requests').first<{verifier:string}>();expect(row?.verifier).toBe('')
  })
})

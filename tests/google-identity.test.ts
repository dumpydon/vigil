import {beforeAll,describe,it,expect} from 'vitest'
import {verifyGoogleIdentity} from '../worker/google-identity'
let privateKey:CryptoKey,publicKey:JsonWebKey&{kid:string}
const now=Date.parse('2026-11-04T12:00:00Z'),seconds=now/1000
const encode=(value:Uint8Array|string)=>Buffer.from(value).toString('base64url')
const base={iss:'https://accounts.google.com',aud:'vigil-client',nonce:'one-use-nonce',sub:'stable-google-id',email:'person@example.test',email_verified:true,iat:seconds,exp:seconds+3600}
async function signed(changes:Record<string,unknown>={}){
  const payload=encode(JSON.stringify({alg:'RS256',kid:'test-key'}))+'.'+encode(JSON.stringify({...base,...changes}))
  return payload+'.'+encode(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',privateKey,new TextEncoder().encode(payload))))
}
beforeAll(async()=>{const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);privateKey=pair.privateKey;publicKey={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:'test-key'}})
describe('Google identity verification',()=>{
  it('accepts a signed identity for the right app and one-use nonce',async()=>{
    expect(await verifyGoogleIdentity(await signed(),'vigil-client','one-use-nonce',now,[publicKey])).toEqual({subject:base.sub,email:base.email})
  })
  it.each([{aud:'another-app'},{nonce:'replayed-other-request'},{iss:'https://fake.example'},{azp:'another-app'},{exp:seconds},{iat:seconds+120},{iat:seconds-3601},{email_verified:false},{sub:''}])('rejects wrong or expired claims: %j',async changes=>{
    await expect(verifyGoogleIdentity(await signed(changes),'vigil-client','one-use-nonce',now,[publicKey])).rejects.toThrow()
  })
  it('rejects a changed payload even with a real signature attached',async()=>{
    const parts=(await signed()).split('.');parts[1]=encode(JSON.stringify({...base,sub:'victim'}))
    await expect(verifyGoogleIdentity(parts.join('.'),'vigil-client','one-use-nonce',now,[publicKey])).rejects.toThrow()
  })
  it('rejects unknown signing keys and unsigned tokens',async()=>{
    await expect(verifyGoogleIdentity(await signed(),'vigil-client','one-use-nonce',now,[])).rejects.toThrow()
    await expect(verifyGoogleIdentity(encode(JSON.stringify({alg:'none',kid:'test-key'}))+'.'+encode(JSON.stringify(base))+'.x','vigil-client','one-use-nonce',now,[publicKey])).rejects.toThrow()
  })
})

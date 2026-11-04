/** Verify Google identity on the server; email alone never proves ownership. */
export interface GoogleIdentity {subject:string;email:string}
interface GoogleKey extends JsonWebKey {kid?:string}
const decode=(value:string)=>{
  if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid identity token.')
  return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),char=>char.charCodeAt(0))
}
export async function verifyGoogleIdentity(token:string,clientId:string,nonce:string,now:number,keys:GoogleKey[]):Promise<GoogleIdentity>{
  if(!clientId||!nonce||typeof token!=='string'||token.length>16000)throw new Error('Invalid identity token.')
  const parts=token.split('.');if(parts.length!==3)throw new Error('Invalid identity token.')
  const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))) as {alg?:string;kid?:string}
  if(header.alg!=='RS256'||!header.kid)throw new Error('Invalid Google signature.')
  const jwk=keys.find(key=>key.kid===header.kid&&key.kty==='RSA'&&(!key.alg||key.alg==='RS256')&&(!key.use||key.use==='sig'))
  if(!jwk)throw new Error('Unknown Google signing key.')
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify'])
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1])))throw new Error('Invalid Google signature.')
  const claims=JSON.parse(new TextDecoder().decode(decode(parts[1]))) as Record<string,unknown>
  const seconds=Math.floor(now/1000)
  if(!['https://accounts.google.com','accounts.google.com'].includes(String(claims.iss))||claims.aud!==clientId||claims.nonce!==nonce||
    (claims.azp!==undefined&&claims.azp!==clientId)||typeof claims.exp!=='number'||claims.exp<=seconds||
    typeof claims.iat!=='number'||claims.iat>seconds+60||claims.iat<seconds-3600||
    typeof claims.sub!=='string'||!claims.sub||claims.sub.length>255||claims.email_verified!==true||
    typeof claims.email!=='string'||claims.email.length>320)throw new Error('Google sign-in could not be verified. Please try again.')
  return {subject:claims.sub,email:claims.email}
}

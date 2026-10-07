import { randomBytes, pbkdf2Sync } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createHandler } from '../worker/index'
import { hex, type Env } from '../worker/security'
import { utcDay, type Mutation, type Snapshot } from '../shared/model'

export async function makeEnvironment(){
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("test")}}',d1Databases:{DB:crypto.randomUUID()},compatibilityDate:'2026-10-07'}))
  const db=await mf.getD1Database('DB') as unknown as D1Database
  for(const name of ['0001_initial.sql','0002_session_generation.sql','0003_auth_receipts.sql']){
    let sql=(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8')).replace(/--[^\n]*/g,'')
    const triggers=[...sql.matchAll(/CREATE TRIGGER[\s\S]*?\nEND;/g)].map(m=>m[0])
    for(const t of triggers)sql=sql.replace(t,'')
    for(const statement of sql.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run()
    for(const trigger of triggers)await db.prepare(trigger).run()
  }
  const password=hex(randomBytes(24)),saltBytes=randomBytes(16),salt=hex(saltBytes)
  const env:Env={DB:db,ASSETS:{fetch:async()=>new Response('shell')} as unknown as Fetcher,SESSION_SECRET:hex(randomBytes(32)),OWNER_PASSWORD_HASH:`pbkdf2-sha256$100000$${salt}$${hex(pbkdf2Sync(password,saltBytes,100000,32,'sha256'))}`}
  let time=new Date('2026-10-07T11:00:00.000Z'),cookie=''
  const handler=createHandler(()=>new Date(time))
  const fetcher:typeof fetch=async(input,init={})=>{
    const url=String(input).startsWith('http')?String(input):'https://vigil.test'+input
    const headers=new Headers(init.headers);headers.set('Origin','https://vigil.test');headers.set('Content-Type','application/json');if(cookie)headers.set('Cookie',cookie)
    const result=await handler(new Request(url,{...init,headers}),env)
    const next=result.headers.get('set-cookie');if(next)cookie=next.split(';')[0]
    return result
  }
  async function login(){return fetcher('/api/login',{method:'POST',body:JSON.stringify({id:crypto.randomUUID(),password})})}
  async function snapshot(){return await (await fetcher('/api/snapshot')).json() as Snapshot}
  function op(easy=1,external=0):Extract<Mutation,{type:'create'}>{return {id:crypto.randomUUID(),type:'create',entry:{id:crypto.randomUUID(),easy,external,date:utcDay(time),loggedAt:time.toISOString(),backdated:false}}}
  function mutate(operation:Mutation){const url=operation.type==='create'?'/api/entries':operation.type==='goal'?'/api/goals/'+operation.date:operation.type==='import'?'/api/import':'/api/entries/'+operation.entryId,method=operation.type==='create'||operation.type==='import'?'POST':operation.type==='goal'?'PUT':operation.type==='update'?'PATCH':'DELETE';return fetcher(url,{method,body:JSON.stringify(operation)})}
  return {mf,env,password,handler,fetcher,login,snapshot,op,mutate,clock:()=>new Date(time),setTime:(value:string)=>{time=new Date(value)},clearCookie:()=>{cookie=''},dispose:()=>mf.dispose()}
}

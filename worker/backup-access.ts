import {sha,type Env} from './security'
export interface BackupAccess {id:string;name:string;access_id?:string}
export async function backupAccess(request:Request,env:Env):Promise<BackupAccess|null>{
  const token=request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1]
  if(!token)return null
  const hash=await sha(token)
  const legacy=await env.DB.prepare('SELECT id,name FROM backup_devices WHERE token_hash=? AND revoked=0').bind(hash).first<BackupAccess>()
  if(legacy)return legacy
  return env.DB.prepare("SELECT namespace_id AS id,'Google backup' AS name,id AS access_id FROM google_backup_access WHERE token_hash=? AND revoked=0").bind(hash).first<BackupAccess>()
}

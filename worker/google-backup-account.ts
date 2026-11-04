import {sha,type Env} from './security'
import type {GoogleIdentity} from './google-identity'

export interface GoogleBackupAccount {google_subject:string;namespace_id:string;email:string;created_at:string}
/** Called only after Google verification AND proof of the source device key. */
export async function linkGoogleBackup(env:Env,identity:GoogleIdentity,sourceNamespace:string,now:Date):Promise<GoogleBackupAccount>{
  const source=await env.DB.prepare('SELECT id FROM backup_devices WHERE id=? AND revoked=0').bind(sourceNamespace).first()
  if(!source)throw new Error('The local backup connection is no longer valid.')
  const existing=await env.DB.prepare('SELECT * FROM google_backup_accounts WHERE google_subject=?').bind(identity.subject).first<GoogleBackupAccount>()
  if(existing){
    if(existing.namespace_id!==sourceNamespace)throw new Error('This Google account already has a different backup. Review recovery before linking this Mac.')
    return existing
  }
  // Both keys are unique. Concurrent callbacks cannot attach one history to
  // two people, or create two namespaces for one Google account.
  await env.DB.prepare('INSERT OR IGNORE INTO google_backup_accounts(google_subject,namespace_id,email,created_at) VALUES(?,?,?,?)').bind(identity.subject,sourceNamespace,identity.email,now.toISOString()).run()
  const saved=await env.DB.prepare('SELECT * FROM google_backup_accounts WHERE google_subject=?').bind(identity.subject).first<GoogleBackupAccount>()
  if(!saved||saved.namespace_id!==sourceNamespace)throw new Error('This history is linked to another account. No application records were changed.')
  return saved
}
/** New access key for a verified Google account; history itself is never copied. */
export async function issueGoogleBackupAccess(env:Env,subject:string,now:Date){
  const account=await env.DB.prepare('SELECT * FROM google_backup_accounts WHERE google_subject=?').bind(subject).first<GoogleBackupAccount>()
  if(!account)throw new Error('No backup is linked to this Google account.')
  const id=crypto.randomUUID(),bytes=crypto.getRandomValues(new Uint8Array(32)),token=Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('')
  await env.DB.prepare('INSERT INTO google_backup_access(id,token_hash,namespace_id,created_at) VALUES(?,?,?,?)').bind(id,await sha(token),account.namespace_id,now.toISOString()).run()
  return {id,token,namespace:account.namespace_id,email:account.email}
}

/** Consume a verified browser request once, then issue app-only access. */
export async function completeGoogleBackup(env:Env,pollSecret:string,now:Date,choice:'link'|'restore'){
  if(!/^[a-f0-9]{64}$/.test(pollSecret))throw new Error('Invalid sign-in request.')
  const hash=await sha(pollSecret)
  const pending=await env.DB.prepare("SELECT google_subject,email,source_namespace FROM google_backup_requests WHERE poll_hash=? AND status='ready' AND expires_at>?").bind(hash,now.getTime()).first<{google_subject:string;email:string;source_namespace:string|null}>()
  if(!pending?.google_subject||!pending.email)throw new Error('Sign-in has expired or was already used.')
  const existing=await env.DB.prepare('SELECT * FROM google_backup_accounts WHERE google_subject=?').bind(pending.google_subject).first<GoogleBackupAccount>()
  if(choice==='link'&&existing&&existing.namespace_id!==pending.source_namespace)throw new Error('This Google account already has a backup. Review recovery before continuing.')
  if(choice==='restore'&&!existing)throw new Error('This Google account has no backup to restore.')
  const claim=await env.DB.prepare("UPDATE google_backup_requests SET status='consumed' WHERE poll_hash=? AND status='ready' AND expires_at>? RETURNING state_hash").bind(hash,now.getTime()).first()
  if(!claim)throw new Error('This sign-in was already used.')
  if(!existing){
    let namespace=pending.source_namespace
    if(!namespace){
      namespace=crypto.randomUUID()
      const inaccessible=crypto.getRandomValues(new Uint8Array(32))
      await env.DB.prepare('INSERT INTO backup_devices(id,token_hash,name,created_at) VALUES(?,?,?,?)').bind(namespace,await sha(Array.from(inaccessible).join(',')),'Google backup',now.toISOString()).run()
    }
    await linkGoogleBackup(env,{subject:pending.google_subject,email:pending.email},namespace,now)
  }
  await env.DB.prepare('UPDATE google_backup_accounts SET email=? WHERE google_subject=?').bind(pending.email,pending.google_subject).run()
  return issueGoogleBackupAccess(env,pending.google_subject,now)
}

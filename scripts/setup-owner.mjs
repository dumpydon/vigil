import { randomBytes, pbkdf2Sync } from 'node:crypto'
import { readFile, writeFile, chmod } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { stdin, stdout } from 'node:process'

const local=process.argv.includes('--local'),test=process.argv.includes('--test')
async function hidden(label){
  if(!stdin.isTTY)throw new Error('Run this command in an interactive terminal for a hidden password prompt.')
  stdout.write(label);stdin.setRawMode(true);stdin.resume();stdin.setEncoding('utf8')
  return new Promise((resolve,reject)=>{
    let value=''
    const finish=()=>{stdin.setRawMode(false);stdin.pause();stdin.off('data',onData);stdout.write('\n')}
    const onData=(chunk)=>{for(const ch of chunk){if(ch==='\u0003'){finish();reject(new Error('Cancelled.'));return}if(ch==='\r'||ch==='\n'){finish();resolve(value);return}if(ch==='\u007f'||ch==='\b')value=value.slice(0,-1);else if(ch>=' ')value+=ch}}
    stdin.on('data',onData)
  })
}
async function putSecret(name,value){
  await new Promise((resolve,reject)=>{
    const child=spawn('npx',['wrangler','secret','put',name,'--env',''],{stdio:['pipe','pipe','pipe']})
    // Wrangler outputs only the secret name and deployment status, never its input.
    child.stdout.pipe(stdout);child.stderr.pipe(process.stderr)
    child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(`Secret setup failed for ${name}.`)))
    child.stdin.end(value+'\n')
  })
}
try{
  if(test&&!local)throw new Error('Test credentials are restricted to local development.')
  if(test){try{await readFile('.dev.vars');console.log('Existing local credential retained.');process.exit(0)}catch{/* First local setup. */}}
  const password=test?randomBytes(24).toString('base64url'):await hidden('Owner password (at least 12 characters): ')
  if(password.length<12||password.length>256)throw new Error('Use 12 to 256 characters, preferably a password-manager generated password.')
  if(!test&&password!==await hidden('Confirm owner password: '))throw new Error('Passwords did not match. Nothing changed.')
  const salt=randomBytes(16).toString('hex')
  const hash=`pbkdf2-sha256$100000$${salt}$${pbkdf2Sync(password,Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex')}`
  const sessionSecret=randomBytes(32).toString('hex')
  if(local){
    await writeFile('.dev.vars',`OWNER_PASSWORD_HASH="${hash}"\nSESSION_SECRET="${sessionSecret}"\n`,{mode:0o600});await chmod('.dev.vars',0o600)
    if(test)await writeFile('.dev.credentials.local',JSON.stringify({password}),{mode:0o600})
    console.log('Local owner credential configured. Restart the local Worker if already running.')
  }else{
    await putSecret('SESSION_SECRET',sessionSecret);await putSecret('OWNER_PASSWORD_HASH',hash)
    console.log('Production owner credential configured. Existing sessions are revoked by the rotated session secret at next sign-in.')
  }
}catch(error){console.error(error.message);process.exitCode=1}

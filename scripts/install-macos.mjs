import {execFileSync} from 'node:child_process'
import {access,rename,rm,mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import os from 'node:os'
import {processesForApp} from './macos-processes.mjs'

const root=fileURLToPath(new URL('../',import.meta.url))
const source=path.join(root,'output/macos/Apply Vigil.app')
const destination='/Applications/Apply Vigil.app'
const staging='/Applications/Apply Vigil.installing.app'
const backup=path.join(os.homedir(),'Library/Application Support/ApplyVigilBackups',new Date().toISOString().replace(/[:.]/g,'-'))
const previous=path.join(backup,'Apply Vigil.app')
await access(source)
// Quit from the app first. Avoid replacing a running bundle or its local cache.
if(processesForApp(destination).length||processesForApp(source).length)throw new Error('Quit Apply Vigil before installing this build. Pending work is retained in its cache.')
await rm(staging,{recursive:true,force:true})
execFileSync('/usr/bin/ditto',[source,staging],{stdio:'inherit'})
execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',staging],{stdio:'inherit'})
let hasPrevious=false
try{await access(destination);hasPrevious=true}catch{}
if(hasPrevious){await mkdir(backup,{recursive:true,mode:0o700});await rename(destination,previous)}
try{await rename(staging,destination)}catch(error){if(hasPrevious)await rename(previous,destination);throw error}
execFileSync('/usr/bin/open',[destination],{stdio:'inherit'})
console.log(`Installed and launched ${destination}${hasPrevious?`; previous app retained at ${previous}`:''}`)

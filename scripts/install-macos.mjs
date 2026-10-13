import {execFileSync} from 'node:child_process'
import {access,rename,rm} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const root=fileURLToPath(new URL('../',import.meta.url))
const source=path.join(root,'output/macos/Apply Vigil.app')
const destination='/Applications/Apply Vigil.app'
const staging='/Applications/Apply Vigil.installing.app'
const previous='/Applications/Apply Vigil.previous.app'
await access(source)
// Quit from the app first. Avoid replacing a running bundle or its local cache.
const running=execFileSync('/bin/ps',['-axo','command='],{encoding:'utf8'}).split('\n').some(line=>line.startsWith(`${destination}/Contents/MacOS/ApplyVigil`))
if(running)throw new Error('Quit Apply Vigil before installing this build. Pending work is retained in its cache.')
await rm(staging,{recursive:true,force:true})
execFileSync('/usr/bin/ditto',[source,staging],{stdio:'inherit'})
execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',staging],{stdio:'inherit'})
await rm(previous,{recursive:true,force:true})
let hasPrevious=false
try{await access(destination);hasPrevious=true}catch{}
if(hasPrevious)await rename(destination,previous)
try{await rename(staging,destination)}catch(error){if(hasPrevious)await rename(previous,destination);throw error}
execFileSync('/usr/bin/open',[destination],{stdio:'inherit'})
console.log(`Installed and launched ${destination}`)

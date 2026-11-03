import {execFileSync} from 'node:child_process'
import {access,rename,rm,mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import os from 'node:os'
import {processesForApp} from './macos-processes.mjs'

const root=fileURLToPath(new URL('../',import.meta.url))
const local=!process.argv.includes('--connected')
const architecture=process.arch==='arm64'?'arm64':'x86_64'
const source=path.join(root,'output/macos',local?`local-${architecture}`:'',local?'Apply Vigil.app':'Vigil Owner (legacy).app')
const destination='/Applications/Apply Vigil.app'
const staging='/Applications/Apply Vigil.installing.app'
const backup=path.join(os.homedir(),'Library/Application Support/ApplyVigilBackups',new Date().toISOString().replace(/[:.]/g,'-'))
// Retain a rollback copy without registering it as another launchable app.
const previous=path.join(backup,'Apply Vigil.app.archived')
await access(source)
const identity=app=>execFileSync('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',path.join(app,'Contents/Info.plist')],{encoding:'utf8'}).trim()
let installedIdentity,installedExists=false
try{await access(destination);installedExists=true}catch(error){if(error.code!=='ENOENT')throw error}
if(installedExists)installedIdentity=identity(destination)
if(installedIdentity&&installedIdentity!==identity(source)&&!process.argv.includes('--allow-mode-change'))throw new Error('This would switch between separate local and connected histories. Back up both first; an explicit --allow-mode-change is required after reviewing the switch.')
// Quit from the app first. Avoid replacing a running bundle or its local cache.
if(processesForApp(destination).length||processesForApp(source).length)throw new Error('Quit Apply Vigil before installing this build. Pending work is retained in its cache.')
await rm(staging,{recursive:true,force:true})
execFileSync('/usr/bin/ditto',[source,staging],{stdio:'inherit'})
execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',staging],{stdio:'inherit'})
let hasPrevious=false
try{await access(destination);hasPrevious=true}catch{}
if(hasPrevious){await mkdir(backup,{recursive:true,mode:0o700});await rename(destination,previous)}
try{await rename(staging,destination)}catch(error){if(hasPrevious)await rename(previous,destination);throw error}
// Refresh Launch Services after an explicitly reviewed identity change, so
// Finder and launch-at-login do not keep the previous bundle metadata.
execFileSync('/usr/bin/xcrun',['swift','-',destination],{cwd:root,input:'import Foundation\nimport CoreServices\nlet result = LSRegisterURL(URL(fileURLWithPath: CommandLine.arguments[1]) as CFURL, true)\nif result != noErr { fatalError("App registration failed: \\(result)") }\n',stdio:['pipe','inherit','inherit']})
execFileSync('/usr/bin/open',[destination,'--args','--show'],{stdio:'inherit'})
console.log(`Installed and launched ${destination}${hasPrevious?`; previous app retained at ${previous}`:''}`)

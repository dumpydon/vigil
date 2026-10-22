import {build} from 'esbuild'
import {writeSounds} from './sounds.mjs'
import {mkdir,readFile,writeFile,copyFile,rm,rename} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {processesForApp} from './macos-processes.mjs'

const root=fileURLToPath(new URL('../',import.meta.url))
const release=JSON.parse(await readFile(path.join(root,'macos/release-config.json'),'utf8'))
if(!/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(release.version)||!/^\d+$/.test(release.bundleVersion))throw new Error('Invalid Mac release version.')
const test=process.argv.includes('--test')
const local=process.argv.includes('--local')
const archIndex=process.argv.indexOf('--arch')
const architecture=archIndex>=0?process.argv[archIndex+1]:process.arch==='arm64'?'arm64':'x86_64'
if(!['arm64','x86_64'].includes(architecture))throw new Error('Use --arch arm64 or --arch x86_64.')
const name=test?(local?'Apply Vigil Local Tests':'Apply Vigil Tests'):'Apply Vigil'
const output=path.join(root,'output/macos',local&&!test?`local-${architecture}`:'')
const staging=path.join(output,`${name}.staging.app`)
const app=path.join(output,`${name}.app`)
if(processesForApp(app).length)throw new Error(`Quit ${app} before rebuilding it. Its retained records will not be removed.`)
const resources=path.join(staging,'Contents/Resources')
const web=path.join(resources,'web')
const run=(executable,args)=>execFileSync(executable,args,{cwd:root,stdio:'inherit'})
await rm(staging,{recursive:true,force:true})
await mkdir(web,{recursive:true})
await mkdir(path.join(staging,'Contents/MacOS'),{recursive:true})
await build({entryPoints:[path.join(root,'src/main.tsx')],outfile:path.join(web,'app.js'),bundle:true,format:'iife',minify:true,target:'safari16',define:{'import.meta.env.DEV':'false','import.meta.hot':'undefined','process.env.NODE_ENV':'"production"'},legalComments:'eof'})
await copyFile(path.join(root,'public/mark.svg'),path.join(web,'mark.svg'))
await writeFile(path.join(web,'index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>Apply Vigil</title><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script src="app.js" defer></script></body></html>`)
let plist=await readFile(path.join(root,'macos/Info.plist'),'utf8')
if(test)plist=plist.replace('dev.dumpydon.ApplyVigil<','dev.dumpydon.ApplyVigil.SmokeTests<').replaceAll('<string>Apply Vigil</string>','<string>Apply Vigil Tests</string>')
if(local){plist=plist.replace('<key>ApplyVigilLocalOnly</key><false/>','<key>ApplyVigilLocalOnly</key><true/>').replace(test?'dev.dumpydon.ApplyVigil.SmokeTests<':'dev.dumpydon.ApplyVigil<',test?'dev.dumpydon.ApplyVigil.SmokeTests.Local<':'dev.dumpydon.ApplyVigil.Local<');if(test)plist=plist.replaceAll('<string>Apply Vigil Tests</string>','<string>Apply Vigil Local Tests</string>')}
if(local)plist=plist.replace(/(<key>CFBundleVersion<\/key><string>)[^<]+/,(_,prefix)=>prefix+release.bundleVersion).replace(/(<key>CFBundleShortVersionString<\/key><string>)[^<]+/,(_,prefix)=>prefix+release.version.split('-')[0]).replace('</dict>',`  <key>ApplyVigilDisplayVersion</key><string>${release.version}</string>\n</dict>`)
await writeFile(path.join(staging,'Contents/Info.plist'),plist)
await writeFile(path.join(staging,'Contents/PkgInfo'),'APPL????')

await writeSounds(resources)
const iconset=path.join(output,'AppIcon.iconset')
await mkdir(iconset,{recursive:true})
run('/usr/bin/xcrun',['swift',path.join(root,'macos/GenerateIcon.swift'),iconset])
run('/usr/bin/iconutil',['-c','icns',iconset,'-o',path.join(resources,'AppIcon.icns')])
run('/usr/bin/xcrun',['swiftc','-O','-parse-as-library','-swift-version','5','-target',`${architecture}-apple-macos13.0`,'-framework','AppKit','-framework','WebKit','-framework','UserNotifications','-framework','ServiceManagement','-framework','UniformTypeIdentifiers','macos/Sources/APISession.swift','macos/Sources/main.swift','-o',path.join(staging,'Contents/MacOS/ApplyVigil')])
run('/usr/bin/plutil',['-lint',path.join(staging,'Contents/Info.plist')])
run('/usr/bin/codesign',['--force','--sign','-','--timestamp=none',staging])
run('/usr/bin/codesign',['--verify','--deep','--strict',staging])
await rm(app,{recursive:true,force:true});await rename(staging,app)
console.log(`Built ${app}`)

import {build} from 'esbuild'
import {mkdir,readFile,writeFile,copyFile,rm,rename} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const root=fileURLToPath(new URL('../',import.meta.url))
const test=process.argv.includes('--test')
const name=test?'Apply Vigil Tests':'Apply Vigil'
const output=path.join(root,'output/macos')
const staging=path.join(output,`${name}.staging.app`)
const app=path.join(output,`${name}.app`)
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
await writeFile(path.join(staging,'Contents/Info.plist'),plist)
await writeFile(path.join(staging,'Contents/PkgInfo'),'APPL????')

// Original short sine/bell chimes. No reference-app audio is redistributed.
function chime(notes,duration,{decay=6,brightness=.12,gain=.18}={}){
  const rate=44100,frames=Math.ceil(rate*duration),buffer=Buffer.alloc(44+frames*2)
  buffer.write('RIFF');buffer.writeUInt32LE(buffer.length-8,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(frames*2,40)
  for(let i=0;i<frames;i++){
    const t=i/rate
    let sample=0
    for(const [frequency,start] of notes){const a=t-start;if(a>=0){const envelope=Math.min(1,a/.015)*Math.exp(-a*decay)*(1-Math.max(0,(t-duration+.12)/.12));sample+=envelope*(Math.sin(2*Math.PI*frequency*a)+brightness*Math.sin(2*Math.PI*frequency*2*a))*gain}}
    buffer.writeInt16LE(Math.round(Math.max(-.9,Math.min(.9,sample))*32767),44+i*2)
  }
  return buffer
}
await writeFile(path.join(resources,'gentle.wav'),chime([[740,0],[987.77,.11]],.75))
await writeFile(path.join(resources,'complete.wav'),chime([[659.25,0],[830.61,.10],[987.77,.20]],1.05))
await writeFile(path.join(resources,'bell.wav'),chime([[523.25,0],[1444.17,0]],1.1,{decay:4.5,brightness:.2,gain:.14}))
await writeFile(path.join(resources,'ripple.wav'),chime([[587.33,0],[783.99,.16],[1174.66,.32]],1.2,{decay:7,brightness:.04}))
await writeFile(path.join(resources,'marimba.wav'),chime([[523.25,0],[659.25,.10],[783.99,.20]],.7,{decay:16,brightness:.34,gain:.23}))
await writeFile(path.join(resources,'stardust.wav'),chime([[1318.51,0],[1661.22,.13],[1975.53,.26],[2637.02,.39]],1.25,{decay:10,brightness:.07,gain:.14}))
const iconset=path.join(output,'AppIcon.iconset')
await mkdir(iconset,{recursive:true})
run('/usr/bin/xcrun',['swift',path.join(root,'macos/GenerateIcon.swift'),iconset])
run('/usr/bin/iconutil',['-c','icns',iconset,'-o',path.join(resources,'AppIcon.icns')])
const architecture=process.arch==='arm64'?'arm64':'x86_64'
run('/usr/bin/xcrun',['swiftc','-O','-parse-as-library','-swift-version','5','-target',`${architecture}-apple-macos13.0`,'-framework','AppKit','-framework','WebKit','-framework','Security','-framework','UserNotifications','-framework','ServiceManagement','-framework','UniformTypeIdentifiers','macos/Sources/APISession.swift','macos/Sources/main.swift','-o',path.join(staging,'Contents/MacOS/ApplyVigil')])
run('/usr/bin/plutil',['-lint',path.join(staging,'Contents/Info.plist')])
run('/usr/bin/codesign',['--force','--sign','-','--timestamp=none',staging])
run('/usr/bin/codesign',['--verify','--deep','--strict',staging])
await rm(app,{recursive:true,force:true});await rename(staging,app)
console.log(`Built ${app}`)

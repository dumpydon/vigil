import {execFileSync} from 'node:child_process'
import {readFile,readdir,lstat} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root=fileURLToPath(new URL('../',import.meta.url))
const app=path.resolve(root,process.argv[2]??'output/macos/Apply Vigil.app')
const required=new Set([
  'Contents/Info.plist','Contents/PkgInfo','Contents/MacOS/ApplyVigil',
  'Contents/_CodeSignature/CodeResources','Contents/Resources/AppIcon.icns',
  'Contents/Resources/web/index.html','Contents/Resources/web/app.js',
  'Contents/Resources/web/app.css','Contents/Resources/web/mark.svg',
  ...['gentle','complete','bell','ripple','marimba','stardust'].map(name=>`Contents/Resources/${name}.wav`),
])
const files=[]
async function visit(directory){
  for(const name of await readdir(directory)){
    const filename=path.join(directory,name),stat=await lstat(filename)
    if(stat.isSymbolicLink())throw new Error(`Unexpected symlink in app bundle: ${path.relative(app,filename)}`)
    if(stat.isDirectory())await visit(filename)
    else files.push(path.relative(app,filename))
  }
}
await visit(app)
for(const file of files)if(!required.delete(file))throw new Error(`Unexpected file in distributable bundle: ${file}`)
if(required.size)throw new Error(`Missing bundle files: ${[...required].join(', ')}`)
const plist=key=>execFileSync('/usr/libexec/PlistBuddy',['-c',`Print :${key}`,path.join(app,'Contents/Info.plist')],{encoding:'utf8'}).trim()
if(plist('LSUIElement')!=='true')throw new Error('The app must stay out of the Dock.')
if(plist('CFBundleExecutable')!=='ApplyVigil')throw new Error('Unexpected native executable.')
const architecture=process.arch==='arm64'?'arm64':'x86_64'
const architectures=execFileSync('/usr/bin/lipo',['-archs',path.join(app,'Contents/MacOS/ApplyVigil')],{encoding:'utf8'}).trim().split(/\s+/)
if(!architectures.includes(architecture))throw new Error('The native build does not support its target architecture.')
for(const file of files.filter(file=>file.endsWith('.wav'))){
  const wave=await readFile(path.join(app,file))
  if(wave.toString('ascii',0,4)!=='RIFF'||wave.toString('ascii',8,12)!=='WAVE'||wave.readUInt32LE(40)!==wave.length-44||wave.length<4410)throw new Error(`Invalid bundled sound: ${file}`)
}
execFileSync('/usr/bin/codesign',['--verify','--deep','--strict',app],{stdio:'inherit'})
console.log(`Verified ${files.length} bundle files, ${architectures.join('/')}, menu-only activation, sounds, and signature.`)

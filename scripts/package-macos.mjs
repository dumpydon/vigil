import {execFileSync} from 'node:child_process'
import {mkdir,readFile,writeFile,access,rm,stat} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const root=fileURLToPath(new URL('../',import.meta.url))
const release=JSON.parse(await readFile(path.join(root,'macos/release-config.json'),'utf8'))
if(!/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(release.version)||!/^\d+$/.test(release.bundleVersion))throw new Error('Invalid Mac release version.')
const archIndex=process.argv.indexOf('--arch')
const architectures=archIndex<0?['arm64','x86_64']:[process.argv[archIndex+1]]
if(architectures.some(arch=>!['arm64','x86_64'].includes(arch)))throw new Error('Use --arch arm64 or --arch x86_64.')
const output=path.join(root,'output/releases'),venv=path.join(root,'output/release-tools'),python=path.join(venv,'bin/python')
const run=(command,args)=>execFileSync(command,args,{cwd:root,stdio:'inherit'})
await mkdir(output,{recursive:true})
try{await access(python)}catch{run('python3',['-m','venv',venv])}
run(python,['-m','pip','install','--disable-pip-version-check','dmgbuild==1.6.7','ds_store==1.3.3','mac_alias==2.2.3'])
const background=path.join(output,'dmg-background.png')
run('/usr/bin/xcrun',['swift',path.join(root,'macos/DMGBackground.swift'),background])
const tag=`macos-v${release.version}`,base=`https://github.com/${release.repository}/releases/download/${tag}`
const assets=[]
for(const architecture of architectures){
  run(process.execPath,['scripts/build-macos.mjs','--local','--arch',architecture])
  const app=path.join(root,`output/macos/local-${architecture}/Apply Vigil.app`),info=path.join(app,'Contents/Info.plist')
  run(process.execPath,['scripts/verify-macos-bundle.mjs',app,architecture])
  const plist=key=>execFileSync('/usr/libexec/PlistBuddy',['-c',`Print :${key}`,info],{encoding:'utf8'}).trim()
  if(plist('ApplyVigilLocalOnly')!=='true'||plist('CFBundleIdentifier')!=='dev.dumpydon.ApplyVigil.Local'||plist('ApplyVigilDisplayVersion')!==release.version||plist('CFBundleVersion')!==release.bundleVersion)throw new Error('Only a correctly versioned local-only bundle may be distributed.')
  const arch=architecture==='x86_64'?'x64':architecture,stem=`ApplyVigil-${release.version}-${arch}`
  const dmg=path.join(output,`${stem}.dmg`),zip=path.join(output,`${stem}.zip`)
  await rm(dmg,{force:true});await rm(zip,{force:true})
  run(path.join(venv,'bin/dmgbuild'),['-s',path.join(root,'macos/DMGSettings.py'),'-D',`app=${app}`,'-D',`background=${background}`,'-D',`icon=${path.join(app,'Contents/Resources/AppIcon.icns')}`,'Apply Vigil',dmg])
  run('/usr/bin/codesign',['--force','--sign','-','--timestamp=none',dmg])
  run('/usr/bin/codesign',['--verify','--strict',dmg])
  run('/usr/bin/hdiutil',['verify',dmg])
  run('/usr/bin/ditto',['-c','-k','--keepParent',app,zip])
  const mount=path.join(output,`mounted-${arch}`),unpacked=path.join(output,`unpacked-${arch}`)
  await mkdir(mount,{recursive:true})
  run('/usr/bin/hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,dmg])
  try{run(process.execPath,['scripts/verify-macos-bundle.mjs',path.join(mount,'Apply Vigil.app'),architecture])}
  finally{run('/usr/bin/hdiutil',['detach',mount])}
  await rm(unpacked,{recursive:true,force:true});await mkdir(unpacked,{recursive:true})
  run('/usr/bin/ditto',['-x','-k',zip,unpacked])
  run(process.execPath,['scripts/verify-macos-bundle.mjs',path.join(unpacked,'Apply Vigil.app'),architecture])
  if(!((await stat(path.join(unpacked,'Apply Vigil.app/Contents/MacOS/ApplyVigil'))).mode&0o111))throw new Error('The ZIP lost executable permissions.')
  await rm(unpacked,{recursive:true,force:true})
  for(const file of [dmg,zip])assets.push({architecture:arch,file:path.basename(file),bytes:(await stat(file)).size,sha512:createHash('sha512').update(await readFile(file)).digest('hex'),url:`${base}/${path.basename(file)}`})
}
const manifest={version:release.version,tag,minimumMacOS:release.minimumMacOS,localOnly:true,signing:'ad-hoc',notarized:false,assets}
await writeFile(path.join(output,'release.json'),JSON.stringify(manifest,null,2)+'\n')
await writeFile(path.join(output,'SHA512SUMS.txt'),assets.map(asset=>`${asset.sha512}  ${asset.file}`).join('\n')+'\n')
// A partial-architecture CI job must not overwrite the public two-target manifest.
if(architectures.length===2)await writeFile(path.join(root,'site/download/release.json'),JSON.stringify(manifest,null,2)+'\n')
console.log(`Packaged ${release.version}: ${assets.map(asset=>asset.file).join(', ')}`)

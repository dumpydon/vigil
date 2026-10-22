import {cp,mkdir,readFile} from 'node:fs/promises'
import {writeSounds} from './sounds.mjs'

await mkdir('dist/download',{recursive:true})
await cp('site/download','dist/download',{recursive:true})
await cp('site/download/index.html','dist/index.html')
for(const [route,file] of Object.entries({install:'install',privacy:'privacy',changelog:'changelog',tour:'demo','first-launch':'first-launch'})){
  await mkdir('dist/'+route,{recursive:true})
  await cp(`site/download/${file}.html`,`dist/${route}/index.html`)
}
await writeSounds('dist/download/assets/sounds')
const html=await readFile('dist/download/index.html','utf8')
if(/heymykro\/vigil-releases|vercel\.com\/|va\.vercel|<script[^>]*src=["']https?:/i.test(html))throw new Error('The download page must use Apply Vigil releases and local scripts.')
const published=JSON.parse(await readFile('site/download/release.json','utf8'))
if(!/^\d+\.\d+\.\d+-beta\.\d+$/.test(published.version)||published.tag!==`macos-v${published.version}`||!published.localOnly||published.notarized||published.signing!=='ad-hoc')throw new Error('Invalid published Mac beta metadata.')
const assetUrls=new Set(published.assets.map(asset=>asset.url))
const downloadLinks=Array.from(html.matchAll(/href="(https:\/\/github\.com\/dumpydon\/vigil\/releases\/download\/[^"\s]+)"/g),match=>match[1])
if(!downloadLinks.length||downloadLinks.some(url=>!assetUrls.has(url)))throw new Error('Website download buttons must match the published release manifest.')
for(const arch of ['arm64','x64']){
  const file=`ApplyVigil-${published.version}-${arch}.dmg`
  if(!downloadLinks.includes(`https://github.com/dumpydon/vigil/releases/download/${published.tag}/${file}`))throw new Error(`Missing ${arch} download for the published Mac beta.`)
}
console.log('Public Apply Vigil download pages and local demo media built.')

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
console.log('Public Apply Vigil download pages and local demo media built.')

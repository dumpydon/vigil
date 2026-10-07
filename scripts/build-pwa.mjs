import { readFile, writeFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const assets=(await readdir('dist/assets')).filter(n=>/\.(?:js|css)$/.test(n)).map(n=>'/assets/'+n)
const shell=['/','/index.html','/mark.svg','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png','/icons/apple-touch-icon.png',...assets]
const checksum=createHash('sha256').update(JSON.stringify(shell))
for(const url of shell)checksum.update(await readFile('dist'+(url==='/'?'/index.html':url)))
const digest=checksum.digest('hex').slice(0,12)
const template=await readFile('public/sw.js','utf8')
await writeFile('dist/sw.js',template.replace('__CACHE__','vigil-shell-'+digest).replace('__ASSETS__',JSON.stringify(shell)))
console.log('App-shell service worker generated; API routes excluded from caching.')

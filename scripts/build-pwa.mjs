import { readFile, writeFile, readdir, mkdir, rename } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const assets=(await readdir('dist/assets')).filter(n=>/\.(?:js|css)$/.test(n)).map(n=>'/assets/'+n)
await mkdir('dist/dashboard',{recursive:true})
await rename('dist/index.html','dist/dashboard/index.html')
const shell=['/dashboard/','/mark.svg','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/maskable-512.png','/icons/apple-touch-icon.png',...assets]
const checksum=createHash('sha256').update(JSON.stringify(shell))
for(const url of shell)checksum.update(await readFile('dist'+(url==='/dashboard/'?'/dashboard/index.html':url)))
const digest=checksum.digest('hex').slice(0,12)
const template=await readFile('public/sw.js','utf8')
await writeFile('dist/dashboard/sw.js',template.replace('__CACHE__','vigil-shell-'+digest).replace('__ASSETS__',JSON.stringify(shell)))
await writeFile('dist/sw.js',await readFile('public/legacy-sw.js','utf8'))
console.log('Dashboard offline shell generated; public pages and API excluded. Legacy root worker retires without deleting data.')

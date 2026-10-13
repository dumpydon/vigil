import {execFileSync} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const root=fileURLToPath(new URL('../',import.meta.url))
execFileSync(process.execPath,['scripts/build-macos.mjs','--test'],{cwd:root,stdio:'inherit'})
const report=path.join(root,'output/macos/native-smoke-report.json')
execFileSync(path.join(root,'output/macos/Apply Vigil Tests.app/Contents/MacOS/ApplyVigil'),['--smoke-test','--report',report],{cwd:root,stdio:'inherit',timeout:60_000})
const result=JSON.parse(await readFile(report,'utf8'))
if(!result.passed)throw new Error(result.error??'Native smoke tests failed')
console.log(JSON.stringify(result,null,2))

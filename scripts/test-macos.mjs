import {execFileSync} from 'node:child_process'
import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const root=fileURLToPath(new URL('../',import.meta.url))
const local=process.argv.includes('--local')
execFileSync(process.execPath,['scripts/test-macos-session.mjs'],{cwd:root,stdio:'inherit'})
execFileSync(process.execPath,['scripts/build-macos.mjs','--test',...(local?['--local']:[])],{cwd:root,stdio:'inherit'})
const report=path.join(root,`output/macos/native-${local?'local-':''}smoke-report.json`)
execFileSync(path.join(root,`output/macos/${local?'Apply Vigil Local Tests':'Apply Vigil Tests'}.app/Contents/MacOS/ApplyVigil`),['--smoke-test','--report',report],{cwd:root,stdio:'inherit',timeout:60_000})
const result=JSON.parse(await readFile(report,'utf8'))
if(!result.passed)throw new Error(result.error??'Native smoke tests failed')
console.log(JSON.stringify(result,null,2))

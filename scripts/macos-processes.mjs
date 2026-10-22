import {execFileSync} from 'node:child_process'
import path from 'node:path'

export function processesForApp(app,listing=execFileSync('/bin/ps',['-axo','pid=,command='],{encoding:'utf8'})){
  const executable=path.resolve(app,'Contents/MacOS/ApplyVigil')
  return listing.split('\n').flatMap(line=>{
    const match=line.match(/^\s*(\d+)\s+(.+)$/)
    return match&&(match[2]===executable||match[2].startsWith(executable+' '))?[Number(match[1])]:[]
  })
}

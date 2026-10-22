import {describe,it,expect} from 'vitest'
import {processesForApp} from '../scripts/macos-processes.mjs'

describe('safe native app replacement',()=>{
  it('recognizes a running bundle with spaces and optional arguments',()=>{
    const app='/Applications/Apply Vigil.app',binary=app+'/Contents/MacOS/ApplyVigil'
    const listing=`  41 ${binary}\n42 ${binary} --show\n43 ${binary}Helper\n44 /Applications/Vigil.app/Contents/MacOS/Vigil\n45 /bin/zsh -c ${binary}\n`
    expect(processesForApp(app,listing)).toEqual([41,42])
  })
  it('distinguishes the development bundle from the installed copy',()=>{
    const app='/tmp/vigil/output/macos/Apply Vigil.app'
    expect(processesForApp(app,'46 '+app+'/Contents/MacOS/ApplyVigil')).toEqual([46])
    expect(processesForApp('/Applications/Apply Vigil.app','46 '+app+'/Contents/MacOS/ApplyVigil')).toEqual([])
  })
})

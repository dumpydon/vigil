import {execFileSync} from 'node:child_process'
import {mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const root=fileURLToPath(new URL('../',import.meta.url))
const output=path.join(root,'output/macos/session-tests')
await mkdir(output,{recursive:true})
const executable=path.join(output,'APISessionTests')
execFileSync('/usr/bin/xcrun',['swiftc','-parse-as-library','-swift-version','5',
  'macos/Sources/APISession.swift','macos/Tests/APISessionTests.swift','-o',executable],{cwd:root,stdio:'inherit'})
const symbols=execFileSync('/usr/bin/nm',['-u',executable],{encoding:'utf8'})
if(/\b_SecItem(?:CopyMatching|Add|Update|Delete)\b/.test(symbols))throw new Error('Native sessions must not call Keychain item APIs.')
execFileSync(executable,[],{cwd:root,stdio:'inherit',timeout:20_000})

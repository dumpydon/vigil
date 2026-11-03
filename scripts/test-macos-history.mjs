import {execFileSync} from 'node:child_process'
import {mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const root=fileURLToPath(new URL('../',import.meta.url)),output=path.join(root,'output/macos/history-tests')
await mkdir(output,{recursive:true})
const executable=path.join(output,'HistoryVaultTests')
execFileSync('/usr/bin/xcrun',['swiftc','-parse-as-library','-swift-version','5','macos/Sources/APISession.swift','macos/Sources/HistoryVault.swift','macos/Tests/HistoryVaultTests.swift','-o',executable],{cwd:root,stdio:'inherit'})
execFileSync(executable,[],{cwd:root,stdio:'inherit',timeout:30_000})

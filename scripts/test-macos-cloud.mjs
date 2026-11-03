import {execFileSync} from 'node:child_process'
import {mkdir} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
const root=fileURLToPath(new URL('../',import.meta.url)),output=path.join(root,'output/macos/cloud-tests')
await mkdir(output,{recursive:true})
const executable=path.join(output,'CloudBackupTests')
execFileSync('/usr/bin/xcrun',['swiftc','-parse-as-library','-swift-version','5','-framework','AppKit','-framework','UniformTypeIdentifiers','macos/Sources/APISession.swift','macos/Sources/BackupIdentity.swift','macos/Sources/CloudBackup.swift','macos/Tests/CloudBackupTests.swift','-o',executable],{cwd:root,stdio:'inherit'})
execFileSync(executable,[],{cwd:root,stdio:'inherit',timeout:30_000})

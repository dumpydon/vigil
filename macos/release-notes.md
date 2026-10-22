Apply Vigil 1.0.0-beta.2 is a free Mac menu bar app for keeping track of completed job applications, daily goals, and progress. The public app works entirely on your Mac: no account, owner password, or internet connection is needed.

## Fixed in this release

- Removed the legacy login Keychain integration. The app no longer reads, writes, or deletes saved owner-session Keychain items. Build checks reject binaries that contain those calls.
- The public download remains local-only and account-free, including after quitting or restarting your Mac. It does not request your Mac login password to store an owner session.
- Fixed the native website action: public mode opens the download homepage; the separate connected owner build opens `/dashboard/`.
- Corrected connected-build sign-in wording. That separate build keeps its login only in memory while open; cloud sync requires signing in again after quitting. Existing records, drafts, and pending changes remain retained.
- Rejected malformed day-edit data with a validation message instead of an internal error.
- Removed unused code and guarded local build/install commands against replacing running app bundles. Local installs retain timestamped rollback copies.

## Included

- Quick +1, +2, +3 and +5 counts, custom counts, and mixed batches for Easy Apply and external applications.
- A glass menu panel with no Dock icon and a movable, resizable floating window sharing the same records.
- Daily goals, 7/15/30-day charts, fixed UTC period totals, hourly activity, history, and reviewed corrections.
- Quiet progress alerts, six sounds plus silence, optional macOS banners, and launch at login.
- JSON/CSV backups and JSON restore. No activity upload, browser monitoring, or automatic job applications.

[Download page](https://vigil.dumpydon.workers.dev/) · [Installation guide](https://vigil.dumpydon.workers.dev/install/) · [Privacy](https://vigil.dumpydon.workers.dev/privacy/)

## Update and first open

Choose **arm64** for Apple Silicon (M-series Macs) or **x64** for Intel. Both require macOS 13 or later. DMGs provide a drag-to-Applications installer; ZIPs are alternatives.

If you already use the public local beta, export a JSON backup, quit Apply Vigil, and replace it in Applications. Its bundle identity and local storage remain the same. Do not replace a connected owner build with the public local app without a separate backup and explicit switch: they use different record stores.

1. Open the DMG, drag Apply Vigil into Applications, then eject the disk image.
2. Try opening Apply Vigil from Applications.
3. This beta is ad-hoc signed and **not notarized**. If macOS blocks its first launch, follow System Settings → Privacy & Security → **Open Anyway** for this app, and confirm Open if you trust your download.
4. Find Apply Vigil in the menu bar. There is no Dock icon.

The first-launch Gatekeeper approval is separate from login Keychain access; this fix does not claim Apple notarization or remove that first-launch check. Keep Gatekeeper enabled. For a “damaged” or “will damage your computer” warning, stop and contact us.

## Verification and compatibility

Shared lint, production build, and all 140 regression tests pass. Native checks cover memory-only sessions, local persistence, draft/queue retention, two-window behavior, menu-only activation, and blocked owner API requests in the public app. Packaging verifies exact file lists, version/local-mode metadata, the absence of Keychain item APIs, strict signatures, mounted DMGs, extracted ZIPs, and executable permissions.

Apple Silicon was exercised on macOS 15.7.8. Intel binaries are cross-compiled and structurally verified; physical Intel and clean macOS 13 runtime tests remain compatibility limits.

`SHA512SUMS.txt` and `release.json` contain SHA-512 values for every installer. Compare a downloaded file with:

```sh
shasum -a 512 ApplyVigil-1.0.0-beta.2-arm64.dmg
```

Updates are manual in this beta. Public installers contain no personal data, owner credentials, or cloud-connected owner build.

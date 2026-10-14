Apply Vigil is a free Mac menu bar app for keeping track of job applications, daily goals and progress. This first public beta works entirely on your Mac: no account, owner password or internet connection is needed. Your own history starts empty.

## Included

- Quick +1, +2, +3 and +5 counts, custom counts and mixed batches for Easy Apply and external applications.
- A compact glass menu panel with no Dock icon, plus a movable, resizable floating window sharing the same records.
- Daily goals, 7/15/30-day charts, fixed UTC period totals, hourly activity, history and reviewed corrections.
- Quiet progress alerts, six sounds plus silence, and optional macOS banners and launch at login.
- JSON/CSV backups and JSON restore. No activity upload, browser monitoring or automatic job applications.

[Download page and product tour](https://vigil.dumpydon.workers.dev/) · [Installation guide](https://vigil.dumpydon.workers.dev/install/) · [Privacy](https://vigil.dumpydon.workers.dev/privacy/)

## Download and first open

Choose **arm64** for Apple Silicon (M-series Macs), or **x64** for Intel. Both require macOS 13 or later. DMGs provide a drag-to-Applications installer; ZIPs are alternatives.

1. Open the DMG and drag Apply Vigil into Applications, then eject the disk image.
2. Try opening Apply Vigil from Applications.
3. If macOS blocks the first launch, open System Settings → Privacy & Security, choose **Open Anyway** for Apply Vigil, and confirm Open.
4. Look for Apply Vigil in your menu bar. It does not appear in the Dock.

This beta is anonymously ad-hoc signed and **not notarized**. No Gatekeeper-disable command is needed. Updates are manual: download a newer beta and replace the app after quitting it. Keep regular JSON backups.

## Verification and compatibility

Both app architectures and exact bundle contents were verified before packaging and again after read-only mounting the DMGs. ZIPs were extracted and checked for strict signatures and executable permissions. Shared checks include 119 passing tests. Native checks verified local persistence, two-window behavior and zero API requests.

Apple Silicon was exercised on macOS 15.7.8. The Intel binary is cross-compiled and structurally verified; physical Intel and clean macOS 13 runtime tests are still pending. Please report beta issues with your Mac architecture and macOS version, without attaching private application history.

`SHA512SUMS.txt` and `release.json` contain SHA-512 values for every binary. Compare a downloaded file with:

```sh
shasum -a 512 ApplyVigil-1.0.0-beta.1-arm64.dmg
```

The connected owner app is a separate build and storage identity. This public beta does not connect to or include the owner's cloud records. Cloud sync and automatic updates are planned for later.

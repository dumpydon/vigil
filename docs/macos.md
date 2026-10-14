# Apply Vigil for macOS

Apply Vigil is an independent menu bar application for the existing Vigil
application tracker. It runs alongside the coding-agent app called Vigil.
Two separate flavors share the interface:

- **Public local beta:** `dev.dumpydon.ApplyVigil.Local`, starts empty without an
  account, stores records on the Mac, and never calls the owner API.
- **Connected owner build:** `dev.dumpydon.ApplyVigil`, retains the existing
  Cloudflare workspace, Keychain session and offline queue.

Public downloads: <https://vigil.dumpydon.workers.dev/>. The connected
owner installation stays separate and is not silently replaced by public builds.

## Approve a downloaded beta’s first launch

The public beta is ad-hoc signed and not notarized by Apple. Its
[15-second illustrated walkthrough](https://vigil.dumpydon.workers.dev/first-launch/)
and [written install guide](https://vigil.dumpydon.workers.dev/install/)
show the download, Applications folder, first-open warning, and app approval.

For an unverified-app or unidentified-developer warning, keep the app in
Applications and dismiss the dialog with Done (or Cancel / OK). Open System
Settings → Privacy & Security, scroll to Security, and choose Open Anyway beside
Apply Vigil. Some macOS versions show Open first. Confirm opening and authenticate
on your Mac if requested. If the notice has expired, try opening the app again;
Apple says the button is available for about an hour after an attempt.

Keep Gatekeeper enabled. This flow covers the unverified-developer warning;
damaged-app or malware warnings require investigation. See
[Apple’s guidance](https://support.apple.com/en-us/102445).

## Use the installed app

Open **Apply Vigil** from Applications. Its circle/check icon appears in the
macOS menu bar; there is no Dock icon. Click it to open or close the panel.
Right-click it for the compact pop-out, Settings, pinning, the website, and Quit.
The dashboard is 425 × 600 points at an 85% interface scale, close to the Vigil
reference app's proportions.

The public beta needs no sign-in and labels saved data **On this Mac**.
For the connected build, sign in with the web workspace's current owner password. This app has a separate
session from Safari and Chrome. The server-issued session is retained in
Keychain for its server-defined lifetime (up to 90 days); the app never retains
the owner password. Password resets revoke older sessions.

- **Today:** current UTC goal, remaining count, Easy Apply/external quick buttons,
  custom and mixed batches, goal changes, progress statistics, and undo.
- **Usage:** day navigation, calendar, reviewed count adjustments, 7/15/30-day
  charts, fixed-period totals, hourly totals, entry editing, and deletion review.
- **Alerts:** the existing quiet progress inbox, read/clear controls, and pause.
- **Settings:** optional launch at login, pinning, menu count/percentage/icon,
  optional macOS banners, six sounds plus silence, JSON/CSV export, JSON restore,
  owner session (connected build only), and Quit.

The six sounds are Soft chime, macOS Glass, Bell, Ripple, Marimba, and Stardust.
Choose Silent to turn sounds off. Preview sound uses the selected option; the
four added sounds are original generated audio bundled with the app.

Both windows use a native macOS blur material behind a transparent web view. A
dark tint fades toward the bottom so the wallpaper or window behind it contributes
to the glass appearance. The browser preview approximates this with CSS blur;
the installed app uses AppKit's
[behind-window blending](https://developer.apple.com/documentation/appkit/nsvisualeffectview/blendingmode-swift.enum/behindwindow).

Click the outward-arrow button beside the pin to open a separate **compact
window**. It stays above other apps, can move and resize, remembers its position,
and includes counts, quick/custom logging, undo, and an Open dashboard button.
It shares the same records, cache, drafts and operation queue as the menu panel.
The connected build also shares its owner session and Cloudflare records. Closing either window does not discard retained operations;
closing the compact window leaves the menu bar app running.

Pinning keeps the panel open when you use another app. Native file dialogs keep
the panel and drafts available while choosing a backup destination or import.
Closing the panel leaves the app running; Quit stops it. Pending operations are
retained locally and are retried on next launch. Quit warns when changes remain.

The app refreshes counts on opening, about once per minute while running, and
after wake/unlock. Existing alert caps remain three per UTC day and 21 per
rolling week, with 15-day retention. Newly eligible alerts can play one quiet
sound; historical cards do not replay on each launch. Banners are optional and
require macOS notification approval. Focus and your output volume affect what
you hear. There is no delivery while the app is quit or the Mac is asleep.

All application days remain UTC (00:00 UTC / 05:30 IST). A dot after the menu
count indicates a cached/pending state; **Saved** still requires a server
acknowledgment in the connected build. The local beta commits through IndexedDB
transactions and idempotency receipts; it works even with no network on first
launch. Conflicting changes still require review in either mode.

## Build, test, install

Requirements: macOS 13+, Apple's Command Line Tools (`xcode-select --install`),
Node 22.14+, and the existing npm dependencies. Full Xcode, Rust, Docker, and
additional servers are unnecessary.

```sh
npm ci
npm run macos:build
npm run macos:verify
npm run macos:test
npm run macos:install
```

Build output is `output/macos/Apply Vigil.app`. The build bundles the React UI,
compiles the Swift host for the current Mac's architecture, creates its icon and
original chimes, ad-hoc signs it, and verifies the signature. Install copies it
to `/Applications/Apply Vigil.app` and launches it. Quit the installed app before
reinstalling. The installer keeps the immediately previous app bundle as
`/Applications/Apply Vigil.previous.app`; application data is stored separately.

The isolated native test has a different bundle ID and a nonpersistent WebKit
store. Its fake API cannot contact production. It checks the real bundled
WebKit UI, file-origin storage, API restrictions, retained queue/draft across
reload, reconnect, idempotency, menu counts, Dock policy, and pin behavior. A real
second WebKit view verifies that the compact window shares the cache and that
its offline operation survives closing the window and syncs exactly once.
Its report is `output/macos/native-smoke-report.json`.

GitHub runs shared lint, tests and builds on branch pushes and pull requests.
The separate Mac workflow runs for relevant native/shared changes, manual
requests and `macos-v*` tags. It verifies the connected bundle and both public
installer architectures. CI artifacts are public, like this repository; they
contain code and generated assets only. GUI smoke checks remain local release
checks. See [release procedure](releases.md) for DMG, ZIP and checksum generation.

For an interactive browser preview with synthetic records:

```sh
npm run dev
```

Open <http://127.0.0.1:5173/dashboard/?desktop-preview=1>. This uses a separate IndexedDB
workspace and a fake API, with no production requests. The preview does not play native sounds or change
Mac login/notification settings.

Run the shared checks after changing the interface or bridge:

```sh
npm run lint
npm test
npm run build
```

## Files and privacy

- App: `/Applications/Apply Vigil.app`.
- Bundle identity / preferences domain: `dev.dumpydon.ApplyVigil` (connected),
  `dev.dumpydon.ApplyVigil.Local` (public).
- Keychain generic-password service: `dev.dumpydon.ApplyVigil.owner-session`.
- WebKit cache: the system-managed data store for this bundle, typically under
  `~/Library/WebKit/dev.dumpydon.ApplyVigil/` and its application-support data.
- Preferences and delivered-alert receipts: this app's UserDefaults domain.

Only the connected build uses the existing Cloudflare service for records.
The public build uses `apply-vigil-device-records-v1` and
`apply-vigil-local-cache-v1` IndexedDB databases in its separate WebKit store,
never creates a Keychain owner session, and blocks native API requests. It adds no
telemetry, localhost listener, agent-account scanning, or new backend. Its bridge
allows only the existing workspace API routes, rejects redirects, and keeps
cookies out of JavaScript. Only the bundled local page can call it; remote
navigation is blocked. Native files use standard open/save panels.

To remove the app, sync pending work and export a backup first, quit, disable
Launch at login if enabled, and move Apply Vigil.app to Trash. Cached data and
the Keychain session are intentionally retained unless you explicitly remove
them. Removing storage before syncing can lose pending records.

## Public distribution

Run `npm run macos:package` for the versioned Apple Silicon and Intel DMGs, ZIPs,
SHA-512 values and public release metadata. These public binaries use local-only
mode and a separate bundle identity. They contain no owner data or credentials.
The first beta is ad-hoc signed, with manual first-open approval and manual
updates. See [release procedure](releases.md) for verification and compatibility
limits, and the [download-page design](download-page.md) for public hosting.

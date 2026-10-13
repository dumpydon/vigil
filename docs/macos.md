# Apply Vigil for macOS

Apply Vigil is an independent menu bar application for the existing Vigil
application tracker. It runs alongside the coding-agent app called Vigil.
This first build connects to <https://vigil.dumpydon.workers.dev/> and is for its
existing owner.

## Use the installed app

Open **Apply Vigil** from Applications. Its circle/check icon appears in the
macOS menu bar; there is no Dock icon. Click it to open or close the panel.
Right-click it for the compact pop-out, Settings, pinning, the website, and Quit.
The dashboard is 425 × 600 points at an 85% interface scale, close to the Vigil
reference app's proportions.

Sign in with the web workspace's current owner password. This app has a separate
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
  owner session, and Quit.

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
It shares the same cache, offline queue, owner session, and Cloudflare records
as the menu panel. Closing either window does not discard retained operations;
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
acknowledgment. Separate browser and native offline queues converge through the
same idempotent API, and conflicting changes still require review.

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

GitHub runs web/shared lint, tests, and builds on branch pushes and pull requests.
The separate Mac workflow is manual or triggered by `macos-v*` tags, so routine
web edits do not consume hosted Mac-runner time. It compiles and verifies a clean
bundle and uploads a ZIP preserving its executable permissions as a private CI
artifact. Native GUI smoke checks remain a local release check.

For an interactive browser preview with synthetic records:

```sh
npm run dev
```

Open <http://127.0.0.1:5173/?desktop-preview=1>. This uses a separate IndexedDB
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
- Bundle identity / preferences domain: `dev.dumpydon.ApplyVigil`.
- Keychain generic-password service: `dev.dumpydon.ApplyVigil.owner-session`.
- WebKit cache: the system-managed data store for this bundle, typically under
  `~/Library/WebKit/dev.dumpydon.ApplyVigil/` and its application-support data.
- Preferences and delivered-alert receipts: this app's UserDefaults domain.

The app uses the existing Cloudflare service for application records. It adds no
telemetry, localhost listener, agent-account scanning, or new backend. Its bridge
allows only the existing workspace API routes, rejects redirects, and keeps
cookies out of JavaScript. Only the bundled local page can call it; remote
navigation is blocked. Native files use standard open/save panels.

To remove the app, sync pending work and export a backup first, quit, disable
Launch at login if enabled, and move Apply Vigil.app to Trash. Cached data and
the Keychain session are intentionally retained unless you explicitly remove
them. Removing storage before syncing can lose pending records.

## Public distribution later

This build is locally ad-hoc signed, with no Apple Developer ID or notarization.
Public distribution needs packaging for supported architectures, a signing and
notarization decision, update/integrity verification, and a download page. It
also needs a workspace/account setup: the current one-owner service is not a
public multi-user backend. Do not publish this binary as a shared tracker until
that data-isolation design is ready.

See the [research and implementation plan](macos-plan.md) for reference links
and scope.

## Verification — 14 October 2026

- Installed and launched the ad-hoc signed app on macOS 15.7.8, Apple Silicon.
- Shared lint/build passed; all 111 automated tests passed.
- The isolated native checks passed, including two WebKit views sharing a queue
  and a compact-window write syncing exactly once after that window closed.
- Verified the installed pop-out button opens the native floating panel and
  Open dashboard returns to the menu panel, with the pop-out indicator active.
- Verified owner sign-in against the existing production workspace and a valid
  remembered session after replacing/relaunching the app. Production feature
  checks read records; automated application writes used the isolated fake API.
- Verified the installed signature and `LSUIElement=true`. The app bundle is
  approximately 1 MB and runs with no development server.

macOS banner permission and launch at login remain opt-in. Their system approval
paths were not automatically enabled during verification.

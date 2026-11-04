# Apply Vigil for macOS

Apply Vigil is an independent menu bar application for the existing Vigil
application tracker. It runs alongside the coding-agent app called Vigil.
Two separate flavors share the interface:

- **Public local beta:** `dev.dumpydon.ApplyVigil.Local`, starts empty without an
  account, stores records on the Mac, and blocks the live owner tracker API. Optional
  Google backup links a private cloud history without a Vigil password.
- **Connected owner build:** `dev.dumpydon.ApplyVigil`, retains the existing
  Cloudflare workspace and offline queue.

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

The public beta needs no sign-in for local use. **On this Mac** reports local
saving independently from the **Backed up** cloud indicator.
Fresh installs stay local until Google is linked in Settings → Data. Existing
backup connections remain usable. Recovery files are an optional spare; no
owner password is used for normal Mac backups.
For the connected build, sign in with the web workspace's current owner password.
Starting with **1.0.0-beta.2**, the development connected build keeps the server-issued token only in
native process memory. It does not access Keychain or save credentials to disk;
quitting ends the app's login, so reopening requires an owner sign-in to sync.
Records, drafts and pending operations remain in their existing durable store.
The app never retains the owner password. Password resets revoke older sessions.
Previously installed connected builds use Keychain until their app bundle is
replaced; changing repository source does not update those installed copies.

- **Today:** current UTC goal, remaining count, Easy Apply/external quick buttons,
  custom and mixed batches, goal changes, and undo. The compact momentum summary
  uses four columns: yesterday, 7-day total/average, 30-day total/average, all time.
  Both rolling windows include today (today + the preceding 6 or 29 dates).
  Their daily averages divide the totals by 7 or 30, including zero-entry days;
  they update from retained pending additions/undo immediately, before sync.
  These rolling home metrics are independent of Usage's completed-period
  comparisons and the selected 7/15/30-day chart range.
  A ring beside Today shows the **Easy Apply streak**: a date qualifies at **20
  Easy Apply applications**, independently of the combined daily goal and
  external/form counts. The ring fills with today's Easy Apply count / 20,
  capped at 100%. Its center shows the consecutive qualifying-day count; an
  unfinished today keeps yesterday's streak, and joins it immediately at 20.
  Missing/under-target completed dates break the streak. Historical edits and
  undo recompute it from the retained assigned dates; no records are migrated.
- **Usage:** day navigation, calendar, reviewed count adjustments, 7/15/30-day
  charts, fixed-period totals, hourly totals, entry editing, and deletion review.
- **Alerts:** the existing quiet progress inbox, read/clear controls, and pause.
- **Settings:** optional launch at login, pinning, menu count/percentage/icon,
  time-zone selection and 12/24-hour clock, optional macOS banners, six sounds plus silence, JSON/CSV export, JSON restore,
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

Entry, alert, backup, and comparison-boundary times default to **India Standard
Time (Asia/Kolkata, GMT+05:30)** with an **AM/PM** clock. Settings → Time & date
display accepts an IANA city time zone (and the aliases IST, India, or GMT+5:30)
and offers a 24-hour toggle. The selected zone follows daylight-saving changes.
Native preferences live in UserDefaults, survive app updates/restarts, and are
broadcast to the menu panel and floating window. The web app saves the same
preferences locally and shares them across tabs. The hourly activity chart uses
the selected zone and format; entry rows show the local logging date, with a
separate assigned-date note when it differs from the saved application date.

This is a display preference, not a history migration: original timestamps,
assigned application dates, IDs, goals, backups, and daily totals are unchanged.
Application-day accounting still uses its saved UTC dates (00:00 UTC / 05:30 IST).
A dot after the menu
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

Build output is `output/macos/local-arm64/Apply Vigil.app` on Apple Silicon or
`output/macos/local-x86_64/Apply Vigil.app` on Intel. The build bundles the React UI,
compiles the Swift host for the current Mac's architecture, creates its icon and
original chimes, ad-hoc signs it, and verifies the signature. Install copies it
to `/Applications/Apply Vigil.app` and launches it. Quit the installed app before
reinstalling. The installer keeps the immediately previous app bundle under
`~/Library/Application Support/ApplyVigilBackups/<timestamp>/Apply Vigil.app.archived`;
application data is stored separately. The archive extension prevents old rollback
copies appearing as launchable apps. Rename it to `.app` only for a deliberate rollback.

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

- App: `/Applications/Apply Vigil.app`. Rebuild and install commands refuse to
  replace a running bundle. Installation keeps the previous app under
  `~/Library/Application Support/ApplyVigilBackups/` for rollback.
- Bundle identity / preferences domain: `dev.dumpydon.ApplyVigil` (connected),
  `dev.dumpydon.ApplyVigil.Local` (public).
- Older connected builds used the Keychain service
  `dev.dumpydon.ApplyVigil.owner-session`. The current version neither reads,
  writes nor deletes that legacy item.
- WebKit cache: the system-managed data store for this bundle, typically under
  `~/Library/WebKit/dev.dumpydon.ApplyVigil/` and its application-support data.
- Preferences and delivered-alert receipts: this app's UserDefaults domain.

The connected build uses the Cloudflare service for live tracker records.
The public build automatically uploads full-history versions under a private
identity through the separate, device-scoped backup API, unless turned off.
The public build uses `apply-vigil-device-records-v1` and
`apply-vigil-local-cache-v1` IndexedDB databases in its separate WebKit store,
has no live owner-tracker session, and blocks owner-tracker API requests. It adds no
telemetry, localhost listener, agent-account scanning, or new backend. Its bridge
allows only the existing workspace API routes, rejects redirects, and keeps
cookies out of JavaScript. Only the bundled local page can call it; remote
navigation is blocked. Native files use standard open/save panels.

To remove the app, sync pending work and export a backup first, quit, disable
Launch at login if enabled, and move Apply Vigil.app to Trash. Cached data and
any Keychain item from an older build remain unless you explicitly remove them.
Removing storage before syncing can lose pending records.

## Public distribution

Run `npm run macos:package` for the versioned Apple Silicon and Intel DMGs, ZIPs,
SHA-512 values and public release metadata. These public binaries use local-only
mode and a separate bundle identity. They contain no owner data or credentials.
The first beta is ad-hoc signed, with manual first-open approval and manual
updates. See [release procedure](releases.md) for verification and compatibility
limits, and the [download-page design](download-page.md) for public hosting.

## Local history protection (beta 3)

The public local build mirrors every committed snapshot and operation receipt
into a checksum-verified native safety copy **before reporting Saved**. The
native vault lives at `~/Library/Application Support/ApplyVigil/HistoryBackups/`,
independently of the bundle location and WebKit origin. Each file is private to
the current macOS user. Atomic replacement, file synchronization, checksums, and
an entry-ID guard protect existing copies from incomplete or stale writes.

A missing, damaged, or rolled-back local primary snapshot can be restored from
the newest verified native image, including operation receipts so retries remain
idempotent. An incompatible split is stopped for a reviewed merge rather than
silently overwriting either side. Recovery produces a persistent visible notice.
The generic cache also refuses incomplete incoming snapshots in connected mode.

Settings → Data → History protection shows the workspace mode, last safety copy, and
saved versions. Recover history previews a missing-ID merge that retains current
record values and the current goal, restores only earlier historical goals, and
keeps deletion flags. The local merge is atomic. A separate-workspace choice is
required when an older history is detected beside a fresh local store. The
installer rejects local/connected identity changes without an explicit flag.

Automatic versions include the full history; records never expire at Sunday,
month, or year boundaries. The vault retains up to 48 recent versions and 90 days
of daily versions, plus the latest committed primary image per mode. A new day
creates a daily version even if the counts are unchanged. Working copies retain
projected pending changes and draft metadata for diagnostics; normal durable
queue/draft storage remains in IndexedDB. Damaged copies are excluded from
recovery and reported rather than used as empty history.

These copies protect against app-storage loss, not failure or loss of the entire
Mac. Keep a manual JSON export on another device or a separately managed backup.
No Keychain, telemetry, paid service, or new cloud database is involved.

Verification: `npm run macos:test:history`, `npm run macos:test`, and
`npm run macos:test -- --local`. The local native smoke test deliberately removes
its isolated primary snapshot and verifies automatic recovery; personal stores
and the production service are never used by these tests.

## Password-free cloud backup and recovery (beta 5)

A fresh installation generates a random UUID and 256-bit access secret. These
identify one private backup namespace in the existing Cloudflare D1 database;
a new physical database is not created per user. Registration requires no
account, email, owner password, hardware ID, or Keychain access. D1 stores the
secret's hash. Requests are authenticated with the retained secret and cannot
read other identities' backups or mutate the legacy owner tracker. Anonymous
registration has per-IP and global limits; failures retain the same identity
and local history for retries.

The native host keeps its identity in
`~/Library/Application Support/ApplyVigil/CloudBackup/device.json` with mode 0600
in a mode-0700 directory. This is private filesystem storage, not application-level
encryption. Reopening the app, restarting macOS, or replacing only the app bundle
retains that identity. A damaged identity is retained for recovery, never silently
replaced. Local saving remains usable offline.

After a local save, the app uploads a full-history version, downloads it, checks
SHA-256, and compares the content. Only then does Backed up acknowledge the
latest local revision. On this Mac reports local persistence independently.
A fresh empty store with a retained identity automatically checks and restores
its previous cloud copy before uploading, including historical goals and deletion
flags. Its revision is raised beyond the recovered cloud revision so new entries
continue to back up. New local records appearing during recovery stop the auto
merge and require review. Existing nonempty histories are never silently replaced.

Save a recovery file using Settings → Data → Save recovery file, and keep a copy
on a separate device or a cloud drive you control. The file is a bearer credential:
anyone holding it can access its backup. After all app data is deleted, Use recovery
file verifies the cloud copy and previews recovery before changing the identity.
Unrelated or diverging histories are rejected when the local workspace contains records; matching cached history can reconnect after review.
If both the identity and recovery file are lost, a hardware ID alone is insufficient
to prove ownership; automatic recovery cannot be promised. No Apple sign-in or
account-based recovery is silently implied.

Turning the connection off revokes that credential and persists the opt-out.
Re-enabling creates a new identity and needs a new recovery file. Cloud versions
retain the latest 24 copies and daily copies for 90 days; each includes the full
history and the latest copy does not expire with calendar boundaries. There is
no automatic bidirectional web/Mac or concurrent multi-Mac live synchronization.

## Avoiding the legacy workspace

`npm run macos:build` and `npm run macos:install` now default to the public app.
Only `npm run macos:build -- --connected` builds **Vigil Owner (legacy)**. Its
explicit `--connected-workspace` launch flag is reserved for developer checks;
otherwise it opens the installed public app if available. Test bundles remain
isolated. Never copy a developer owner build over a public installation: the
installer refuses identity changes without an explicit reviewed switch.

Native recovery checks: `npm run macos:test:cloud` uses an in-process mock service
and temporary files, tests restart persistence and recovery-file import after
local identity loss, and never contacts production or prompts for a password.

## Optional Google setup (beta 6)

Settings → Data → Sign in with Google opens the system browser. Confirm the
Google account, return to Vigil and review Back up this Mac or Restore and
connect. Routine launches retain the connection. After a full wipe, sign in
with the same Google account to retrieve and review the cloud history.

New installs do not register or upload until Google linking is chosen. Local
saving works offline. Small in-app reminders follow lifetime counts through
100, can be dismissed, and stop once Google is linked. Existing anonymous beta
5 backups remain available during the transition; linking keeps their original
namespace and avoids adding counts twice. Password-based native backup setup
has been removed; the legacy private web workspace still requires its own login.

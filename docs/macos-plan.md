# Apply Vigil for macOS

Plan and implementation scope, 14 October 2026.

## Product

Build a local-first menu bar companion for the existing Apply Vigil workspace at
<https://vigil.dumpydon.workers.dev/>. The installed app is called **Apply Vigil**
and has its own bundle identity, so it can run alongside the coding-agent app
called Vigil. It has no Dock icon. Clicking the menu bar opens its dashboard;
clicking outside dismisses it unless pinned.

The first release is for this Mac. Public downloads, a download website, update
feeds, multi-user accounts, and public distribution are later work. The existing
service has one owner: a future public binary must not connect everyone to that
owner's records. Public release needs a workspace/account design first.

## Reference research

- [Vigil](https://www.vigilbar.com/), by
  [@heymykro](https://github.com/heymykro), publishes a macOS menu bar app with a
  narrow left navigation rail, a popover dashboard, status at a glance, quiet
  alerts, sound choices, and optional floating UI. It uses the system web engine
  and native AppKit surfaces. Its website describes local storage, optional
  permissions, conservative refresh intervals, and ad-hoc signed releases.
- [The public repository](https://github.com/heymykro/vigil-releases) contains
  releases and an update feed; the implementation source is private.
- The installed `/Applications/Vigil.app` is version `0.1.0-beta.15.5`, has
  `LSUIElement=true`, and presents a WebKit/Tauri dashboard in a native popover.
  Its Today/Usage/Alerts/Settings navigation and the three supplied screenshots
  inform the structure of this independent implementation.
- Vigil advertises OpenPeon sound packs. Apply Vigil uses original synthesized
  chimes and macOS system sounds; it does not copy the reference app's assets,
  proprietary code, or branding.

## Architecture

Use a small Swift/AppKit host and `WKWebView`, with the existing React interface
bundled into the application. This follows the reference's system-web-engine
approach while requiring no Rust toolchain, Electron runtime, server, database,
or additional background service on this Mac.

- `NSStatusItem` owns the top menu item. It shows today's count/goal or percentage
  and exposes a right-click menu for opening, pinning, settings, and quitting.
- `NSPopover` hosts the dashboard. A retained web view keeps the shared engine
  alive after the panel closes. A native timer refreshes saved counts while the
  app is running, including when the panel is closed. Sleep/resume triggers a
  refresh; there is no promise of delivery while the app is quit or Mac is asleep.
- An always-on-top `NSPanel` provides the compact pop-out. Its second WebKit
  view shares the same data store and operation lease, so it can log alongside
  the dashboard and close with pending operations safely retained.
- `LSUIElement` and accessory activation keep the app out of the Dock.
- Bundled local HTML/JS/CSS provides the UI even without a network connection.
  IndexedDB retains the existing snapshot, pending operations, and device inbox.
- A restricted `WKScriptMessageHandlerWithReply` bridge forwards only the known
  JSON API paths/methods to the fixed HTTPS production workspace. Remote pages
  cannot navigate into the privileged web view. There is no localhost listener.
- Native requests use an ephemeral URLSession. The owner session cookie is held
  in Keychain, with its expiration; the owner password is never saved by the app.
  Sign-in is separate from the browser's cookie jar and is completed in the app.
- All writes reuse existing UUID operation receipts and conflict handling. Native
  integration must not reinterpret “Saved” or create a second application count.
- A separate desktop stylesheet adapts the dashboard to the panel. Existing web
  layouts remain available without desktop behavior.
- Native save/open panels support JSON/CSV export and JSON import. Existing
  validation, merge previews, past-day confirmation, and undo remain in place.
- Native notifications reuse the existing nine-category alert policy and its
  daily/weekly caps, with a persisted delivery ledger to avoid repeat sounds.
  Users can turn banners and sounds on/off and preview sounds from Settings.
- `SMAppService` provides an optional launch-at-login toggle. No Accessibility,
  screen recording, automation, or agent-account permissions are necessary.

## Delivery sequence

1. Add the desktop bridge, styling, preferences, and isolated browser preview.
2. Implement the Swift host, Keychain session, menu item, popover, optional pin,
   native files, sounds, notifications, and login item.
3. Add reproducible build/install commands and an application icon.
4. Run the existing regression suite plus bridge/security/offline checks. Run an
   isolated native smoke test and inspect the real panel through Computer Use.
5. Install and launch `/Applications/Apply Vigil.app`. The owner signs in through
   its normal password field; do not extract credentials from another app.

## Acceptance checks

- Independent menu item and bundle ID; no Dock icon; existing Vigil still works.
- Today, quick counts, mixed/custom batches, goals, Usage/history, alerts, backup,
  restore, edits, confirmations, and undo remain reachable in the panel.
- Cached counts and pending operations survive reload/relaunch; retries do not
  duplicate operations, and a cached display is never labelled cloud-saved.
- Live production checks are read-only until the user logs applications normally.
  Demonstrations and automated writes use isolated data.
- Clicking outside, pinning/unpinning, Escape, reopening, and native file dialogs
  do not lose retained drafts or queued operations.
- Menu progress reflects the current UTC day, including after midnight/resume.
- New eligible alerts can sound once while the app is running. Historical alerts
  do not replay on every launch. Settings and denied notification permission have
  clear feedback and keep the in-app inbox usable.
- Build output includes the native binary, bundled frontend, icon, sounds, and
  valid local signature. The installed application runs without a dev server.

## Platform references

[NSStatusItem](https://developer.apple.com/documentation/appkit/nsstatusitem),
[NSPopover](https://developer.apple.com/documentation/appkit/nspopover),
[LSUIElement](https://developer.apple.com/documentation/bundleresources/information-property-list/lsuielement),
[WebKit reply bridge](https://developer.apple.com/documentation/webkit/wkscriptmessagehandlerwithreply),
[UserNotifications](https://developer.apple.com/documentation/usernotifications/unusernotificationcenter),
and [SMAppService](https://developer.apple.com/documentation/servicemanagement/smappservice).

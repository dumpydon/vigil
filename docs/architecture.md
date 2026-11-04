# Architecture and data behavior

## Native Mac companion

Apply Vigil's Swift/AppKit host bundles this same React application inside
WebKit. Its menu bar dashboard and floating compact panel share one WebKit data
store, IndexedDB queue, operation lease, process-only owner session, and the existing
Cloudflare API. Neither surface needs a browser tab or development server.
The native bridge accepts only the known API paths and methods, blocks remote
navigation/redirects, and handles native file dialogs, sounds, notifications,
menu progress, and optional login registration. See [the Mac guide](macos.md).

## One app, two views

Vigil uses React, TypeScript, and Vite. The full dashboard and compact view share a single sync engine. Chrome's floating Picture-in-Picture card renders through a React portal into a separate document, using the same engine and styles. Switching views preserves pending work.

The floating window's lifecycle is isolated in `src/hooks/useFloatingWindow.ts`. Closing it removes its UI and timers; closing or reloading the source tab also closes the floating window. The browser controls its native title bar and placement.

## Storage and synchronization

One Cloudflare Worker serves the frontend and authenticated API. One D1 database stores entries, goal policies, owner sessions, and operation receipts. IndexedDB caches the snapshot, drafts, and pending operations on the device.

Vigil retains each change locally before showing it as pending, then sends it to the Worker. **Saved** means the server acknowledged it. Each operation has a unique ID, and D1 commits its receipt and data change atomically. Retrying a request has one effect, including after a lost response.

Individual entry records determine totals. Editing preserves the entry ID and original logging time. Deleted entries remain in the retained history and backups but are excluded from totals.

A shared lease coordinates tabs. BroadcastChannel refreshes their cached views. Pending changes survive reloads and expired sessions; a valid owner session lets syncing resume. Closing the source app stops its background work.

## UTC dates and goals

A day starts at 00:00 UTC, or 05:30 IST. Logging time records when an entry was made; its assigned date can be an earlier UTC day. Quick-entry buttons always log today, even while browsing history.

The default goal is 75. A goal override applies to one day; a future-default change starts tomorrow. Earlier goals remain stable. Closed-day averages include zero days after tracking begins and exclude today. Period comparisons distinguish incomplete history from zero counts.

Past-day changes require a before/after confirmation. Day adjustments are atomic. If another tab changes a day during review, the save is rejected so the owner can review its latest counts. Reductions update the newest entries first; increases create one backdated entry.

## Rhythm activity calendar

Usage includes a month-separated activity heat map. Its headline totals the last
90 saved UTC application dates, including today, independently of the daily
chart's selected range. The calendar opens at that window; horizontal scrolling
reveals earlier months. Six months are loaded initially; **Load earlier months**
prepends six more while retaining the current scroll position. This rendering
limit never truncates stored history, 90-day totals, or all-time streaks. The
complete calendar content renders at 85% scale with its layout height adjusted
to match, including controls and tooltips.
Dates before tracking began are identified, and future dates are
blank. Hover or keyboard focus shows one date's total, Easy Apply, and form counts.

Colors use stable daily-total bands: zero, 1–9, 10–19, 20–39, and 40 or more.
The busiest weekday uses totals within the last 90 days and preserves ties.
Longest streak uses the full tracked history and the same 20-Easy-Apply-per-day
threshold as Home; external applications and daily goal changes do not qualify
streak dates. Deleted records are excluded and backdated records use their saved
application dates. This view derives from the projected snapshot, so retained
changes update it immediately; it adds no database, network requests, or storage.

## Quiet in-app alerts

Alerts reuse the existing IndexedDB cache's `meta` store under `ui.alerts.v1`. No database, schema migration, Worker binding, service, or dependency is added. Read state and pauses stay on the device; BroadcastChannel shares changes between tabs in the same browser profile.

While Vigil is open, fresh saved counts can generate a daily overview, halfway progress, goal completion, or an evening check-in. Other categories celebrate a return after two empty UTC days, a new best completed day after at least a week of prior tracking, and total-application milestones (100, 250, 500, 1,000, 2,500, 5,000, then every 10,000). Only the highest milestone crossed today is considered, with at most one milestone notification per day. When the combined daily goal is completed, an Easy Apply streak milestone (3, 7, 14, or a multiple of 30 days) replaces the ordinary completion message. Streak dates qualify at 20 Easy Apply applications; external/form counts and historical combined-goal values do not qualify a date. Today must also reach 20 to receive that streak celebration. A Monday recap replaces that day's opening update when a complete tracked week is available, unless goal completion takes priority.

Generation is capped at three alerts per UTC day and 21 in a rolling seven-day window. The third daily slot is reserved for goal completion until the goal is met. Routine updates are at least two hours apart; completion can appear immediately. The evening check-in uses device-local hours from 18:00 to 22:00 and waits at least four hours after the last daily alert. On first opening, the most relevant eligible update replaces a generic overview, preventing a burst of messages. Clearing read cards preserves a small receipt ledger so it cannot reset these limits.

While the page is visible and online, the alert refresh checks once per minute whether saved counts are ten minutes old or from an earlier UTC day, then refreshes them through the existing sync engine. This keeps long-open sessions eligible for scheduled alerts without extra infrastructure. Hidden/offline pages skip these periodic API requests, and existing sync coordination handles concurrent tabs.

Read and unread alerts, and their receipts, expire after 15 days. The inbox prunes them on load, focus, and once per minute while open, including offline. If Vigil is closed, pruning runs when it next opens. Alerts have no operating-system permission prompt or background delivery and are excluded from application-record backups.

## Privacy and backups

The legacy web tracker has one owner login. Public Mac backups start after optional Google linking; existing private backup connections remain supported. Passwords are hashed server-side. Production uses secure HttpOnly session cookies lasting up to 90 days. Private API responses are not cached by the service worker. Cached records can remain on the trusted device after sign-out.

Settings provides CSV export and versioned JSON backup/restore. JSON preserves entries, deletion history, goals, and tracking start. Imports retain IDs, add missing records, skip identical records, and preserve current values on conflicts. The whole import is retained locally before chunked syncing begins.

Localhost and production are separate origins with separate cookies, IndexedDB, and databases. Installing a localhost PWA does not turn it into a production installation. See the deployment notes for owner setup and production installation.

## Code map

| Location | Responsibility |
| --- | --- |
| `src/Dashboard.tsx` | Views and entry/history actions |
| `src/components/` | Forms, charts, progress, and settings |
| `src/hooks/` | Floating-window lifecycle and alert refresh |
| `src/data/store.ts` | IndexedDB, queue projection, retries, and tab coordination |
| `src/data/alerts.ts`, `src/utils/notifications.ts` | Device inbox, retention, and quiet alert policy |
| `shared/model.ts` | Validation, entry mutations, UTC analytics, and backup rules |
| `shared/periods.ts` | Fixed-period totals and comparisons |
| `worker/` | Authentication and D1 API |
| `migrations/` | Schema and transactional preconditions |
| `scripts/` | PWA build and owner/deployment setup |
| `tests/` | Isolated model, API, sync, and browser-lifecycle tests |

Builds generate an app-shell service worker. The local dev server disables it. Visual styles use the existing 60% app scale independently of browser zoom.

## Optional Google backup (beta 6)

Fresh Mac installs save locally without creating a cloud identity. After the user
chooses Google, the native host opens the system browser and retains a private
short-lived polling key. The Worker uses a one-use state, PKCE and nonce and
checks Google's signature, issuer, audience and expiry. Only identity scopes
are requested. The OAuth client secret stays in Cloudflare secret storage.

Google's stable subject identifies the account; email is display/contact data.
Each account owns one existing backup namespace. Linking preserves that namespace
and its records. New device access keys are hashed in D1 and limited to their
namespace. Revoking one key does not revoke another Mac's key. Legacy beta 5
connections continue to work. The private owner web tracker remains separate.

The user reviews the account and any existing history in Settings before the
connection changes. Unrelated or diverging local histories are rejected. A new
Mac can recover using Google even when its original local key was erased.
Recovery retains record IDs, deletions and saved goals and advances the revision
past the recovered copy. Local changes during sign-in are checked again before
recovery. This is backup and restore, not live concurrent multi-Mac sync.

Local saving remains authoritative during normal use. Uploads retry offline
changes, download the cloud copy, and verify both digest and content before
showing Backed up. Versions retain the latest 24 copies and daily copies for
90 days; each copy contains the full history, and the newest copy does not expire.
Native credentials use private filesystem storage without Keychain. Google
link metadata survives restart; routine launches do not start a new sign-in.

Migration 0006 adds Google accounts, device access and expiring sign-in requests
to the existing Worker/D1 deployment. The milestone reminders use lifetime active
application totals at 5,10,15,20,30,40,50,60,75,90,100; persisted receipts prevent
replays on undo or restart. Google linking suppresses them.

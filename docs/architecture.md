# Architecture and data behavior

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

## Privacy and backups

There is one owner login and no registration. Passwords are hashed server-side. Production uses secure HttpOnly session cookies lasting up to 90 days. Private API responses are not cached by the service worker. Cached records can remain on the trusted device after sign-out.

Settings provides CSV export and versioned JSON backup/restore. JSON preserves entries, deletion history, goals, and tracking start. Imports retain IDs, add missing records, skip identical records, and preserve current values on conflicts. The whole import is retained locally before chunked syncing begins.

Localhost and production are separate origins with separate cookies, IndexedDB, and databases. Installing a localhost PWA does not turn it into a production installation. See the deployment notes for owner setup and production installation.

## Code map

| Location | Responsibility |
| --- | --- |
| `src/Dashboard.tsx` | Views and entry/history actions |
| `src/components/` | Forms, charts, progress, and settings |
| `src/hooks/` | Floating-window lifecycle |
| `src/data/store.ts` | IndexedDB, queue projection, retries, and tab coordination |
| `shared/model.ts` | Validation, entry mutations, UTC analytics, and backup rules |
| `shared/periods.ts` | Fixed-period totals and comparisons |
| `worker/` | Authentication and D1 API |
| `migrations/` | Schema and transactional preconditions |
| `scripts/` | PWA build and owner/deployment setup |
| `tests/` | Isolated model, API, sync, and browser-lifecycle tests |

Builds generate an app-shell service worker. The local dev server disables it. Visual styles use the existing 60% app scale independently of browser zoom.

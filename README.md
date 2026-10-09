# Vigil

Vigil is a personal job-application tracker. It counts LinkedIn Easy Apply and external/form applications, shows progress toward a daily goal, and keeps a history you can correct later.

It is built for one owner who wants to log applications quickly and stay consistent. You enter the counts yourself. Vigil works as a website or an installed app with its own window.

**[Open Vigil](https://vigil.dumpydon.workers.dev/)** · **[Compact view](https://vigil.dumpydon.workers.dev/compact)**

## What it does

- Log +1, +2, +3, or +5 applications in either category with one click.
- Add a custom count or save both categories as one mixed batch.
- Edit entries, undo additions, and confirm deletions.
- Choose a past UTC date and adjust its totals. Every past-day increase or decrease requires a before/after confirmation.
- Set daily goals and view 7-, 15-, or 30-day charts, averages, and goal streaks.
- Keep logging offline after the first successful sign-in and load.
- Export entries as CSV or keep a complete JSON backup of entries and goals.

The full dashboard and compact view use the same data. Switching views preserves pending work. The app remembers the preferred view on each device.

In desktop Chrome, use **Pop out compact view** in the top row to open the compact card in an always-on-top Picture-in-Picture window. It stays visible when you switch tabs or apps, can be moved and resized, and has Chrome's small title bar instead of a tab strip or address bar. Clicking the button again focuses the existing floating window. Both views share live entries and pending changes; **Open dashboard** returns focus to the source tab. Keep that tab open: closing or reloading it closes the floating window. Browsers without Document Picture-in-Picture show an explanatory message instead of opening a regular tab.

## Tech stack

| Part | Technology | Purpose |
| --- | --- | --- |
| Interface | React, TypeScript, Vite | Dashboard, forms, and SVG charts |
| API | Cloudflare Worker | Authentication and validated data changes |
| Database | Cloudflare D1 | Entries, goals, sessions, and operation receipts |
| Device storage | IndexedDB | Cached records, drafts, and pending changes |
| Offline app | Manifest and service worker | Installation and cached app shell |
| Tests | Vitest and Miniflare | UTC calculations, real D1 behavior, and sync recovery |

One Worker serves the frontend and API together. One D1 database stores the saved records. The deployment uses Cloudflare Free and a `workers.dev` address. Cloudflare Workers Builds automatically builds and deploys pushes to GitHub `main`.

## How data stays reliable

Vigil stores individual entries rather than a daily counter. Totals are calculated from active entries. Editing preserves an entry's ID and original logging time; deleted entries stay in history but are excluded from totals.

A change is written to IndexedDB before appearing as retained. The app then sends it to the Worker. **Saved** means the server has acknowledged it. Each operation has a unique ID, and D1 commits its receipt and data change together. Retrying the same operation has one effect, even if the first response was lost.

Past-day adjustments are atomic. If another tab changes that day during review, the save is rejected and the owner must review the latest totals again. The queue also survives reloads and expired sessions. Sync resumes while the app is open; closing the app stops background work.

All dates use UTC. A new day starts at **00:00 UTC**, or **05:30 IST**. The default goal is 75. Goal changes can apply to one day or become the default from tomorrow; earlier goals remain stable. Closed-day averages include zero days after tracking begins and exclude today.

## Run locally

Use Node 22.14+ and npm.

```sh
npm ci
npm run setup:local
npm run db:migrate:local
npm run build
```

Owner setup uses a hidden password prompt and writes ignored local secrets to `.dev.vars`. Restart the API server after changing them.

Run these in separate terminals:

```sh
npm run dev:api
npm run dev
```

Open **http://127.0.0.1:5173/**. Vite forwards API requests to the local Worker on port 8787. The local D1 database is kept in `.wrangler/state`; it is separate from production. The service worker is disabled during development.

## Validate and deploy

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Tests use isolated local databases and a controlled clock. They cover UTC boundaries, goal history, atomic changes, retries, offline recovery, conflicts, and import deduplication.

The production Worker and database are both named `vigil`. Their binding is in `wrangler.jsonc`; the `local` environment uses `vigil-local`. With the required Cloudflare permissions:

```sh
npm run db:migrate:remote
npm run deploy
```

For first-time owner setup or an intentional password change, run `npm run setup:owner`. It uploads secrets securely and invalidates old sessions. Ordinary deployments preserve the existing credential. Direct D1 migration commands require Wrangler's `d1:write` permission.

## Privacy, backups, and installation

There is one owner login and no registration. Passwords are hashed server-side. Production sessions use secure HttpOnly cookies and last up to 90 days. Private API responses are not cached by the service worker. Personal records may remain cached on the trusted device after sign-out.

Settings offers JSON backup and restore. Missing records are added, identical records are skipped, and conflicts keep their current values. Imports preserve IDs and can safely resume after interruption. CSV is for reviewing entries; JSON also preserves goal history. Keep regular backups, since clearing browser storage can erase unsynced work.

To install on Mac, open the live website in Safari and choose **Share → Add to Dock**, or use Chrome's install control. A localhost installation stays tied to localhost; production has separate browser storage. The app renders at 60% visual scale with browser zoom at 100%.

See [deployment notes](docs/deployment.md) and [verification notes](docs/verification.md) for operational details. Core logic lives in `shared/model.ts`, sync in `src/data/store.ts`, the API in `worker/`, and schema changes in `migrations/`.

The visual style is inspired by Vigilbar. Vigil uses custom SVG assets and system fonts and identifies itself as an independent job-application tracker.

# Vigil

A private, one-owner job-application counter. React, TypeScript, Vite, a native Cloudflare Worker router, D1, and IndexedDB. Full dashboard and compact logging window share the same records. There is no registration, scraping, AI, or paid integration.

## Local development

Use Node 22.14+ and npm. From this directory:

```sh
npm ci
npm run setup:local
npm run db:migrate:local
npm run build
```

`setup:local` asks twice for a hidden owner password (12–256 characters). It writes `.dev.vars` with mode 600, containing a salted password hash and a random session secret. It does not print your password. Restart the Worker after changing these values.

Run these in two terminals and leave them running:

```sh
npm run dev:api
npm run dev
```

Open **http://127.0.0.1:5173/**. Vite forwards API calls to the local Worker on port 8787. Local D1 is stored under `.wrangler/state`. The `local` Wrangler environment has its own database binding, independent of production. The development service worker is disabled so hot reload stays reliable. After building, **http://127.0.0.1:8787/** serves the production shell and service worker against the same local D1.

The current development workspace has a separately generated test credential in `.dev.credentials.local` and local verification records. These files are ignored and must never be deployed, committed, or used as production credentials. `node scripts/setup-owner.mjs --local --test` is restricted to local verification and retains an existing local configuration. Choose your own local password with `setup:local` when you want to replace the test credential.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm audit
```

Tests run against isolated Miniflare D1 databases and fake IndexedDB, with an injectable UTC clock. They do not query or mutate production. The fixture dates and counts live only in tests/local verification; migrations contain no application-entry fixtures. See `docs/verification.md` for browser evidence and deployment status.

## Cloudflare deployment

Use only the existing account in `wrangler.jsonc`, a dedicated **vigil** Worker, and a dedicated **vigil** D1 database. Do not modify unrelated Workers. Keep the account on the Free plan.

1. Inspect the account's Workers plan and D1 quota in the dashboard before provisioning. The account was inspected on 2026-10-07: Workers Free, seven existing unrelated applications, no D1 databases, and the D1 free storage/read/write allowances unused.
2. Authenticate Wrangler with account-read, Worker-write, and D1-write permissions. The existing Wrangler credential initially lacked `d1:write`; granting a new scope requires the account owner's approval. `npx wrangler login --scopes-list` lists supported scope names. Do not grant unrelated product permissions merely because Wrangler's default scope list includes them.
3. Create the separate production database:

   ```sh
   npx wrangler d1 create vigil
   ```

4. Copy its returned UUID into the **main** `d1_databases` DB binding in `wrangler.jsonc`. Leave `env.local` unchanged. The placeholder UUID deliberately blocks the deployment and remote migration scripts until this step is complete.
5. Apply all versioned migrations to production:

   ```sh
   npm run db:migrate:remote
   ```

6. Publish the application and configure the owner credential from an interactive terminal:

   ```sh
   npm run deploy
   npm run setup:owner
   ```

   Until secrets are configured, sign-in returns `SETUP_REQUIRED`; there is no default password or authentication bypass. The setup script uploads `OWNER_PASSWORD_HASH` and `SESSION_SECRET` through Wrangler's stdin. It never uploads the plaintext owner password. Store your password in your own password manager. Running it again intentionally rotates the credential and session secret; don't rerun it during an ordinary deploy.
7. Use the `workers.dev` URL returned by the successful deploy. Confirm the shell loads, private endpoints return 401 without a session, owner login works on the actual free Worker, and the first authenticated snapshot has **zero entries and a goal of 75**. Do not upload local fixtures or local D1 files.

Do not interpret a CLI exit or local preview as proof of a live deployment. `docs/verification.md` records the actual result. If the database was created/migrated using the dashboard, record the same migration names in D1's `d1_migrations` table before future CLI migrations; otherwise migration commands will attempt to create existing tables again.

Current published limits are 100,000 Worker requests/day and 10ms CPU per invocation; D1 Free provides ten databases, 500MB per database, 5GB account storage, 50 queries per Worker invocation, five million rows read/day, and 100,000 rows written/day. All are account-wide/shared. This app uses one Worker and one D1 database, has no cron, and does not poll continuously. Imports use at most 16 records per API chunk to stay below the 50-query limit. Large backups and exhausted shared quotas can require a retry; pending work remains on the device. Never activate a paid upgrade automatically. Sources: [Worker limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/).

## Owner sign-in and sessions

Passwords use PBKDF2-SHA256 (100,000 iterations, a random 16-byte salt), verified through Workers Web Crypto. Session tokens are opaque HMAC outputs over random operation UUIDs; only token hashes are stored in D1. The production cookie uses `__Host-vigil_session`, Secure, HttpOnly, SameSite=Strict, `/` scope, and a maximum lifetime of 90 days. HTTP localhost uses a separate cookie name for development. Expiration and revocation are enforced server-side, including revocation when the session secret rotates. Login has D1-backed per-IP and global attempt limits.

Private APIs return `Cache-Control: no-store, private`. Mutations require same-origin JSON and reject cross-site requests. Cloudflare credentials and owner secrets never enter the client bundle or backups. Sign-out requires pending changes to finish syncing and revokes the server session. Personal cached records can still remain visible on this trusted device after sign-out or session expiry; select the sign-in status to reauthenticate and sync. This is not an encrypted local vault.

## Logging, UTC, and goals

Both categories offer independent +1/+2/+3/+5 clicks. Each click creates its own entry; rapid clicks are not debounced. Custom counts accept 1–10,000 per category, and mixed batches accept 0–10,000 per category with a positive combined total. Mixed batches are one entry, so Undo reverses the whole batch. Entry editing preserves the UUID and original logging timestamp. Explicit Delete confirms first; Undo needs no confirmation. Deleted entries remain tombstones and never contribute to totals.

All assigned dates and chart grouping use UTC. A day changes at **00:00 UTC / 05:30 IST**. Quick buttons use the time of the actual click, even while viewing historical details. An open draft keeps its visible assigned date across midnight. Past dates are supported; future application dates are rejected. Hourly bars show when you logged, with backdating called out; they do not invent submission times.

The initial goal is 75. A day-specific override changes only that date. On today's goal form, “Use for future days too” starts a new default policy tomorrow. Older policies and overrides keep historical goals stable, including days with no entries. Historical goal edits cannot silently change future defaults. This requires no midnight job.

Progress keeps the real percentage above 100%, caps only the visual fill, and floors remaining at zero. Streaks use each day's applicable goal, retain yesterday's streak while today is incomplete, and include today immediately once it meets goal. Zero closed days break a streak after tracking begins. Closed-day average excludes today and pre-tracking dates and includes zero days in the selected range. Backdating can move the tracking start earlier; deleting records does not silently move it later.

## Persistence and conflict handling

Each operation is first committed to a versioned IndexedDB transaction, then displayed as retained. “Saved” means a server acknowledgment, not merely a local update. Snapshot and queue data survive reload. Local persistence failure displays an error instead of claiming the operation was saved.

The client serializes dependent operations, uses an IndexedDB lease across tabs, and uses BroadcastChannel as an optimization. Retry uses bounded backoff and runs on focus/reconnect. D1 commits the mutation and its unique receipt atomically; retrying an operation has one effect. A different payload with the same ID is rejected. Snapshot receipt reconciliation handles a lost response after commit without double-counting.

Stale entry versions and goal revisions stop the queue with a review banner. It displays the cloud value and offers “Keep cloud value” or an explicit “Apply my change” where applicable. Pending records remain retained during reauthentication. A pending Undo is serialized after its addition and cannot reverse the same entry twice. Sync needs an open browser/app; no background-sync or closed-app execution is promised.

## Backup and restore

Settings offers CSV entries and a `vigil-backup` JSON format, version 1. JSON contains entry IDs/tombstones, timestamps, assigned UTC dates, counts, tracking start, and effective goal policies/overrides. Exports contain no credentials, tokens, or session records. Downloads include retained pending changes; sync first for a cloud-confirmed backup. CSV is an entry review/export format, not the restore format.

JSON import validates format, dates, integers, UUIDs, and size (12MB, 20,000 entries, 5,000 goal records). A preview shows missing, identical, and conflicting records. Missing IDs/dates are inserted, identical records are skipped, and conflicting existing records keep their current values. A repeated import does not duplicate totals. Tracking start can move earlier. The complete import is retained in one local transaction before any chunks sync; each cloud chunk is atomic and idempotent, so interrupted imports safely resume.

Keep periodic JSON backups somewhere you control. Browser storage can be cleared or evicted by the browser/OS; unsynced data on an erased device cannot be recovered from D1. Cloud-saved entries remain in D1.

## Install and daily use

Open the verified HTTPS live URL in Safari or Chrome, sign in, then install:

- **Safari on Mac:** Share → Add to Dock → Add. [Apple's instructions](https://support.apple.com/guide/safari/add-to-dock-ibrw9e991864/mac).
- **Chrome:** use the offered Install Vigil control/address-bar install icon. The app's Settings only shows an install button when the browser supplies an install prompt.

Launch Vigil from the Dock for a standalone window. Open `/compact` or use the compact control for the smaller logging layout; the preferred mode is remembered on that device. Below 440px, Custom moves to its own row. Short windows scroll. There are no always-on-top, global-shortcut, or native menu-bar promises.

The service worker caches only the versioned app shell and same-origin static assets. Authenticated APIs and login/logout are excluded. IndexedDB stores personal records deliberately. Updates wait for your action; the Update button is disabled while a draft, modal, or queued changes are present. The app uses local DB schema version 1 with an explicit upgrade callback; future schema versions must migrate existing queues rather than discard them.

## Visual asset provenance

The design study is retained in `output/pdf/vigil-visual-research-and-ui-specification.pdf`, with reference evidence in `output/pdf/evidence`. Sources were the actual [Vigilbar site](https://www.vigilbar.com/), its linked Watchtower/Island product previews, and their publicly rendered styling. Marketing typography was not used as the product UI's source of truth.

`public/mark.svg` is a manually authored reconstruction of the observed concentric ring/eye geometry, using our application colors. `scripts/generate-icons.py` rasterizes that geometry into the regular, maskable, and Apple icons. No original logo binary, provider logos, or SF font files were copied. Similarity is intentional, but no ownership or license of the reference's brand is claimed. This application identifies itself as an independent personal job-application tracker and is not the coding-agent product. The system font stack uses fonts already installed on the device.

## Layout of the code

| Location | Responsibility |
| --- | --- |
| `src/Dashboard.tsx`, `src/components`, `src/styles.css` | Full/compact UI, forms, charts, settings, design tokens |
| `src/data/store.ts` | Durable local snapshot, queue, multi-tab sync, reconciliation |
| `shared/model.ts` | Shared validation, UTC dates, analytics, backup merge policy |
| `worker/index.ts`, `worker/security.ts` | Native API router, D1 transactions, owner auth |
| `migrations` | Reproducible schema, transactional precondition triggers, session generation |
| `public`, `scripts/build-pwa.mjs` | Manifest, icons, hashed app-shell service worker |
| `tests` | Isolated model, D1/API, and sync correctness tests |

The full snapshot is intentionally small and suited to personal use; this is not a multi-user analytics service. Verification artifacts and temporary network-fault tooling under `test-results` are local-only and excluded from lint/build/deployment.

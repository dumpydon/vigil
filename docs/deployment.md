# Production deployment — 2026-10-08

- Website: **https://vigil.dumpydon.workers.dev/**
- Compact window: **https://vigil.dumpydon.workers.dev/compact**
- Source: **https://github.com/dumpydon/vigil**, private, branch `main`.
- Worker: `vigil`, Workers Free.
- D1 database: `vigil`, D1 Free.
- Database UUID: `63cb3890-e7d8-481c-9f35-0287e8394b5f`.
- Inspect records: [Cloudflare D1 Studio](https://dash.cloudflare.com/71600e008b6faafc09ce26b762e8411b/workers/d1/databases/63cb3890-e7d8-481c-9f35-0287e8394b5f/studio).

The frontend and Worker API are deployed together. The main DB binding targets this remote database; `env.local` continues to use the separate local database. No paid plan, domain purchase, automatic deployment workflow, or unrelated project change was made.

## Data preservation

A complete version-1 JSON backup of the existing local entries, deletion history, goal policies, daily overrides, and tracking start was created outside Git, in the publishing machine's private `Vigil Backups` folder. Its permissions are owner read/write only. Local D1 and browser storage were retained.

The owner explicitly chose **“Keep production empty; preserve the backup.”** Consequently, no local entries, goals, or demonstration fixtures were imported. Production starts with zero entries and its baseline goal of 75. A transfer was not performed or implied.

Localhost and workers.dev are separate browser origins with independent cookies and IndexedDB stores. Installing the production website creates a separate app. The existing localhost installation continues to need the local servers.

For a future transfer, export a fresh local JSON backup; distinguish real records from demonstration fixtures; sign in to the production website; open Settings → Restore a JSON backup; inspect the missing/identical/conflicting record preview; and explicitly merge the selected backup. IDs are preserved, repeated imports are deduplicated, and conflicting records keep their current values. Never assume localhost records transfer automatically.

## Production sign-in

A unique production password and independent session secret were generated. The password remains in the publishing machine's private `Vigil Private/owner-password.txt` file, outside the repository; its value was not printed or committed. Cloudflare received only the salted password hash and session secret through encrypted Worker secret storage. Local development credentials were not reused.

Open the live website in Safari or Chrome and use the production owner password. There is no username or registration. The remembered session lasts up to 90 days. Store the password in your password manager. To intentionally change it later, run `npm run setup:owner` in an interactive terminal; this uses hidden prompts and also rotates the session secret, revoking old sessions.

## Migrations and publishing

All three existing migrations are recorded in `d1_migrations`. Remote D1 contains the eight application tables, relevant indexes, and all three transactional precondition triggers: `check_create_mutation`, `check_entry_mutation`, and `check_goal_mutation`.

The authenticated Cloudflare dashboard applied the table schema. Its SQL editors could not execute the trigger bodies correctly, so the fixed existing trigger statements and migration receipts were applied atomically through a temporary authenticated Worker with the dedicated D1 binding. That helper was deleted immediately after verification. Its code and credentials were kept outside Git. No new application feature or administrative API remains in production.

The existing Wrangler authorization sufficed for publishing and configuring Worker secrets. A newly initiated D1 OAuth grant was not needed to finish this release. Future direct `wrangler d1` migration commands require authorizing `d1:write` through Cloudflare's supported login flow; use `wrangler login --scopes-list` to select only needed scopes. Once authorized, `npm run db:migrate:remote` recognizes the recorded migration names and does not repeat them.

Subsequent application releases use `npm run deploy`. The production configuration contains account/database identifiers, but no credentials. Do not rerun owner setup for an ordinary release, and do not change the local database binding.

## Brief production smoke check

| Check | Verified result |
| --- | --- |
| Live root page | HTTP 200 |
| Private snapshot without a session | HTTP 401 |
| Real owner login on Free | Succeeded; dashboard showed Saved |
| Reload with remembered session | Returned to dashboard without another password prompt |
| Remote entry/category totals | 0 stored entries, 0 Easy Apply, 0 External |
| Persisted baseline goal | 75 |
| Schema tracking | Three migration records and three triggers |
| Server session persistence | One active session in D1, retained across reload |
| GitHub | Private repository; source commit pushed to `main` via the owner's existing SSH login |

No application entry was created for the smoke check. The durable owner session, persisted baseline goal, remote reads, and authenticated reload provided the minimal persistence check while keeping production empty. The completed local test suite was not repeated. One existing production build was run for deployment; application dependencies and features were unchanged.

## Install the production Dock app

Open **https://vigil.dumpydon.workers.dev/** in your regular browser and sign in. In Safari, choose Share → Add to Dock → Add. In Chrome, use its install control when offered. [Apple's Add to Dock instructions](https://support.apple.com/guide/safari/add-to-dock-ibrw9e991864/mac).

Launch this production installation from the Dock. A previously installed localhost app stays tied to localhost; installing the workers.dev site creates the production app with its own browser storage.

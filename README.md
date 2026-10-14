# Vigil

A job-application tracker for LinkedIn Easy Apply and external forms. Log what you have completed, follow your daily goal, and review your history.

**[Download Apply Vigil for Mac](https://vigil.dumpydon.workers.dev/download/)** · **[Mac releases](https://github.com/dumpydon/vigil/releases)** · **[Owner web workspace](https://vigil.dumpydon.workers.dev/)**

<a href="https://vigil.dumpydon.workers.dev/download/">
  <img src="docs/images/apply-vigil-demo.gif" alt="Animated Apply Vigil Mac preview: menu bar, floating compact window, application counts, and a quiet progress alert on a glowing purple backdrop" width="1280">
</a>

<details>
<summary>View the full dashboard</summary>

![Vigil dashboard with demonstration data](docs/images/dashboard.jpg)

</details>

<details>
<summary>View the alerts inbox</summary>

![Vigil alerts with demonstration data](docs/images/alerts.jpg)

</details>

*Animated preview and screenshots use demonstration data.*

## What you can do

- Add +1, +2, +3, +5, custom counts, or a mixed batch.
- Track daily progress, 7/15/30-day charts, period totals, and goal streaks.
- Correct past days with a before/after confirmation, or undo an entry.
- See quiet progress alerts: at most three per day and 21 per rolling week, retained for 15 days.
- Keep logging offline after your first sign-in and load; sync when connected.
- Export a JSON backup or CSV, and merge a backup without duplicating records.

The public Mac app works locally without an account. The web workspace is for its existing owner. Counts are entered manually; Vigil does not submit applications.

The sidebar bell shows daily overviews, halfway progress, goal completions, streak milestones, comeback messages, best-day records, total-application milestones, evening check-ins, and Monday recaps. Alerts appear while Vigil is open and stay in the existing device cache. Read or clear them from the inbox, or pause them for the current UTC day.

## Mac menu bar app

**Apply Vigil** lives in your menu bar with no Dock icon. The public beta starts
with your own empty, local workspace: no account or internet connection needed.
It includes a pinnable glass panel, floating compact window, daily goals, history,
quiet alerts, six sounds plus silence, optional macOS banners and launch at login,
and JSON/CSV backups with JSON restore.

Download the **Apple Silicon** or **Intel** DMG from the download page, drag the
app to Applications, and follow the first-open guide if macOS requests approval.
The beta is ad-hoc signed and not notarized. macOS 13+ is required. The Intel
bundle is compiled and verified; physical Intel runtime testing is still pending.

### First launch on macOS

The beta is not notarized by Apple. If you trust the download and macOS shows an
**unverified-app or unidentified-developer** warning:

1. Keep Apply Vigil in **Applications**. Dismiss the warning with **Done** (or Cancel / OK), rather than Move to Bin/Trash.
2. Open **System Settings → Privacy & Security**, then scroll down to **Security**.
3. Find Apply Vigil’s blocked-app notice and choose **Open Anyway**. Some macOS versions show **Open** first.
4. Confirm **Open** and authenticate on your Mac if requested. Look for Apply Vigil in the **menu bar**, not the Dock.

Keep Gatekeeper enabled. For a **damaged-app or malware warning**, stop and contact us.
[Full illustrated install guide](https://vigil.dumpydon.workers.dev/download/install.html) ·
[Apple’s first-launch guidance](https://support.apple.com/en-us/102445)

<details>
<summary>Watch the 15-second installation walkthrough</summary>

<a href="https://vigil.dumpydon.workers.dev/download/first-launch.html">
  <img src="docs/images/first-launch.gif" alt="Illustrated macOS install guide: drag Apply Vigil into Applications, dismiss the unverified-app warning, choose Open Anyway in Privacy & Security, and confirm opening" width="960">
</a>

*Illustration; wording and authentication can vary by macOS version.*

</details>

The connected owner build remains a separate flavor. Developers can build both:

```sh
npm run macos:build                   # Existing connected owner app
npm run macos:build -- --local        # Public local-only app
npm run macos:test
npm run macos:test -- --local
npm run macos:package                 # Both public DMGs + ZIPs + checksums
```

Native builds require macOS, Command Line Tools and Node 22.14+. Packaging also
requires Python 3.10+. No paid backend, separate database or Apple membership is
needed for this beta. Cloud sync and automatic updates are future features.

[Mac app guide](docs/macos.md) · [Release procedure](docs/releases.md) ·
[Repository and distribution](docs/github-distribution-plan.md) ·
[Download-page design](docs/download-page.md)

## Floating compact view

In desktop Chrome, click **Pop out compact view** in the top row. The compact card stays above other tabs and apps, can be moved and resized, and shares live counts with the dashboard. **Open dashboard** returns to the source tab.

Keep the source tab open: closing or refreshing it closes the floating card. Other browsers can use the regular compact view; unsupported floating-window requests show a message.

## Run locally

Use Node 22.14+ and npm:

```sh
npm ci
npm run setup:local
npm run db:migrate:local
```

Setup asks for an owner password using a hidden prompt and saves ignored local secrets. Start these in separate terminals:

```sh
npm run dev:api
npm run dev
```

Open **http://127.0.0.1:5173/**. Local development uses its own database and browser storage, separate from production.

## Development and deployment

```sh
npm run lint
npm test
npm run build
```

React and TypeScript power the interface. A Cloudflare Worker serves the app and API; D1 stores saved records, while IndexedDB retains cached records and pending changes.

This installation uses Cloudflare Free. Pushes to GitHub **main** automatically build and deploy through Workers Builds. Ordinary deployments retain existing secrets and data; schema migrations are applied separately.

- [Architecture and data behavior](docs/architecture.md)
- [Deployment, credentials, and installation](docs/deployment.md)
- [Verification notes](docs/verification.md)

All days use UTC, starting at **00:00 UTC / 05:30 IST**. The default goal is 75. **Saved** means the server has acknowledged your changes. Keep regular JSON backups; clearing browser storage can erase unsynced work.

The visual style and download-page interactions follow [Vigilbar](https://www.vigilbar.com/), with creator permission reported by the project owner. Apply Vigil is an independent application tracker with its own product media, original chimes and system fonts.

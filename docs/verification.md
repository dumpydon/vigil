# Vigil local verification — 2026-10-07

**Production was subsequently published on 2026-10-08.** See [the deployment report](deployment.md) for current status. This report preserves the earlier local checks and the access blocker that existed at that time.

**Story:** An owner signs in, logs applications in the full or compact window, sees UTC progress from retained entry records, and safely syncs those records from IndexedDB to D1, including after interruption or reload.

## Historical local result

The local application is implemented and verified through browser → API → D1 → rendered response. **Production had not yet been deployed at the time of these local checks.** Cloudflare access is the remaining external dependency: the existing Wrangler OAuth credential lacks `d1:write` and D1 listing returns authentication error 10000. The previously authorized Cloudflare dashboard browser session expired and now displays its Google sign-in page. Approval to continue that page is pending because it explicitly accepts Cloudflare's terms.

No production database, Worker, owner password, or application entries were created during these checks. `wrangler.jsonc` keeps the production database UUID as a guarded placeholder; the local environment is independently configured. Finish the deployment steps in `README.md` after access is restored, then append live verification evidence here. A future live check must confirm real owner login on the free Worker and zero initial application entries; local success does not establish those facts.

## Automated checks

| Check | Observed result |
| --- | --- |
| TypeScript | `npm run typecheck` passed |
| ESLint | `npm run lint` passed |
| Focused tests | 37 passed across three files; isolated local D1/IndexedDB |
| Production build | Passed; 279.62KB JS / 86.28KB gzip, 21.15KB CSS / 5.02KB gzip |
| Worker packaging | `wrangler deploy --env "" --dry-run` passed; 28.68KiB Worker / 8.11KiB gzip, 13 asset files, DB and ASSETS bindings |
| Dependency audit | Zero reported vulnerabilities, including development dependencies |
| Deploy guard | Rejects the placeholder production D1 UUID before migration/deployment |

The model, API, and sync tests cover UTC midnight/India time and month/year boundaries; frozen fixture 477/73.3/streak 2; zero/pre-tracking days; overachievement; effective-dated goals; strict count/date validation; secure session attributes and hash storage; expiration/logout/rate limits; same-origin/private API protection; mixed-batch atomicity; concurrent duplicate receipts and different-payload rejection; SQL rollback; 25 independent rapid additions; stale edits; repeated/pending/in-flight Undo; lost responses after commit; offline reload; auth expiry retaining pending work; multi-tab coordination without BroadcastChannel; local persistence failure; import dedup/conflicts and retaining a complete chunked import before syncing.

## Browser and D1 evidence

The visible in-app browser remains open at **http://127.0.0.1:5173/** with the full dashboard. Disruptive checks used separate Chrome tabs and a separate production-shell origin. The Vite and local Worker servers remain running. All mutations used local D1; there was no production test cleanup.

- Signed in through the real owner form with the private local test credential; subsequent reloads used the remembered session.
- Exercised +1/+2/+3/+5 in both categories: 22 total, 11 per category, confirmed in D1. Undo of the last External +5 yielded 17.
- Invalid custom input retained its draft with validation. A custom Easy +14 and mixed External +6 yielded 37. Edited the mixed record to Easy 2 + External 4, then back to External 6: identity stayed stable and the Edited marker appeared.
- Changed the goal 75 → 100 with future defaults checked, then restored 75; exercised 7/15/30-day controls, historical day selection, return to today, and confirmed Delete.
- Found and fixed a native date-input synchronization issue: submission now validates the actual visible FormData, and input/blur updates preserve drafts. Future dates reject without adding records. Found and fixed dialog focus and download-anchor issues.
- Imported six local historical fixture entries. The dashboard displayed **37 today = 25 Easy + 12 External, goal 75, remaining 38, 49.3% detail / 49% label, range total 477, closed-day average 73.3, streak 2**. Local D1 confirmed 477 across 15 active records.
- The first fixture import preview showed six new records, 16 identical, no conflicts. Repeating it showed zero new, 22 identical, no conflicts, with Merge disabled.
- Actual JSON and CSV downloads were found in Downloads even though the browser automation download-event listener timed out. JSON validated as format/version 1, 13 entry records and active total 37 at export time; CSV had the same 13 rows and the expected ten fields. No credential/session keys appeared in JSON.
- Reimported the exact downloaded JSON in the local UI: **zero new, 16 identical, zero conflicts**; Merge remained disabled and totals stayed unchanged. [Round-trip preview](../output/screenshots/backup-round-trip.png).
- Keyboard Tab displayed a visible focus ring. ArrowRight moved chart focus from October 1 to October 2 and displayed exact tooltip values; Escape removed the tooltip; Enter opened the selected day's history. Logging remained explicitly on today. Enter on Open dashboard switched modes.

## Built PWA network interruption

A temporary local-only transport harness served the actual `dist` shell on port 8788 and forwarded API calls to local D1. A filesystem switch made that origin's requests fail at the connection boundary, including document requests. No production endpoints were involved. Browser `navigator.onLine` still reported connectivity to the computer's network, so the correct visible status was **Retry needed · N pending**, rather than a fabricated Offline event.

1. Loaded the built application successfully with a remembered owner session.
2. Interrupted the origin's network and reloaded. The real service worker restored the shell and IndexedDB restored the 37-count snapshot.
3. Added Easy +2, switched to `/compact`, and reloaded: 39 remained, with one pending operation.
4. Undid that pending entry, added External +3, and reloaded: 40 remained, with three pending operations (create, delete, create). D1 still had **477 / 15 active entries**.
5. Restored transport and pressed Retry: status became Saved, with no pending operations and no doubled totals. D1 now had **480 / 16 active entries**, with 40 today.
6. Undid the test External +3 after acknowledgment. D1 returned to **477 / 15 active entries**, with 37 today. The service worker cached no private API response; failed requests stayed failed until reconnection.

[Retained queue during interruption](../output/screenshots/offline-retained.png). The temporary harness was stopped after verification. The application itself has no separate Node backend; production serves through the Worker.

## Visual acceptance

Compared the implementation to the retained Watchtower and Island product screenshots, rather than treating the PDF's functional schematic as the aesthetic ceiling. The result uses their continuous near-black shell, a graphite/indigo lower surface, slim functional rail, fine dividers, small ring mark, system fonts, tabular numerals, inset range selector, light category groups, and continuous progress. Only a stacked bar's outer top corners are rounded. No provider logos, font downloads, decorative illustrations, or heavy dashboard cards were introduced.

Viewport dimensions were checked against the page's actual CSS `innerWidth`/`innerHeight` and `scrollWidth`; browser zoom required calibrating the requested viewport dimensions. Screenshots are browser raster captures, so their file pixel dimensions can differ from CSS dimensions.

| Measured CSS viewport | Evidence and result |
| --- | --- |
| 1440 × 900 | [Full dashboard](../output/screenshots/full-1440.png); document width 1440, no horizontal overflow |
| 1008 × 1024 | [Full dashboard](../output/screenshots/full-1008.png); document width 1008, no horizontal overflow |
| 440 × 415, approximately 416 high | [Compact](../output/screenshots/compact-440.png); shell approximately 416px high, 44px controls, short window scrolls |
| 380 × 415 | [Narrow compact](../output/screenshots/compact-380.png); Custom below quick buttons, document width 380, visible keyboard focus |
| 360 × 240 | Additional compact and full keyboard check; document width 360, controls remain reachable through natural vertical scrolling |

Normal visual verification emitted no console errors or warnings in the dedicated development tab. The fault test intentionally produced network failures. Temporary viewport overrides were reset before completion.

## Production work identified at that time

Restore authorized Cloudflare access; create the dedicated free D1 database; set its returned UUID in the main binding; apply the three migrations; publish the dedicated Worker; set a distinct owner credential using the hidden setup script; verify the live page, unauthenticated 401 responses, valid owner session, and empty production dataset. Installability metadata and local service-worker behavior are verified, but an actual Mac Dock installation and live free-plan login are pending the HTTPS deployment.

All publishing steps are now complete; production starts empty following the owner’s explicit choice. Current links and smoke evidence are in `deployment.md`.

## Floating compact card · October 10, 2026

- Chrome's Document Picture-in-Picture opens the compact card with the native site/return/close header and no tab strip or address bar. The browser reported picture-in-picture display mode as true.
- An isolated in-memory fixture started at 16. Adding one through the floating card updated both views to 17; adding one in the source dashboard updated both to 18. No personal entries, IndexedDB, or API mutations were used.
- Custom opened as a dialog inside the floating document. Resizing preserved the compact layout with document width equal to viewport width.
- Closing cleared the source button's active state. Reopening retained 18; Open dashboard kept the floating card compact while returning to the source dashboard.
- The fixture used the production CSS link, confirming stylesheet transfer as well as the inline development stylesheet path.
- Five focused PiP tests and ten sync tests passed, along with the production build and focused ESLint.

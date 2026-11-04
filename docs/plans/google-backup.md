# Optional Google backup

Status: implementation in progress; not released.

## User flow

New public installs save locally and make no cloud registration or upload until
Google linking is requested. No launch login screen. Existing beta 5 backup
identities and their full histories remain available during migration.

Offer a dismissible in-app reminder after crossing lifetime active-application
counts 5, 10, 15, 20, 30, 40, 50, 60, 75, 90 and 100. A batch crossing multiple
thresholds shows one reminder. Persist the highest shown threshold; undo, edits,
restart and day rollover cannot replay an already shown threshold. Stop after
100 unless the user requests more reminders. Linking suppresses all reminders.
Settings → Data always provides Sign in with Google and recovery-file fallback.

## Identity and cloud model

Google authenticates through the system browser. Use authorization code flow,
PKCE, unpredictable state and nonce, short-lived single-use linking requests,
and server-side validation of Google's signature, audience, issuer and expiry.
Never accept an email address alone as proof. Google subject ID identifies the
account. No Google password is sent to Vigil; request identity scopes only.

Link a currently proven device identity to its Google account without copying
or adding its counts. Recovering users prove the same Google account, receive
a new scoped device credential and review the existing cloud history. Different
nonempty histories require an explicit choice; never silently combine them.
The old owner web workspace remains separate and protected.

Local history remains authoritative for normal edits. Cloud snapshots preserve
IDs, deleted records, goal history and revisions. Offline edits queue locally;
reconnection uploads the resulting full snapshot and verifies its contents.
Restoring a cloud copy is an explicit operation except when a known identity
has an untouched empty local store. Concurrent independent Mac histories must
be detected rather than silently overwriting one another.

## Delivery gates

1. Back up and compare retained personal records before changing the installed app.
2. Implement milestone accounting and accessible compact notification UI.
3. Add account/link/session tables and authenticated Google routes with tests for
   replay, expiry, wrong account, rejected signatures and cross-account isolation.
4. Add native browser linking, durable device credentials, cancel/retry and
   restart behavior; retain offline local use in every failure case.
5. Set up a public Google OAuth client and production configuration. Google Cloud project and OAuth web client are created. Secrets are stored
   outside the repository in the private development settings folder. Client
   callback: https://vigil.dumpydon.workers.dev/api/google/callback. Google
   audience remains Testing; production publishing and live sign-in are pending.
6. Test first install, existing history linking, edits/deletes offline, reinstall,
   lost device key recovery and account mismatch against isolated fixtures.
7. Verify migration and signed-in end-to-end flow before installing or publishing.

Use Google's supplied G mark and button rules rather than an AI-generated logo.

## Implementation checkpoint — November 4, 2026

Google project: Apply Vigil. The user explicitly
approved accepting the Google API Services User Data Policy and creating the
identity-only OAuth client. Website and privacy links were saved. No paid
billing upgrade was selected.

Implemented but not yet integrated into a released build: reminder UI and
milestone receipts, Google signature verification, account ownership tables,
expiring PKCE browser requests, cancellation/replay protection, and account
access issuance. These server modules are deliberately not routed into the
production Worker until native handoff and recovery review are complete.
Migration 0006 has only run in disposable tests; production history is untouched.

Next: finish native Google browser launch/poll/review; authenticate issued access
keys in backup routes with namespace scoping; wire Settings and milestone UI;
test cross-account/restore/race cases; deploy additive migration and server
secrets; exercise Google test-user login; publish only after full flow passes.

## Integration checkpoint

Native browser start/poll/final confirmation, Settings UI, milestone prompt and
server backup access scoping are now wired. Migration 0006 was applied via D1
Studio and its receipt verified; Google client ID/secret were stored using
Cloudflare secrets. The real callback initially failed because Cloudflare
Workers does not support redirect:error. Reproduced in workerd, replaced with
manual redirect handling and status checks, added a real signed-token callback
test, and verified the user's browser reaches Google confirmed your account.

Installed local beta 6 for live verification. Private pre-install baseline:
verified full history with all retained records. User approval is pending for the
final account link and public Google publishing. Remaining: finish that link,
verify cloud/local equality and restart, exercise recovery and offline edits,
finish public documentation/assets and publish the tested release.

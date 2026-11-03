# Apply Vigil public Mac releases

The current public beta is `1.0.0-beta.4` (tag `macos-v1.0.0-beta.4`, bundle version
5), local-first with optional private cloud backup, ad-hoc signed, and requires macOS 13+. Releases are public at
<https://github.com/dumpydon/vigil/releases>. Public installers must use the
`.Local` bundle identity and must never contain credentials or personal records.

## Published beta 4

Includes Rhythm at 85% size, six months per load, compact layouts, clock
settings, local safety copies, and optional private cloud backup. Migration
0005 is applied to the existing Worker/D1 service. Local and native checks pass;
public installer hashes match the GitHub release manifest. The connected owner
Mac has been paired separately; no credentials or personal history are bundled.

## Beta 5 preparation

Beta 5 removes password setup from normal public Mac backups, adds recovery
files, and makes the local-first build the default. The developer connected
app has a distinct legacy name and explicitly redirects normal launches to
the installed public app. Public registration uses the existing backup tables;
no new database or migration beyond 0005 is needed. The manifest's localOnly
field describes the local primary engine; storage/cloudBackup/requiresAccount
fields make the automatic backup behavior explicit.

Checks now include `npm run macos:test:cloud`, which uses an in-process fake
service and temporary files, including a full identity-loss/recovery simulation.
The developer also exercised an isolated synthetic identity against production,
without using or changing personal records. Switch public download metadata only
after the exact beta 5 artifacts are published and checked.

## Build and validate

On a Mac with Command Line Tools, Node 22.14+ and Python 3.10+:

```sh
npm ci
npm run lint
npm test
npm run build
npm run macos:test
npm run macos:test -- --local
npm run macos:test:cloud
npm run macos:package
```

`macos:package` builds both `arm64` and `x86_64` targets; `-- --arch arm64` or
`-- --arch x86_64` builds one. It installs pinned build-only Python packages in
ignored `output/release-tools/`, draws the installation backdrop, builds fresh
public apps, checks the exact bundle file list and architecture, verifies
anonymous signatures and version/local-mode metadata, creates Finder DMGs and
permission-preserving ZIPs, and verifies disk-image checksums.

Output under `output/releases/`:

- `ApplyVigil-1.0.0-beta.4-arm64.dmg` and `.zip`
- `ApplyVigil-1.0.0-beta.4-x64.dmg` and `.zip`
- `SHA512SUMS.txt` and `release.json`

Local builds write metadata only under `output/releases/`. They never overwrite
the published site manifest. After publishing, copy the actual GitHub release
manifest into `site/download/release.json`. Never edit checksums by hand.

Native GUI smoke checks use separate test bundle IDs and nonpersistent WebKit
stores. The local test verifies a fresh workspace without sign-in, durable local
writes and drafts across reload, two-window consistency, safe compact-window
closing, blocked owner API calls, and no Dock icon. The connected test verifies
the owner code path using a fake API without contacting production.

The Apple Silicon beta was exercised on macOS 15.7.8. The Intel executable is
cross-compiled and structurally verified; a physical Intel runtime test and a
clean macOS 13 install test remain compatibility limits for this beta. State
those limits in the release notes. Do not claim notarization or universal runtime
coverage.

## Publish

1. Update `macos/release-config.json`, increment `bundleVersion`, update all
   versioned download links and changelog, and rebuild/verify the installers.
2. Review and push source, checksums and public metadata. Merge the reviewed
   source into `main`; production Workers Builds runs `npm run build` and the
   existing deploy command. Migration 0005 must be applied before deploying the cloud-backup routes.
3. Tag that source with `macos-v<version>`. Update `macos/release-notes.md`, then
   push that tag to start **Publish verified Mac beta**, or dispatch it manually with that existing tag.
   Its read-only build job checks out the immutable tag, reruns shared checks,
   builds both installers and verifies mounted DMGs/extracted ZIPs. A separate
   publisher job verifies the exact files and hashes, then uses a repository-
   scoped token to publish the prerelease. It cannot overwrite an existing
   release. No personal access token or browser file permission is needed.
4. Download the published `release.json` into `site/download/release.json`,
   review that its version/URLs match the release, and commit it. CI rebuilds
   can have different bytes from local packages; publish the CI manifest with
   the CI binaries and deploy that manifest on the site. Download the public
   assets anonymously and compare SHA-512 values to the manifest. Mount each DMG read-only, inspect its app, and verify the signature
   and executable architecture. Check the ZIP's executable permissions.
5. Verify `/` and the `/download/` redirect, installation guide, tour, preview scrolling, sound samples,
   architecture picker and direct download. Confirm `/api/snapshot` still rejects
   unauthenticated requests and the owner tracker still opens normally.

GitHub prereleases are excluded from the generic `/releases/latest` redirect;
website links therefore use the explicit beta tag. Update the manifest and links
when releasing a later beta. There is no self-updater in version 1.

## First open and backups

Download the correct architecture, open the DMG, drag Apply Vigil to Applications
and eject it. On first launch, follow the standard macOS **Privacy & Security →
Open Anyway** flow if prompted, then confirm Open. No Gatekeeper-disable command
or broad system-permission change is needed.

Keep JSON backups. Public app data is separate from the executable and from the
connected owner build. Manual updates retain that data when the bundle identity
is unchanged. Replacing the app preserves an existing cloud-backup connection; new installations require explicit pairing in Settings → Data. Do not install the
public beta over a connected owner installation without an explicit switch and
backup plan.

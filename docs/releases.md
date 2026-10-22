# Apply Vigil public Mac releases

The current public beta is `1.0.0-beta.2` (tag `macos-v1.0.0-beta.2`, bundle version
3), local-only, ad-hoc signed, and requires macOS 13+. Releases are public at
<https://github.com/dumpydon/vigil/releases>. Public installers must use the
`.Local` bundle identity and must never contain credentials or personal records.

## Build and validate

On a Mac with Command Line Tools, Node 22.14+ and Python 3.10+:

```sh
npm ci
npm run lint
npm test
npm run build
npm run macos:test
npm run macos:test -- --local
npm run macos:package
```

`macos:package` builds both `arm64` and `x86_64` targets; `-- --arch arm64` or
`-- --arch x86_64` builds one. It installs pinned build-only Python packages in
ignored `output/release-tools/`, draws the installation backdrop, builds fresh
public apps, checks the exact bundle file list and architecture, verifies
anonymous signatures and version/local-mode metadata, creates Finder DMGs and
permission-preserving ZIPs, and verifies disk-image checksums.

Output under `output/releases/`:

- `ApplyVigil-1.0.0-beta.2-arm64.dmg` and `.zip`
- `ApplyVigil-1.0.0-beta.2-x64.dmg` and `.zip`
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
   existing deploy command. No database migration is required for this release.
3. Tag that source with `macos-v<version>`. Update `macos/release-notes.md`, then
   run **Publish verified Mac beta** in GitHub Actions with that existing tag.
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
is unchanged. Replacing the app does not create cloud sync. Do not install the
public beta over a connected owner installation without an explicit switch and
backup plan.

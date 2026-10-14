# GitHub and public distribution

Approved direction: one source repository with separate web and macOS builds,
a free local-only public Mac beta, and downloads on the existing Cloudflare site.
Personal cloud sync is deferred. No paid service or Apple membership is required
for this ad-hoc beta.

## One repository, separate products

`dumpydon/vigil` is already public. Its visibility stays unchanged. Use its
GitHub Releases for public binaries; a second repository or binary-storage
service is unnecessary. The tracker at `/` remains an owner-authenticated
Cloudflare application. `/download/` is a public static product website.

| Source | Responsibility |
| --- | --- |
| `src/`, `shared/` | Shared interface, validation and analytics |
| `src/desktop/`, `macos/` | Bundled Mac interface and native host |
| `src/data/local-workspace.ts` | Public app's device-only records |
| `worker/`, `migrations/` | Existing owner-only Cloudflare API and D1 |
| `site/download/` | Public website, interactive sample media and guide |
| `scripts/` | Independent web, native and installer builds |
| `.github/workflows/` | Shared checks and Mac installer validation |

Mac tags use `macos-vX.Y.Z`, independently of web deployments. Keep app bundles,
DMGs, certificates, private screenshots, caches, backups, passwords and session
material outside Git. Only generated sample media belongs on the website.

## Public local app and existing connected app

The public bundle uses identity `dev.dumpydon.ApplyVigil.Local`, an empty
IndexedDB workspace, local transactional receipts, and no owner account or API
requests. It works offline from first launch. JSON/CSV export and JSON restore
provide portable backups. Settings label persistence **On this Mac**.

The existing owner build keeps identity `dev.dumpydon.ApplyVigil`, its Keychain
session, WebKit store, cloud API and offline queue. A public release must never
silently replace that installed connected build or copy its records/secrets.

Optional per-user cloud sync is a future project: distinct identities, recovery,
account-specific stores, server-side ownership checks, and an explicit migration
plan. The current one-owner API is not a public multi-user service.

## Builds, releases and hosting

1. Review source and run shared checks plus native GUI smoke checks.
2. Build local-only Apple Silicon and Intel bundles. Verify exact bundle contents,
   architectures, version, menu-only activation and anonymous signatures.
3. Package drag-to-Applications DMGs and ZIP alternatives; generate SHA-512 values
   and release metadata. Publish versioned assets through GitHub Releases.
4. Deploy the download site with the existing Worker. Its manifest refers to the
   published assets, so later web deployments retain download links without
   copying binaries into static assets.
5. Verify anonymous downloads, manifest checksums, installed-bundle contents,
   embedded demos, public pages and the existing private API boundary.

The beta is ad-hoc signed and not notarized. The install guide explains Apple's
standard first-open approval in Privacy & Security after trying to open the app.
It never asks people to disable Gatekeeper. Updates are manual replacements.
Developer ID signing, notarization and signed automatic updates can be considered
later, with any paid enrollment handled separately.

GitHub validates branch and pull-request changes. Mac CI publishes build
artifacts, not releases. Those artifacts are public because this repository is
public. Cloudflare production follows `main`; branch preview builds were found
disabled during implementation. No schema change, owner setup, credential reset
or data migration belongs in this release.

## References

- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [Apple first-launch approval](https://support.apple.com/en-us/102445)
- [Apple Mac packaging](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution)
- [Cloudflare static headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Visual and interaction reference](https://www.vigilbar.com/)

See [Mac guide](macos.md), [release procedure](releases.md), and
[download-page design](download-page.md).

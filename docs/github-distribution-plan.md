# GitHub and public distribution proposal

Status: approved for implementation by Piyush on 14 October 2026. The live user
approved pushing this version and completing the GitHub/download plan, selected
local use without an account, and requested an ad-hoc public beta without paid
hosting or a paid Apple membership. Keep repository visibility and personal data
intact; no purchase is authorized or required for this beta.

## Recommendation

Keep **one source repository**, `dumpydon/vigil`, for the web application,
Cloudflare backend, and Apply Vigil Mac application. The clients already share
React components, validation, analytics, and the offline synchronization engine.
Separate source repositories would introduce synchronization and versioning
work without a present product benefit.

Use separate folders, entry points, build outputs, and release workflows for
the two clients. Retain the current layout for the initial source backup; do not
combine it with a large folder migration.

| Path | Purpose |
| --- | --- |
| `src/` | Shared React interface and web entry point |
| `src/desktop/` | Mac interface, styles, and native bridge |
| `shared/` | Data model, validation, analytics, and periods |
| `worker/`, `migrations/` | Cloudflare API and database schema |
| `macos/` | Swift host, application metadata, and icon generation |
| `scripts/` | Web build, Mac build/test/install, future packaging |
| `.github/workflows/` | Independent validation and release jobs to add |
| `site/download/` | Public download-page source to add later |

The website remains a Cloudflare deployment. The Mac product is a versioned app
bundle/DMG. A Mac release does not require publishing a new website version.
Shared UI or API changes still need compatibility checks for both clients.

## Current evidence

- The local branch is `codex/apply-vigil-macos`; its Mac changes remain
  uncommitted and unpushed.
- `origin` is `git@github.com:dumpydon/vigil.git`. A read-only SSH request on
  14 October confirmed repository access and `main` as its default branch.
- Deployment documentation records Cloudflare Workers Builds deploying pushes
  to `main`. Preserve this boundary when first backing up the Mac work.
- Separate web/shared and native-build workflows have been added in this branch.
- The current Mac app is about 1.4 MB, targets the build machine's architecture,
  requires macOS 13+, and is ad-hoc signed.
- The Mac app's API endpoint is fixed to the current one-owner workspace. It
  requires that owner's password before initializing normal cloud-backed use.
  It is not yet a public, independent-user application.
- GitHub CLI is installed but has no active login. SSH access works. A CLI login
  may be needed for PR/release management; it is not needed to prepare this plan.

## Stage 1: source backup and repository setup

The approved first checkpoint saves the working personal Mac version:

1. Review the current changes and their file list. Check new source/docs for
   secrets or personal records. Extend ignore rules for future signing keys and
   release containers as needed. Keep app bundles, DMGs, screenshots containing
   personal data, caches, backups, session tokens, and certificates out of commits.
2. Keep the existing repository's visibility. Do not make the source public as a
   side effect of saving it to GitHub.
3. Retain the working folder layout and document web/Mac commands clearly. Add
   independent CI jobs for shared/web checks and native compilation/bundle
   validation. GUI smoke checks require a runner with a working Mac GUI session;
   keep the established local native check as a release acceptance check.
4. Run appropriate shared checks and the existing native smoke checks. Create a
   reviewed commit on `codex/apply-vigil-macos` and push that feature branch to
   the existing repository.
5. Review the branch/PR before merging. The initial backup push does not merge
   into `main` or authorize a production web deployment. If a PR is created,
   link it to this chat.

Later, configure Cloudflare build watch paths so native-host-only edits can skip
the web build. Shared UI, web, Worker, and schema changes must still trigger the
appropriate checks. Before treating a branch push as deployment-free, inspect
the connected Worker's build-branch configuration for preview deployments.

## Stage 2: decide the public app's data model

No account is needed just to download a DMG. App login is a separate product
choice. Never distribute the owner's password or initialize other users with
the owner's records.

Selected first public beta: **local use without an account**, with a fresh
workspace on each Mac, JSON/CSV backup/restore, goals, history, and local
notifications. Add optional personal cloud synchronization later. The current
owner's installed cloud workspace remains supported, with explicit separation
between local and connected workspaces. A mode label must distinguish local
persistence from server-confirmed synchronization.

For the later optional personal web/Mac sync feature, plan distinct user
identities, secure sign-in/recovery, sessions
in Keychain, per-user ownership on every server read/write and backup operation,
an isolated local store per signed-in account, abuse/rate controls, and migration
of the existing owner's data into that owner's namespace. Keep the existing
Cloudflare architecture where practical. This is a larger feature than packaging
the existing one-owner app and requires its own reviewed implementation plan.

Piyush selected local use without an account through the conversation's public
release preference question on 14 October 2026. Cloud sync is deferred. A later
live message approved the GitHub push and implementation of the distribution
plan. The public binary must work independently of the personal owner workspace.

## Stage 3: reproducible Mac releases

- Build Apple Silicon and Intel variants, or a tested universal binary. The
  current build covers only its host architecture. Verify each supported target.
- Produce a drag-to-Applications DMG, with an optional ZIP alternative.
- Use separate Mac release tags such as `macos-vX.Y.Z`, increment the bundle
  version, and generate checksums and release notes from the reviewed source.
- Keep build/release credentials in protected CI secrets. An artifact contains
  code/assets, not the developer's Keychain, WebKit cache, or personal records.
- Recommended public path: Developer ID signing, Hardened Runtime, notarization,
  and a stapled ticket, followed by a clean-Mac install test. Apple Developer
  Program membership is currently USD 99/year, with local pricing/taxes varying.
  Enrollment/payment is a separate user action and is not approved here.
- An explicitly labelled ad-hoc beta is an alternative with first-launch friction.
  It is not equivalent to a Developer ID-signed, notarized release. Do not
  instruct downloaders to disable Gatekeeper.
- The user selected the ad-hoc beta route for now. The download guide will explain
  the standard Privacy & Security → Open Anyway flow after first trying to launch
  the downloaded app. Downloading itself does not need that approval.
- Begin with manual versioned downloads and an update-check link. Signed automatic
  updates can follow as a separate feature; avoid an unverified self-updater.

## Stage 4: download page at the existing address

Add a public page at `https://vigil.dumpydon.workers.dev/download`, keeping the
existing tracker route stable. The page should include screenshots using demo
data, features, minimum macOS version, architecture choices, version/release
notes, installation guidance, privacy/storage behavior, and support information.
The page must render without an owner login or access to private application data.

Keep binary artifacts outside Git source history. If the source repository stays
private, its GitHub releases do not become anonymous public downloads. Preferred
distribution option: create an optional **public releases-only repository** later,
for example `dumpydon/apply-vigil-releases`, containing public DMGs/checksums/
release notes but no application source. This follows the reference app's
private-source/public-download arrangement. A stable URL on the existing Worker
can link or redirect to the public release asset. Publishing new app versions
then does not depend on rebuilding the website or preserving DMGs in every web
deployment.

Alternative: serve the small DMGs through the existing Worker's static assets.
Cloudflare currently limits each asset to 25 MiB; the finished DMG size must be
checked. Every subsequent web deployment would need to include the published
download files, retrieved from controlled release storage during the build.
If public source is later desired, a separate reviewed visibility/license/history
decision can allow releases directly in the existing public source repository.

Neither the public releases repository nor the website is created in Stage 1.

## Official references

- [GitHub releases and repository access](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [Cloudflare build watch paths](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/)
- [Cloudflare static-asset limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Apple Mac packaging](https://developer.apple.com/documentation/xcode/packaging-mac-software-for-distribution)
- [Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Apple program enrollment and pricing](https://developer.apple.com/help/account/membership/program-enrollment/)
- [Vigil's public releases-only repository](https://github.com/heymykro/vigil-releases)

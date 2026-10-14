# Public download page

Source: `site/download/`; build: `scripts/build-download-site.mjs`; destination:
<https://vigil.dumpydon.workers.dev/download/>. The existing tracker remains `/`.
The website and release assets need no app account or new hosting service.

The requested visual reference is <https://www.vigilbar.com/>. Its creator's
permission was reported in the implementation request. The reference's system
font stack, exact palette, capsule navigation and architecture menus, typography,
spacing, alternating feature composition, ribbon wallpaper, section reveals,
60-pixel glow parallax, FAQ grid animation, modal spring and atmospheric footer
are retained. Product copy, icon, audio and demonstrations describe Apply Vigil.
No third-party analytics, coding-agent claims or reference-provider sounds are
included.

All preview records are synthetic. Media are interactive HTML at fixed design
sizes, scaled to available space. Usage content scrolls inside a fixed glass
shell, header and rail, with OS-native scrollbars and a focusable region. The
31-second hero and 15-second first-launch guide each play automatically up to
five times, holding their final frame for five seconds between plays. Their
in-memory allowances reset with the top-level page refresh; reopening a guide
iframe does not renew them. Manual replay remains available after the automatic
limit. Pausing or selecting a step cancels a pending replay, and hidden pages
do not consume the replay delay. The 30-second tour has playback,
scene selection and replay. Five six-second chapters share one elapsed-time clock;
preloaded previews follow that clock for logging, window movement, chart details,
scrolling and alerts. Pausing freezes the demonstrations, and replay resets them. Sound samples play only after an explicit click.
Reduced motion and JavaScript-free FAQ content remain supported.

The Usage demonstration covers history and corrections in its scrollable panel;
there is no duplicate full-height history section. The goal-reached sound sample
uses the native ✅ emoji requested for its celebration.

The source contains:

- `index.html`, `site.css`, `apply.css`, `site.js`: main page and interactions.
- `previews/`: product demonstrations without app storage or account access.
- `demo.html`, `tour.*`: 30-second tour and playback.
- `install.html`, `guide*`, `pages.js`: illustrated first-launch guide.
- `first-launch.html`, `first-launch.css`, `first-launch.js`: a 15-second macOS
  installation walkthrough shared by the main page and install guide. It has
  pause, replay, seeking and individual steps, and respects reduced motion.
  The macOS screens are explicitly illustrated; no system settings or passwords
  are accessed. `docs/images/first-launch.gif` is its README companion.
- `privacy.html`, `changelog.html`, `document.css`: public product documents.
- `release.json`: generated version, asset URLs, sizes and SHA-512 values.
- `assets/`: original icon and mark; generated original sounds are ignored in Git.

`npm run dev` prepares sound assets and serves `/download/` alongside the app.
`npm run build` includes the public pages in `dist/download/`. The tracker service
worker excludes that subtree. Static CSP allows same-origin demo/guide frames
while preserving strict script restrictions and the tracker framing boundary.

Before a release, verify desktop and narrow layouts, the internal scroll region,
range controls and chart details, every menu/modal/FAQ, sound samples, anonymous
asset download, first-open guidance, and the root app/API boundary. The public
page never loads the real owner's application records.

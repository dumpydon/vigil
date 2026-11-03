Apply Vigil 1.0.0-beta.5 removes the owner-password setup from normal Mac use and adds password-free cloud recovery.

## Fixed

- Standard builds and installs now use the public local-first app by default. The developer-only connected build has a distinct legacy name and requires an explicit flag. Development copies hand off to the installed app so they cannot silently open a different history.
- The legacy web workspace is labeled clearly and stays separate from Mac backups.
- A fresh cloud restore preserves its full saved goal history and advances the local revision beyond the cloud copy, so new entries continue to back up. An older revision can never be labeled Backed up.

## Password-free private backup

- A new installation creates a random private backup identity automatically. No account, email, owner password, hardware ID, or login Keychain is needed.
- Each identity can access only its own versioned cloud backups in the existing Cloudflare service. Registration is bounded against abuse.
- The identity persists outside the app bundle. Reopening or replacing the app keeps it. Local saves remain usable offline.
- Save a recovery file in Settings → Data and keep a separate copy outside the Mac. If all app data is erased, import it to retrieve your previous cloud history without a password. Anyone holding that file can access the backup.
- Recovery previews preserve existing entries and goals. An unrelated or diverging identity cannot be silently merged into a nonempty local workspace. Matching cached history may reconnect after review. If both the retained identity and recovery file are lost, a hardware ID cannot safely recover the data.
- Users can turn cloud backup off. Public installers contain no shared credentials or personal records.

## Included

Rhythm at 85% size with six months per load; 20-Easy-Apply streaks; rolling Home totals and averages; India time and 12/24-hour clocks; compact settings and entry rows; independent local safety copies; separate local and cloud status indicators.

## Update and compatibility

Export a JSON backup, quit Apply Vigil, and replace the app in Applications. The public app retains its existing bundle identity, history, and backup connection. Choose arm64 for Apple Silicon or x64 for Intel. macOS 13+ is required. Updates are manual.

The beta is ad-hoc signed and not notarized by Apple. Follow the [installation guide](https://vigil.dumpydon.workers.dev/install/) for first-open approval. Intel is cross-compiled and structurally verified; physical Intel and clean macOS 13 runtime testing remain compatibility limits. Release files include SHA-512 checksums.

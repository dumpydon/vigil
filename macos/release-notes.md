Apply Vigil 1.0.0-beta.6 adds optional Google backup and account recovery.

- New installs save on the Mac with no sign-in screen or automatic cloud registration.
- Link Google from Settings → Data when ready. Existing history is kept in place.
- Small reminders appear at lifetime totals 5, 10, 15, 20, 30, 40, 50, 60, 75, 90 and 100; dismissals survive restarts, and linking stops them.
- Google can recover access after the Mac's local key is lost. Review cloud history before restoring; unrelated histories are never silently combined.
- Local saves work offline. Cloud copies include edits, goals and retained deletions, and are verified before showing Backed up.
- Existing beta 5 backup connections and recovery files remain supported.

macOS 13+; separate Apple Silicon and Intel DMG/ZIP files. This beta is ad-hoc signed and not notarized by Apple; follow the first-launch guide if macOS blocks it. The Apple Silicon build is exercised locally; Intel is cross-compiled and structurally checked, with physical Intel/macOS 13 testing still outstanding.

Backups are not live multi-Mac sync. A recovery file remains an optional spare; keep it private and off this Mac. Google sign-in requests identity only, without Gmail or Drive access.

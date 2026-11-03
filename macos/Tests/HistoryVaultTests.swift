import Foundation

@main private struct HistoryVaultChecks {
    static let firstID = "88888888-1111-4111-8111-111111111111"
    static func image(_ revision: Int, empty: Bool = false) -> [String: Any] {
        let entries: [[String: Any]] = empty ? [] : [["id": firstID, "date": "2026-10-24", "easy": revision + 1, "external": 2, "loggedAt": "2026-10-24T12:00:00.000Z", "createdAt": "2026-10-24T12:00:00.000Z", "updatedAt": "2026-10-24T12:00:00.000Z", "deleted": false, "backdated": false, "version": 1]]
        return ["snapshot": ["entries": entries, "policies": [["date": "1970-01-01", "value": 75]], "overrides": [], "trackingStart": "2026-10-24", "revision": revision, "goalRevision": 0, "serverNow": "2026-10-24T12:00:00.000Z"], "receipts": []]
    }
    static func backup() -> [String: Any] {
        let snapshot = image(1)["snapshot"] as! [String: Any]
        return ["format": "vigil-backup", "version": 1, "exportedAt": "2026-10-24T12:00:00.000Z", "trackingStart": snapshot["trackingStart"]!, "entries": snapshot["entries"]!, "policies": snapshot["policies"]!, "overrides": snapshot["overrides"]!]
    }
    static func check(_ condition: Bool, _ message: String) throws { if !condition { throw DesktopError.message(message) } }
    static func main() async {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("vigil-vault-unit-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        do {
            let vault = HistoryVault(root: root, legacyDetection: false)
            let initial = await vault.loadLocal()
            try check(initial["image"] is NSNull && initial["needsHistoryChoice"] as? Bool == false, "Fresh local mode must initialize without a fake history")
            try await vault.saveLocal(image(1)); try await vault.saveLocal(image(2))
            let before = await vault.list();try check(before.count == 2, "Distinct saved revisions must have independent copies")
            try await vault.saveLocal(image(1))
            let fresh = await vault.loadLocal(),snapshot = (fresh["image"] as? [String: Any])?["snapshot"] as? [String: Any]
            try check(snapshot?["revision"] as? Int == 2, "A stale window overwrote newer history")
            var blocked = false
            do { try await vault.saveLocal(image(3, empty: true)) } catch { blocked = true }
            try check(blocked, "An incomplete history replaced its safety copy")
            try Data("corrupt pointer".utf8).write(to: root.appendingPathComponent("local-current.json"))
            let recovered = await vault.loadLocal(), recoveredSnapshot = (recovered["image"] as? [String: Any])?["snapshot"] as? [String: Any]
            try check(recoveredSnapshot?["revision"] as? Int == 2, "A corrupt pointer did not recover the newest verified archive")
            guard let id = before.first?["id"] as? String else { throw DesktopError.message("No recovery copy was listed") }
            let portable = try await vault.recoveryBackup(id: id)
            try check(portable["format"] as? String == "vigil-backup", "Recovery must return a portable versioned backup")
            blocked = false
            do { _ = try await vault.recoveryBackup(id: "../../private") } catch { blocked = true }
            try check(blocked, "Recovery accepted a path instead of a managed copy ID")
            let file = root.appendingPathComponent("history-\(id).json")
            var wrapper = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as! [String: Any]
            wrapper["sha256"] = String(repeating: "0", count: 64)
            try JSONSerialization.data(withJSONObject: wrapper).write(to: file)
            blocked = false
            do { _ = try await vault.recoveryBackup(id: id) } catch { blocked = true }
            try check(blocked, "A modified copy bypassed its checksum")
            let status = await vault.status(local: true)
            try check((status["corruptCopies"] as? Int ?? 0) > 0, "Damaged copies must be reported")
            let permissions = try FileManager.default.attributesOfItem(atPath: root.path)[.posixPermissions] as? NSNumber
            try check(permissions?.intValue == 0o700, "The vault directory must be private")

            let otherRoot = root.appendingPathComponent("separate-workspace"), other = HistoryVault(root: otherRoot, legacyDetection: false)
            _ = try await other.capture(backup: backup(), local: false, working: [:])
            let choice = await other.loadLocal();try check(choice["needsHistoryChoice"] as? Bool == true, "A different app workspace started silently")
            try await other.confirmSeparateHistory()
            let approved = await other.loadLocal();try check(approved["needsHistoryChoice"] as? Bool == false, "An explicit workspace choice was not retained")
            let userFile = otherRoot.appendingPathComponent("unrelated.json");try Data("keep this".utf8).write(to: userFile)
            // More than the recent-copy cap must keep daily versions and never
            // delete user files or all committed images.
            for revision in 1...55 { try await other.saveLocal(image(revision)) }
            let retained = await other.list()
            try check(retained.count <= 50 && retained.count >= 48, "Recent-copy retention is not bounded")
            try check(FileManager.default.fileExists(atPath: userFile.path), "Retention touched an unrelated file")
            let last = await other.loadLocal(), lastSnapshot = (last["image"] as? [String: Any])?["snapshot"] as? [String: Any]
            try check(lastSnapshot?["revision"] as? Int == 55, "Retention lost the latest committed history")
            let fileRoot = root.appendingPathComponent("unwritable-root");try Data("file".utf8).write(to: fileRoot)
            let unwritable = HistoryVault(root: fileRoot, legacyDetection: false)
            blocked = false
            do { try await unwritable.saveLocal(image(1)) } catch { blocked = true }
            try check(blocked, "A failed disk write was reported as a backup success")
            print("History vault checks passed: atomic versions, stale/empty guards, checksum failure, pointer recovery, cross-workspace choice, private permissions, retention, and write-failure reporting.")
        } catch { fputs("History vault check failed: \(error.localizedDescription)\n", stderr); exit(1) }
    }
}

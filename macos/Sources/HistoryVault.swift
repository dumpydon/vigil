import Foundation
import CryptoKit
import Darwin

// Independent of bundle location and WebKit origins. No credentials or cloud
// calls. Tests always supply an isolated temporary directory.
actor HistoryVault {
    private let root: URL
    private let legacyDetection: Bool
    private let clock: () -> Date
    private var fingerprints: [String: String] = [:]
    private let manager = FileManager.default
    private let maximumSize = 64_000_000

    init(root: URL? = nil, legacyDetection: Bool = true, clock: @escaping () -> Date = Date.init) {
        self.root = root ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("ApplyVigil/HistoryBackups", isDirectory: true)
        self.legacyDetection = legacyDetection
        self.clock = clock
    }
    private func mode(_ local: Bool) -> String { local ? "local" : "connected" }
    private func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    private func bytes(_ value: Any) throws -> Data { try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) }
    private func setup() throws {
        try manager.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try manager.setAttributes([.posixPermissions: 0o700], ofItemAtPath: root.path)
    }
    private func atomic(_ value: [String: Any], at url: URL) throws {
        try setup()
        let data = try bytes(value)
        guard data.count <= maximumSize else { throw DesktopError.message("The automatic backup exceeds its supported size. Export your history before continuing.") }
        let temp = root.appendingPathComponent(".writing-\(UUID().uuidString)")
        defer { try? manager.removeItem(at: temp) }
        try data.write(to: temp, options: .withoutOverwriting)
        try manager.setAttributes([.posixPermissions: 0o600], ofItemAtPath: temp.path)
        let handle = try FileHandle(forWritingTo: temp)
        try handle.synchronize(); try handle.close()
        // POSIX rename atomically replaces only this managed pointer/file.
        guard Darwin.rename(temp.path, url.path) == 0 else { throw DesktopError.message("The safety copy could not be committed. Your existing copy is retained.") }
        let directory = Darwin.open(root.path, O_RDONLY)
        if directory >= 0 { _ = Darwin.fsync(directory); Darwin.close(directory) }
    }
    private func envelope(_ payload: [String: Any]) throws -> [String: Any] {
        ["format": "apply-vigil-safety", "version": 1, "sha256": hash(try bytes(payload)), "payload": payload]
    }
    private func read(_ url: URL) throws -> [String: Any] {
        let info = try manager.attributesOfItem(atPath: url.path)
        guard ((info[.size] as? NSNumber)?.intValue ?? (maximumSize + 1)) <= maximumSize,
              (info[.type] as? FileAttributeType) == .typeRegular else { throw DesktopError.message("This safety copy is not a regular supported file.") }
        let data = try Data(contentsOf: url)
        guard let wrapper = try JSONSerialization.jsonObject(with: data) as? [String: Any], wrapper["format"] as? String == "apply-vigil-safety", wrapper["version"] as? Int == 1,
              let payload = wrapper["payload"] as? [String: Any], let digest = wrapper["sha256"] as? String,
              hash(try bytes(payload)) == digest else { throw DesktopError.message("A safety copy failed its integrity check. It has not been restored.") }
        return payload
    }
    private func validateBackup(_ backup: [String: Any]) throws {
        guard backup["format"] as? String == "vigil-backup", backup["version"] as? Int == 1,
              backup["trackingStart"] is String, backup["exportedAt"] is String,
              let entries = backup["entries"] as? [[String: Any]], entries.count <= 100_000,
              backup["policies"] is [[String: Any]], backup["overrides"] is [[String: Any]] else { throw DesktopError.message("Invalid history safety copy.") }
        let ids = entries.compactMap { $0["id"] as? String }
        guard ids.count == entries.count, Set(ids).count == ids.count,
              entries.allSatisfy({ UUID(uuidString: $0["id"] as? String ?? "") != nil && $0["date"] is String && $0["deleted"] is Bool && $0["easy"] is Int && $0["external"] is Int }) else { throw DesktopError.message("The history safety copy has invalid records.") }
    }
    private func backup(from snapshot: [String: Any]) throws -> [String: Any] {
        var backup: [String: Any] = ["format": "vigil-backup", "version": 1, "exportedAt": ISO8601DateFormatter().string(from: clock())]
        for key in ["entries", "policies", "overrides", "trackingStart"] { backup[key] = snapshot[key] }
        // JS backups use millisecond timestamps; preserve that portable format.
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        backup["exportedAt"] = formatter.string(from: clock())
        try validateBackup(backup)
        return backup
    }
    private func archiveURLs() -> [URL] {
        ((try? manager.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []).filter {
            let name = $0.lastPathComponent
            return name.hasPrefix("history-") && name.hasSuffix(".json") && UUID(uuidString: String(name.dropFirst(8).dropLast(5))) != nil
        }
    }
    private func archives() -> [(URL, [String: Any])] {
        archiveURLs().compactMap { url in
            guard let record = try? read(url), record["createdAt"] is String, record["mode"] is String, let backup = record["backup"] as? [String: Any], (try? validateBackup(backup)) != nil else { return nil }
            return (url, record)
        }.sorted { ($0.1["createdAt"] as? String ?? "") > ($1.1["createdAt"] as? String ?? "") }
    }
    private func latestImage() -> [String: Any]? {
        let current = root.appendingPathComponent("local-current.json")
        var images = archives().filter { $0.1["mode"] as? String == "local" }.compactMap { $0.1["image"] as? [String: Any] }
        if let record = try? read(current), let image = record["image"] as? [String: Any] { images.append(image) }
        // Recover a committed archive even after interruption between its write
        // and the current-pointer rename. Never choose an older pointer first.
        return images.max { (($0["snapshot"] as? [String: Any])?["revision"] as? Int ?? -1) < (($1["snapshot"] as? [String: Any])?["revision"] as? Int ?? -1) }
    }
    private func hasOtherHistory(local: Bool) -> Bool {
        if archives().contains(where: { $0.1["mode"] as? String != mode(local) }) { return true }
        guard legacyDetection else { return false }
        let identifier = local ? "dev.dumpydon.ApplyVigil" : "dev.dumpydon.ApplyVigil.Local"
        let legacy = manager.homeDirectoryForCurrentUser.appendingPathComponent("Library/WebKit/\(identifier)")
        return manager.fileExists(atPath: legacy.path)
    }
    func loadLocal() -> [String: Any] {
        let image = latestImage()
        let approved = manager.fileExists(atPath: root.appendingPathComponent("local-separate-history.json").path)
        let verified = archives()
        let localEvidence = manager.fileExists(atPath: root.appendingPathComponent("local-current.json").path) || archiveURLs().count > verified.count || verified.contains {
            $0.1["mode"] as? String == "local" && !(($0.1["backup"] as? [String: Any])?["entries"] as? [Any] ?? []).isEmpty
        }
        return ["image": image as Any? ?? NSNull(), "needsHistoryChoice": image == nil && (localEvidence || !approved && hasOtherHistory(local: true))]
    }
    func confirmSeparateHistory() throws {
        try atomic(["confirmedAt": ISO8601DateFormatter().string(from: clock())], at: root.appendingPathComponent("local-separate-history.json"))
    }
    func noteRecovery(_ message: String, local: Bool) throws {
        guard !message.isEmpty, message.utf8.count <= 1000 else { throw DesktopError.message("Invalid recovery notice.") }
        try atomic(["message": message, "createdAt": ISO8601DateFormatter().string(from: clock())], at: root.appendingPathComponent("\(mode(local))-notice.json"))
    }
    func acknowledgeRecovery(local: Bool) throws {
        let url = root.appendingPathComponent("\(mode(local))-notice.json")
        if manager.fileExists(atPath: url.path) { try manager.removeItem(at: url) }
    }
    func saveLocal(_ image: [String: Any]) throws {
        guard let snapshot = image["snapshot"] as? [String: Any], let revision = snapshot["revision"] as? Int, revision >= 0,
              image["receipts"] is [[String: Any]], let entries = snapshot["entries"] as? [[String: Any]] else { throw DesktopError.message("Invalid local safety image.") }
        let backup = try backup(from: snapshot)
        if let old = latestImage(), let previous = old["snapshot"] as? [String: Any] {
            let priorRevision = previous["revision"] as? Int ?? 0
            if revision < priorRevision { return } // A slower window cannot replace a newer copy.
            let currentIDs = Set(entries.compactMap { $0["id"] as? String })
            let oldIDs = Set((previous["entries"] as? [[String: Any]] ?? []).compactMap { $0["id"] as? String })
            guard oldIDs.isSubset(of: currentIDs) else { throw DesktopError.message("History protection stopped an incomplete history from replacing your safety copy. Open History protection to recover the retained records.") }
        }
        _ = try capture(backup: backup, local: true, working: [:], image: image)
        try atomic(try envelope(["image": image]), at: root.appendingPathComponent("local-current.json"))
    }
    @discardableResult func capture(backup: [String: Any], local: Bool, working: [String: Any], image: [String: Any]? = nil) throws -> String {
        try validateBackup(backup)
        var fingerprintBackup = backup; fingerprintBackup.removeValue(forKey: "exportedAt")
        let day = String(ISO8601DateFormatter().string(from: clock()).prefix(10))
        let fingerprint = hash(try bytes(["backup": fingerprintBackup, "working": working, "day": day, "imageRevision": (image?["snapshot"] as? [String: Any])?["revision"] ?? NSNull()]))
        let key = mode(local) + (image == nil ? "-working" : "-primary")
        if fingerprints[key] == fingerprint && working["reason"] as? String != "manual" { return "unchanged" }
        let id = UUID().uuidString
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var payload: [String: Any] = ["id": id, "mode": mode(local), "createdAt": formatter.string(from: clock()), "backup": backup, "working": working]
        if let image { payload["image"] = image }
        try atomic(try envelope(payload), at: root.appendingPathComponent("history-\(id).json"))
        fingerprints[key] = fingerprint
        try prune()
        return id
    }
    private func prune() throws {
        let records = archives(),cutoff = clock().addingTimeInterval(-90 * 86400)
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var keep = Set(records.prefix(48).map { $0.0.lastPathComponent }), daily = Set<String>()
        // Preserve daily versions and a full primary image for each mode. A
        // working copy with an in-flight edit never evicts every committed image.
        var primary = Set<String>()
        for (url,record) in records {
            let mode = record["mode"] as? String ?? "", stamp = record["createdAt"] as? String ?? ""
            if record["image"] != nil && !primary.contains(mode) { keep.insert(url.lastPathComponent); primary.insert(mode) }
            let key = mode + String(stamp.prefix(10))
            if let date = formatter.date(from: stamp), date >= cutoff, !daily.contains(key) { keep.insert(url.lastPathComponent); daily.insert(key) }
        }
        for (url,_) in records where !keep.contains(url.lastPathComponent) { try manager.removeItem(at: url) }
    }
    func list() -> [[String: Any]] {
        archives().prefix(150).map { url,record in
            let backup = record["backup"] as? [String: Any] ?? [:],entries = backup["entries"] as? [[String: Any]] ?? [],active = entries.filter { $0["deleted"] as? Bool != true }
            return ["id": record["id"] ?? String(url.lastPathComponent.dropFirst(8).dropLast(5)), "mode": record["mode"] ?? "unknown", "createdAt": record["createdAt"] ?? "", "trackingStart": backup["trackingStart"] ?? "", "entries": active.count, "applications": active.reduce(0) { $0 + ($1["easy"] as? Int ?? 0) + ($1["external"] as? Int ?? 0) }, "hasPending": !((record["working"] as? [String: Any])?["queue"] as? [Any] ?? []).isEmpty]
        }
    }
    func recoveryBackup(id: String) throws -> [String: Any] {
        guard UUID(uuidString: id) != nil else { throw DesktopError.message("Choose a valid saved history.") }
        let payload = try read(root.appendingPathComponent("history-\(id).json"))
        guard let backup = payload["backup"] as? [String: Any] else { throw DesktopError.message("The selected copy has no recoverable history.") }
        try validateBackup(backup)
        return backup
    }
    func status(local: Bool) -> [String: Any] {
        let items = list(),matching = items.filter { $0["mode"] as? String == mode(local) }
        let noticeURL = root.appendingPathComponent("\(mode(local))-notice.json")
        let notice = (try? Data(contentsOf: noticeURL)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }?["message"] as? String ?? ""
        let current = root.appendingPathComponent("local-current.json")
        let damagedPointer = local && manager.fileExists(atPath: current.path) && (try? read(current)) == nil ? 1 : 0
        return ["mode": mode(local), "count": matching.count, "latest": matching.first as Any? ?? NSNull(), "otherHistory": hasOtherHistory(local: local), "directory": root.path, "corruptCopies": archiveURLs().count - archives().count + damagedPointer, "notice": notice]
    }
    func directory() throws -> URL { try setup(); return root }
}

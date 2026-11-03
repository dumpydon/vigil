import Foundation
import CryptoKit
import AppKit
import UniformTypeIdentifiers

@MainActor final class CloudBackup: NSObject, URLSessionTaskDelegate {
    private typealias Connection = BackupIdentity
    private let directory: URL
    private var connection: Connection?
    private var verified: [String: Any]?
    private var phase = "disconnected"
    private var failure = ""
    private var pending: (String, Int, String)?
    private var running = false
    private var recoveryCandidate: Connection?
    private var setupRunning = false
    private var recoveryFileSaved = false
    private let configuration: URLSessionConfiguration
    private lazy var session: URLSession = {
        let config = configuration
        config.httpCookieStorage = nil; config.httpShouldSetCookies = false; config.urlCache = nil
        config.timeoutIntervalForRequest = 30; config.timeoutIntervalForResource = 60
        return URLSession(configuration: config, delegate: self, delegateQueue: .main)
    }()
    init(directory: URL, configuration: URLSessionConfiguration = .ephemeral) {
        self.directory = directory
        self.configuration = configuration
        super.init()
        let file = directory.appendingPathComponent("device.json")
        if FileManager.default.fileExists(atPath: file.path) {
            if let data = try? Data(contentsOf: file), let saved = try? JSONDecoder().decode(Connection.self, from: data), saved.valid {
                connection = saved; phase = "pending"
                if let receipt = try? Data(contentsOf: directory.appendingPathComponent("verified.json")) { verified = try? JSONSerialization.jsonObject(with: receipt) as? [String: Any] }
            } else { phase = "error"; failure = "The saved backup identity could not be read. It has not been replaced. Import your recovery file to reconnect." }
        }
        recoveryFileSaved = FileManager.default.fileExists(atPath: directory.appendingPathComponent("recovery-exported.json").path)
        if phase != "error", connection == nil, FileManager.default.fileExists(atPath: directory.appendingPathComponent("backup-paused.json").path) { phase = "paused" }
    }
    nonisolated static func validOrigin(_ text: String) -> URL? {
        guard let url = URL(string: text), url.scheme == "https", url.host != nil, url.user == nil, url.password == nil, url.query == nil, url.fragment == nil, url.path.isEmpty || url.path == "/" else { return nil }
        return url
    }
    private func write(_ data: Data, name: String) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: directory.path)
        let file = directory.appendingPathComponent(name)
        try data.write(to: file, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
    }
    func status() -> [String: Any] {
        ["connected": connection != nil && connection?.registrationPending != true, "phase": phase, "origin": connection?.origin ?? "", "error": failure,
         "identityId": connection?.id ?? "", "recoveryFileSaved": recoveryFileSaved,
         "revision": verified?["revision"] ?? NSNull(), "verifiedAt": verified?["verifiedAt"] ?? NSNull(),
         "applications": verified?["applications"] ?? NSNull()]
    }
    func setup() async -> [String: Any] {
        guard phase != "paused" else { return status() }
        guard !setupRunning else { return status() }
        setupRunning = true; defer { setupRunning = false }
        do {
            if connection == nil {
                guard phase != "error" else { return status() }
                let created = Connection.create()
                // Commit the random identity before any network request so a
                // lost registration response cannot create another identity.
                try write(JSONEncoder().encode(created), name: "device.json")
                connection = created; recoveryFileSaved = false
                let marker = directory.appendingPathComponent("recovery-exported.json")
                if FileManager.default.fileExists(atPath: marker.path) { try FileManager.default.removeItem(at: marker) }
            }
            if var saved = connection, saved.registrationPending == true {
                phase = "connecting"; failure = ""
                _ = try await request(origin: saved.origin, path: "/api/backups/register", method: "POST", body: ["id": saved.id, "token": saved.token])
                saved.registrationPending = false
                try write(JSONEncoder().encode(saved), name: "device.json"); connection = saved; phase = "pending"
            }
        } catch { phase = "error"; failure = error.localizedDescription }
        return status()
    }
    func resume() async throws -> [String: Any] {
        let paused = directory.appendingPathComponent("backup-paused.json")
        if FileManager.default.fileExists(atPath: paused.path) { try FileManager.default.removeItem(at: paused) }
        if phase == "paused" { phase = "disconnected" }
        return await setup()
    }
    private func request(origin: String, path: String, method: String = "GET", body: [String: Any]? = nil, token: String? = nil, cookie: String? = nil) async throws -> ([String: Any], HTTPURLResponse) {
        guard let base = Self.validOrigin(origin), let url = URL(string: path, relativeTo: base)?.absoluteURL, url.host == base.host, url.scheme == "https" else { throw DesktopError.message("Use the HTTPS address of your private Vigil workspace.") }
        var request = URLRequest(url: url); request.httpMethod = method
        request.setValue(origin.trimmingCharacters(in: CharacterSet(charactersIn: "/")), forHTTPHeaderField: "Origin")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let cookie { request.setValue(cookie, forHTTPHeaderField: "Cookie") }
        if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (bytes, result) = try await session.data(for: request)
        guard let response = result as? HTTPURLResponse, bytes.count <= 24_000_000, let object = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { throw DesktopError.message("The backup service returned an invalid response.") }
        guard (200..<300).contains(response.statusCode) else { throw DesktopError.message(object["error"] as? String ?? "Cloud backup could not be verified. Your local history is retained.") }
        return (object, response)
    }
    func connect(origin: String, password: String) async throws -> [String: Any] {
        guard !running, Self.validOrigin(origin) != nil, !password.isEmpty, password.count <= 256 else { throw DesktopError.message("Enter your private workspace URL and password.") }
        let base = origin.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let (_, response) = try await request(origin: base, path: "/api/login", method: "POST", body: ["id": UUID().uuidString, "password": password])
        let fields = response.allHeaderFields.reduce(into: [String: String]()) { result, item in if let key = item.key as? String { result[key] = String(describing: item.value) } }
        guard let url = Self.validOrigin(base), let cookie = HTTPCookie.cookies(withResponseHeaderFields: fields, for: url).first(where: { $0.name == "__Host-vigil_session" }) else { throw DesktopError.message("The workspace did not return a valid sign-in.") }
        let ownerCookie = "__Host-vigil_session=\(cookie.value)"
        let (paired, _) = try await request(origin: base, path: "/api/backups/devices", method: "POST", body: ["id": UUID().uuidString, "name": "Apply Vigil on Mac"], cookie: ownerCookie)
        guard let id = paired["id"] as? String, UUID(uuidString: id) != nil, let token = paired["token"] as? String, token.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw DesktopError.message("The workspace did not return a valid device connection.") }
        let saved = Connection(id: id, token: token, origin: base, registrationPending: false)
        try write(JSONEncoder().encode(saved), name: "device.json")
        connection = saved; verified = nil; phase = "pending"; failure = ""
        _ = try? await request(origin: base, path: "/api/logout", method: "POST", body: ["id": UUID().uuidString], cookie: ownerCookie)
        return status()
    }
    func save(json: String, revision: Int, fingerprint: String) async -> [String: Any] {
        guard connection != nil else { return status() }
        if let previous = verified?["revision"] as? Int, previous > revision {
            phase = "error"; failure = "The cloud has a newer history revision. Recover it before uploading an older local history."; return status()
        }
        guard revision >= 0, json.utf8.count <= 12_000_000, fingerprint.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { phase = "error"; failure = "Invalid cloud backup. Your local history is retained."; return status() }
        if let old = pending, old.1 > revision { return status() }
        pending = (json, revision, fingerprint)
        if running { return status() }
        running = true
        defer { running = false }
        while let next = pending, let target = connection {
            pending = nil
            if phase == "backedUp", verified?["revision"] as? Int == next.1, verified?["fingerprint"] as? String == next.2,
               let stamp = verified?["verifiedAt"] as? String, let date = ISO8601DateFormatter().date(from: stamp), Date().timeIntervalSince(date) < 900 { continue }
            phase = "uploading"; failure = ""
            do {
                let (receipt, _) = try await request(origin: target.origin, path: "/api/backups", method: "POST", body: ["id": UUID().uuidString, "revision": next.1, "backupJSON": next.0], token: target.token)
                guard let id = receipt["id"] as? String, UUID(uuidString: id) != nil else { throw DesktopError.message("The server did not acknowledge the backup.") }
                let (copy, _) = try await request(origin: target.origin, path: "/api/backups/\(id)", token: target.token)
                guard let raw = copy["backupJSON"] as? String, let digest = copy["sha256"] as? String,
                      SHA256.hash(data: Data(raw.utf8)).map({String(format: "%02x", $0)}).joined() == digest,
                      copy["fingerprint"] as? String == next.2, copy["revision"] as? Int == next.1 else { throw DesktopError.message("The downloaded cloud copy did not match your history. Your local copies are retained.") }
                guard var uploaded = try JSONSerialization.jsonObject(with: Data(next.0.utf8)) as? [String: Any], var downloaded = try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any] else { throw DesktopError.message("The verified cloud content is invalid.") }
                uploaded.removeValue(forKey: "exportedAt"); downloaded.removeValue(forKey: "exportedAt")
                guard NSDictionary(dictionary: uploaded).isEqual(to: downloaded) else { throw DesktopError.message("The cloud content differs from this Mac's history. Existing copies are retained.") }
                var record = receipt; record["verifiedAt"] = ISO8601DateFormatter().string(from: Date())
                try write(JSONSerialization.data(withJSONObject: record), name: "verified.json")
                verified = record; phase = "backedUp"
            } catch { phase = "error"; failure = error.localizedDescription; break }
        }
        return status()
    }
    func list() async throws -> [String: Any] {
        guard let connection else { throw DesktopError.message("Connect your private workspace first.") }
        return try await request(origin: connection.origin, path: "/api/backups", token: connection.token).0
    }
    func read(id: String) async throws -> [String: Any] {
        guard let connection, UUID(uuidString: id) != nil else { throw DesktopError.message("Choose a valid cloud backup.") }
        let copy = try await request(origin: connection.origin, path: "/api/backups/\(id)", token: connection.token).0
        guard let raw = copy["backupJSON"] as? String, SHA256.hash(data: Data(raw.utf8)).map({String(format: "%02x", $0)}).joined() == copy["sha256"] as? String else { throw DesktopError.message("The cloud backup failed its integrity check.") }
        return copy
    }
    func disconnect() async throws -> [String: Any] {
        guard !running else { throw DesktopError.message("Wait for the current backup to finish.") }
        if let target = connection { _ = try await request(origin: target.origin, path: "/api/backups/devices/\(target.id)", method: "DELETE", token: target.token) }
        for name in ["device.json", "verified.json", "recovery-exported.json"] { let file = directory.appendingPathComponent(name); if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) } }
        try write(Data("{\"paused\":true}".utf8), name: "backup-paused.json")
        connection = nil; verified = nil; pending = nil; recoveryFileSaved = false; phase = "paused"; failure = ""
        return status()
    }
    func exportRecoveryFile() async throws -> [String: Any] {
        guard let saved = connection, saved.registrationPending != true else { throw DesktopError.message("Wait for the backup identity to connect before saving its recovery file.") }
        let panel = NSSavePanel(); panel.allowedContentTypes = [.json]
        panel.nameFieldStringValue = "Apply-Vigil-Recovery.json"; panel.title = "Save your recovery file"
        panel.message = "Keep this file outside this Mac, such as on a USB drive or your own cloud drive. It restores access without a password if all app data is deleted. Anyone with the file can access this backup."
        guard await panel.begin() == .OK, let url = panel.url else { return ["saved": false] }
        try saved.recoveryFile().write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
        try write(Data("{\"saved\":true}".utf8), name: "recovery-exported.json"); recoveryFileSaved = true
        return ["saved": true]
    }
    func chooseRecoveryFile() async throws -> [String: Any] {
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.json]; panel.allowsMultipleSelection = false
        panel.title = "Restore an Apply Vigil backup identity"
        guard await panel.begin() == .OK, let url = panel.url else { return ["cancelled": true] }
        let values = try url.resourceValues(forKeys: [.fileSizeKey])
        guard (values.fileSize ?? 4097) <= 4096 else { throw DesktopError.message("Choose the small recovery file, not a full history export.") }
        return try await prepareRecovery(bytes: Data(contentsOf: url))
    }
    func prepareRecovery(bytes: Data) async throws -> [String: Any] {
        recoveryCandidate = nil
        let candidate = try Connection.readRecoveryFile(bytes)
        let (listing, _) = try await request(origin: candidate.origin, path: "/api/backups", token: candidate.token)
        guard let copies = listing["backups"] as? [[String: Any]], let newest = copies.first,
              let id = newest["id"] as? String, UUID(uuidString: id) != nil else { throw DesktopError.message("This identity has no cloud history to recover yet.") }
        let (copy, _) = try await request(origin: candidate.origin, path: "/api/backups/\(id)", token: candidate.token)
        guard let raw = copy["backupJSON"] as? String,
              SHA256.hash(data: Data(raw.utf8)).map({String(format: "%02x", $0)}).joined() == copy["sha256"] as? String else { throw DesktopError.message("The cloud recovery copy failed its integrity check.") }
        recoveryCandidate = candidate
        return ["cancelled": false, "sameIdentity": candidate.id == connection?.id, "copy": copy]
    }
    func applyRecoveryIdentity() throws -> [String: Any] {
        guard !running, !setupRunning, let candidate = recoveryCandidate else { throw DesktopError.message("Wait for backup work to finish, then choose the recovery file again.") }
        if let old = connection { try write(JSONEncoder().encode(old), name: "previous-device.json") }
        try write(JSONEncoder().encode(candidate), name: "device.json")
        connection = candidate; verified = nil; pending = nil; recoveryCandidate = nil
        phase = "pending"; failure = ""; recoveryFileSaved = true
        try write(Data("{\"saved\":true}".utf8), name: "recovery-exported.json")
        let paused = directory.appendingPathComponent("backup-paused.json")
        if FileManager.default.fileExists(atPath: paused.path) { try FileManager.default.removeItem(at: paused) }
        return status()
    }
    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

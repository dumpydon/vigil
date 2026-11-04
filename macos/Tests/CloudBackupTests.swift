import Foundation
import CryptoKit

// A fake service intercepts every URLSession request. No installed history,
// production API, Keychain, or native file dialog is used by these checks.
private final class BackupFixture: URLProtocol {
    private static let lock = NSRecursiveLock()
    static var registrations: [String: String] = [:]
    static var copies: [String: [String: Any]] = [:]
    static var owners: [String: String] = [:]
    static var paths: [String] = []
    static var failRegistration = false
    static var damageDownload = false
    static let fingerprint = String(repeating: "a", count: 64)
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    private func body() -> [String: Any] {
        var bytes = request.httpBody ?? Data()
        if bytes.isEmpty, let stream = request.httpBodyStream {
            stream.open(); defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable { let n = stream.read(&buffer, maxLength: buffer.count); if n <= 0 { break }; bytes.append(buffer, count: n) }
        }
        return (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any] ?? [:]
    }
    override func startLoading() {
        Self.lock.lock(); defer { Self.lock.unlock() }
        let path = request.url!.path, method = request.httpMethod ?? "GET", value = body()
        Self.paths.append(path)
        var status = 200, result: [String: Any] = [:]
        if path == "/api/backups/register" {
            if Self.failRegistration { status = 503; result = ["error": "Offline fixture"] }
            else if let id = value["id"] as? String, let token = value["token"] as? String {
                if let old = Self.registrations[id], old != token { status = 409; result = ["error": "Identity conflict"] }
                else { Self.registrations[id] = token; result = ["id": id, "registered": true] }
            } else { status = 400 }
        } else {
            let token = request.value(forHTTPHeaderField: "Authorization")?.replacingOccurrences(of: "Bearer ", with: "") ?? ""
            guard Self.registrations.values.contains(token) else { finish(401, ["error": "Not connected"]); return }
            if path == "/api/backups", method == "POST", let id = value["id"] as? String, let revision = value["revision"] as? Int, let raw = value["backupJSON"] as? String {
                let digest = SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined()
                let copy: [String: Any] = ["id": id, "revision": revision, "fingerprint": Self.fingerprint, "sha256": digest, "applications": 486, "backupJSON": raw]
                Self.copies[id] = copy; Self.owners[id] = token
                result = copy; result.removeValue(forKey: "backupJSON")
            } else if path == "/api/backups", method == "GET" {
                result = ["backups": Self.copies.values.filter { Self.owners[$0["id"] as! String] == token }.sorted { ($0["revision"] as! Int) > ($1["revision"] as! Int) }.map { value -> [String: Any] in var copy = value; copy.removeValue(forKey: "backupJSON"); return copy }]
            } else if method == "DELETE" {
                Self.registrations = Self.registrations.filter { $0.value != token }; result = ["revoked": true]
            } else if let copy = Self.copies[String(path.split(separator: "/").last ?? "")], Self.owners[copy["id"] as! String] == token {
                result = copy
                if Self.damageDownload { result["backupJSON"] = "{}" }
            } else { status = 404; result = ["error": "Not found"] }
        }
        finish(status, result)
    }
    private func finish(_ status: Int, _ object: [String: Any]) {
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: object))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@main private struct BackupChecks {
    private static func check(_ condition: Bool, _ message: String) throws { if !condition { throw DesktopError.message(message) } }
    @MainActor private static func client(_ root: URL) -> CloudBackup {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [BackupFixture.self]
        return CloudBackup(directory: root, configuration: config)
    }
    private static func read(_ root: URL) throws -> BackupIdentity { try JSONDecoder().decode(BackupIdentity.self, from: Data(contentsOf: root.appendingPathComponent("device.json"))) }
    @MainActor static func main() async {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ApplyVigil-cloud-checks-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        do {
            let original = root.appendingPathComponent("original")
            let fresh = client(original), initialRequests = BackupFixture.paths.count
            let local = await fresh.setup()
            try check(local["phase"] as? String == "local", "A new install must start locally")
            try check(BackupFixture.paths.count == initialRequests, "First launch must make no cloud registration request")
            try check(!FileManager.default.fileExists(atPath: original.appendingPathComponent("device.json").path), "First launch must not create a cloud key")
            // Existing beta 5 identities still resume; use one as a fixture.
            try FileManager.default.createDirectory(at: original, withIntermediateDirectories: true)
            try JSONEncoder().encode(BackupIdentity.create()).write(to: original.appendingPathComponent("device.json"))
            let first = client(original)
            BackupFixture.failRegistration = true
            let offline = await first.setup()
            try check(offline["phase"] as? String == "error", "Offline registration should report an error without losing local identity")
            let pending = try read(original)
            try check(pending.valid && pending.registrationPending == true, "A private random identity must be saved before registering")
            BackupFixture.failRegistration = false
            let reopened = client(original), connected = await reopened.setup()
            try check(connected["connected"] as? Bool == true && connected["identityId"] as? String == pending.id, "Reopening must register the same identity after a lost response")
            let before = BackupFixture.paths.count
            _ = await client(original).setup()
            try check(BackupFixture.paths.count == before, "An already registered identity must survive restart without a network sign-in")
            var linkedIdentity = try read(original)
            linkedIdentity.namespace = linkedIdentity.id; linkedIdentity.email = "person@example.test"
            try JSONEncoder().encode(linkedIdentity).write(to: original.appendingPathComponent("device.json"))
            let googleRestart = await client(original).setup()
            try check(googleRestart["googleEmail"] as? String == "person@example.test", "Google linking must survive app restart")
            try check(googleRestart["identityId"] as? String == linkedIdentity.namespace, "Restart must keep the same cloud history namespace")
            try check(BackupFixture.paths.count == before, "Restart must not ask Google to sign in again")
            let mode = (try FileManager.default.attributesOfItem(atPath: original.appendingPathComponent("device.json").path)[.posixPermissions] as? NSNumber)?.intValue
            try check(mode == 0o600, "The retained device credential must be private")
            let raw = "{\"format\":\"vigil-backup\",\"version\":1,\"exportedAt\":\"2026-11-04T00:00:00.000Z\",\"trackingStart\":\"2026-10-06\",\"entries\":[{\"id\":\"fixture\",\"easy\":486,\"external\":0}],\"policies\":[],\"overrides\":[]}"
            let saved = await reopened.save(json: raw, revision: 200, fingerprint: BackupFixture.fingerprint)
            try check(saved["phase"] as? String == "backedUp", "A cloud write must be downloaded and verified")
            let recoveryFile = try read(original).recoveryFile()
            let decoded = try BackupIdentity.readRecoveryFile(recoveryFile)
            try check(decoded.id == pending.id && decoded.token == pending.token, "The recovery file must preserve the same private identity")
            let emptyInstall = client(root.appendingPathComponent("reinstalled"))
            _ = await emptyInstall.setup()
            try check(!FileManager.default.fileExists(atPath: root.appendingPathComponent("reinstalled/device.json").path), "A fresh reinstall must allow recovery without making another identity")
            let review = try await emptyInstall.prepareRecovery(bytes: recoveryFile)
            try check(review["sameIdentity"] as? Bool == false, "Recovery must distinguish existing and imported identities")
            try check((review["copy"] as? [String: Any])?["backupJSON"] as? String == raw, "The correct cloud history must be available after local data loss")
            _ = try emptyInstall.applyRecoveryIdentity()
            let restored = client(root.appendingPathComponent("reinstalled")), restoredStatus = await restored.setup()
            try check(restoredStatus["identityId"] as? String == pending.id, "Imported identity must survive another restart")
            let copies = try await restored.list()
            try check((copies["backups"] as? [[String: Any]])?.count == 1, "Recovery must retain access to the previous history")
            let stale = await client(original).save(json: raw, revision: 1, fingerprint: BackupFixture.fingerprint)
            try check(stale["phase"] as? String == "error", "An older local revision must not be reported as backed up")
            BackupFixture.damageDownload = true
            let damaged = await restored.save(json: raw, revision: 201, fingerprint: BackupFixture.fingerprint)
            try check(damaged["phase"] as? String == "error", "A damaged remote copy must not be reported as verified")
            BackupFixture.damageDownload = false
            let malformedRoot = root.appendingPathComponent("malformed")
            try FileManager.default.createDirectory(at: malformedRoot, withIntermediateDirectories: true)
            let malformed = Data("not valid JSON".utf8)
            try malformed.write(to: malformedRoot.appendingPathComponent("device.json"))
            let malformedStatus = await client(malformedRoot).setup()
            try check(malformedStatus["phase"] as? String == "error", "A damaged credential must not silently create another identity")
            try check(try Data(contentsOf: malformedRoot.appendingPathComponent("device.json")) == malformed, "The original damaged credential must remain available")
            let foreignRoot = root.appendingPathComponent("foreign")
            try FileManager.default.createDirectory(at: foreignRoot, withIntermediateDirectories: true)
            let foreign = BackupIdentity(id: UUID().uuidString, token: String(repeating: "b", count: 64), origin: "https://private.example", registrationPending: false)
            try JSONEncoder().encode(foreign).write(to: foreignRoot.appendingPathComponent("device.json"))
            let requestsBeforeForeign = BackupFixture.paths.count
            do { _ = try await client(foreignRoot).googleStart(); throw DesktopError.message("A foreign credential must never be sent to the public Google service") }
            catch { try check(BackupFixture.paths.count == requestsBeforeForeign, "Google linking must not disclose another service's credential") }
            let pausedRoot = root.appendingPathComponent("paused"), paused = client(pausedRoot)
            _ = await paused.setup(); _ = try await paused.disconnect()
            let registrations = BackupFixture.paths.filter { $0 == "/api/backups/register" }.count
            let pausedAgain = await client(pausedRoot).setup()
            try check(pausedAgain["phase"] as? String == "paused" && BackupFixture.paths.filter { $0 == "/api/backups/register" }.count == registrations, "Turning backup off must survive restarts without creating another identity")
            try check(!BackupFixture.paths.contains("/api/login"), "The automatic and recovery flows must never request an owner password")
            print("Native cloud checks passed: password-free registration, offline identity retention, restart persistence, private credential permissions, verified upload, recovery after local identity loss, stale/damaged copy guards, and persistent opt-out.")
        } catch { fputs("Native cloud check failed: \(error.localizedDescription)\n", stderr); exit(1) }
    }
}

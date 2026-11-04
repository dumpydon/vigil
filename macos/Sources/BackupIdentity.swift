import Foundation

struct BackupIdentity: Codable, Equatable {
    let id: String
    let token: String
    let origin: String
    var registrationPending: Bool?
    var namespace: String? = nil
    var email: String? = nil

    static let publicOrigin = "https://vigil.dumpydon.workers.dev"
    static func create() -> BackupIdentity {
        var generator = SystemRandomNumberGenerator()
        let token = (0..<32).map { _ in String(format: "%02x", UInt8.random(in: .min ... .max, using: &generator)) }.joined()
        return BackupIdentity(id: UUID().uuidString, token: token, origin: publicOrigin, registrationPending: true)
    }
    var valid: Bool {
        UUID(uuidString: id) != nil && token.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil && CloudBackup.validOrigin(origin) != nil
    }
    func recoveryFile() throws -> Data {
        try JSONSerialization.data(withJSONObject: ["format": "apply-vigil-recovery", "version": 1, "id": id, "token": token, "origin": origin], options: [.sortedKeys, .prettyPrinted])
    }
    static func readRecoveryFile(_ bytes: Data) throws -> BackupIdentity {
        guard bytes.count <= 4096, let object = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              object["format"] as? String == "apply-vigil-recovery", object["version"] as? Int == 1,
              let id = object["id"] as? String, let token = object["token"] as? String, let origin = object["origin"] as? String,
              origin == publicOrigin else { throw DesktopError.message("Choose a valid Apply Vigil recovery file for the public backup service.") }
        let identity = BackupIdentity(id: id, token: token, origin: origin, registrationPending: false)
        guard identity.valid else { throw DesktopError.message("The recovery file contains an invalid backup identity.") }
        return identity
    }
}

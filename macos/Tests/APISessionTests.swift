import Foundation

// All responses are generated in-process. These checks never contact the owner
// workspace, access Keychain, or use either installed app's WebKit data store.
private final class FixtureProtocol: URLProtocol {
    private static let lock = NSLock()
    private static var status = 200
    private static var headers: [String: String] = [:]
    private static var requests: [URLRequest] = []

    static func reply(_ status: Int, headers: [String: String] = [:]) {
        lock.lock(); defer { lock.unlock() }
        self.status = status; self.headers = headers
    }
    static var captured: [URLRequest] {
        lock.lock(); defer { lock.unlock() }
        return requests
    }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lock.lock()
        Self.requests.append(request)
        let status = Self.status, headers = Self.headers
        Self.lock.unlock()
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("{}".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@main private struct SessionChecks {
    @MainActor private static func client() -> APISession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [FixtureProtocol.self]
        return APISession(configuration: configuration)
    }
    private static func check(_ condition: Bool, _ message: String) throws {
        if !condition { throw DesktopError.message(message) }
    }
    private static var lastCookie: String? { FixtureProtocol.captured.last?.value(forHTTPHeaderField: "Cookie") }
    private static var loginCookie: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss 'GMT'"
        return "__Host-vigil_session=\(String(repeating: "a", count: 64)); Path=/; Secure; HttpOnly; Expires=\(formatter.string(from: Date().addingTimeInterval(3600)))"
    }
    @MainActor static func main() async {
        do {
            try check(APIBoundary.websiteURL(localOnly: false).absoluteString == "https://vigil.dumpydon.workers.dev/dashboard/", "The connected app must open its web dashboard")
            try check(APIBoundary.websiteURL(localOnly: true) == APIBoundary.origin, "The local app must open the public homepage")
            let current = client()
            FixtureProtocol.reply(401)
            _ = try await current.request(path: "/api/session", method: "GET", body: nil)
            try check(lastCookie == nil, "A fresh native session must start without a stored credential")

            FixtureProtocol.reply(200, headers: ["Set-Cookie": loginCookie])
            _ = try await current.request(path: "/api/login", method: "POST", body: "{}")
            FixtureProtocol.reply(200)
            _ = try await current.request(path: "/api/snapshot", method: "GET", body: nil)
            try check(lastCookie == "__Host-vigil_session=\(String(repeating: "a", count: 64))", "An open connected app must retain its login in memory")

            let reopened = client()
            _ = try await reopened.request(path: "/api/session", method: "GET", body: nil)
            try check(lastCookie == nil, "A new app session must not restore the previous credential")

            FixtureProtocol.reply(401)
            _ = try await current.request(path: "/api/snapshot", method: "GET", body: nil)
            FixtureProtocol.reply(200)
            _ = try await current.request(path: "/api/session", method: "GET", body: nil)
            try check(lastCookie == nil, "A rejected credential must be cleared without a Keychain operation")

            FixtureProtocol.reply(200, headers: ["Set-Cookie": loginCookie])
            _ = try await current.request(path: "/api/login", method: "POST", body: "{}")
            FixtureProtocol.reply(200)
            _ = try await current.request(path: "/api/logout", method: "POST", body: "{}")
            _ = try await current.request(path: "/api/session", method: "GET", body: nil)
            try check(lastCookie == nil, "Signing out must clear the in-memory credential")

            let count = FixtureProtocol.captured.count
            var blocked = false
            do {
                _ = try await current.request(path: "https://example.com/api/snapshot", method: "GET", body: nil)
            } catch { blocked = true }
            try check(blocked && FixtureProtocol.captured.count == count, "An invalid destination must be rejected before transport")
            print("Native session checks passed: process-only login, fresh-launch isolation, unauthorized/logout cleanup, and API boundary.")
        } catch {
            fputs("Native session check failed: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
    }
}

import Foundation

enum DesktopError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case let .message(value) = self { return value }; return nil }
}

// The web view can request only existing workspace APIs, never arbitrary URLs.
enum APIBoundary {
    static let origin = URL(string: "https://vigil.dumpydon.workers.dev")!
    static func websiteURL(localOnly: Bool) -> URL {
        localOnly ? origin : origin.appendingPathComponent("dashboard", isDirectory: true)
    }
    static func allows(_ path: String, method: String) -> Bool {
        guard path.hasPrefix("/api/"), !path.contains(".."), !path.contains("#"), !path.contains("\\") else { return false }
        let parts = path.components(separatedBy: "?")
        guard parts.count <= 2 else { return false }
        let route = parts[0]
        if parts.count == 2 {
            guard route == "/api/snapshot", parts[1].range(of: "^pending=[a-fA-F0-9,-]{1,5000}$", options: .regularExpression) != nil else { return false }
        }
        switch method {
        case "GET": return ["/api/session", "/api/snapshot", "/api/dashboard", "/api/export", "/api/entries", "/api/goals"].contains(route)
        case "POST": return ["/api/login", "/api/logout", "/api/entries", "/api/import", "/api/import/preview"].contains(route)
        case "PUT": return route.range(of: "^/api/(days|goals)/[0-9]{4}-[0-9]{2}-[0-9]{2}$", options: .regularExpression) != nil
        case "PATCH", "DELETE": return route.range(of: "^/api/entries/[a-fA-F0-9-]{36}$", options: .regularExpression) != nil
        default: return false
        }
    }
}

private struct OwnerSession {
    let token: String
    let expiresAt: Date
}

@MainActor final class APISession: NSObject, URLSessionTaskDelegate {
    // Deliberately process-only: never access Keychain or persist credentials.
    // Both native windows share this instance while the connected app is open.
    private var owner: OwnerSession?
    private let configuration: URLSessionConfiguration
    private lazy var session = URLSession(configuration: configuration, delegate: self, delegateQueue: .main)

    init(configuration: URLSessionConfiguration = .ephemeral) {
        self.configuration = configuration
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.urlCache = nil
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 20
        super.init()
    }
    func request(path: String, method: String, body: String?) async throws -> [String: Any] {
        guard APIBoundary.allows(path, method: method), let url = URL(string: path, relativeTo: APIBoundary.origin)?.absoluteURL,
              url.scheme == "https", url.host == APIBoundary.origin.host else { throw DesktopError.message("This API request is not allowed.") }
        if let body, body.utf8.count > 12_000_000 { throw DesktopError.message("This request is too large.") }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(APIBoundary.origin.absoluteString, forHTTPHeaderField: "Origin")
        request.setValue("ApplyVigil-macOS/1.0", forHTTPHeaderField: "User-Agent")
        if let owner, owner.expiresAt > Date() { request.setValue("__Host-vigil_session=\(owner.token)", forHTTPHeaderField: "Cookie") }
        request.httpBody = body?.data(using: .utf8)
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse, data.count <= 32_000_000, let text = String(data: data, encoding: .utf8) else {
            throw DesktopError.message("The workspace returned an invalid response.")
        }
        if path == "/api/login", response.statusCode == 200 {
            let headers = response.allHeaderFields.reduce(into: [String: String]()) { result, field in
                if let key = field.key as? String { result[key] = String(describing: field.value) }
            }
            guard let cookie = HTTPCookie.cookies(withResponseHeaderFields: headers, for: APIBoundary.origin).first(where: { $0.name == "__Host-vigil_session" }),
                  cookie.value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
                  let expires = cookie.expiresDate else { throw DesktopError.message("The workspace did not return a valid owner session.") }
            owner = OwnerSession(token: cookie.value, expiresAt: expires)
        } else if (path == "/api/logout" && response.statusCode == 200) || response.statusCode == 401 {
            owner = nil
        }
        return ["status": response.statusCode, "body": text]
    }
    // Do not carry an owner session through an HTTP redirect to any destination.
    nonisolated func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

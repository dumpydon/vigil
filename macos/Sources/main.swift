import AppKit
import WebKit
import UserNotifications
import ServiceManagement
import UniformTypeIdentifiers

final class CompactPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

@MainActor final class GlassHostView: NSVisualEffectView {
    init(webView: WKWebView) {
        super.init(frame: webView.frame)
        material = .underWindowBackground
        blendingMode = .behindWindow
        state = .active
        webView.frame = bounds
        webView.autoresizingMask = [.width, .height]
        addSubview(webView)
    }
    required init?(coder: NSCoder) { fatalError("GlassHostView is created in code") }
    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        window?.isOpaque = false
        window?.backgroundColor = .clear
    }
}

private enum AlertSound: String, CaseIterable {
    case soft, glass, bell, ripple, marimba, stardust, none
}

@MainActor final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandlerWithReply, WKNavigationDelegate, WKUIDelegate, NSPopoverDelegate, NSWindowDelegate, UNUserNotificationCenterDelegate {
    private var statusItem: NSStatusItem!
    private let popover = NSPopover()
    private var webView: WKWebView!
    private var compactPanel: CompactPanel?
    private var compactWebView: WKWebView?
    private let processPool = WKProcessPool()
    private lazy var websiteDataStore: WKWebsiteDataStore = smokeTest ? .nonPersistent() : .default()
    private lazy var api = APISession()
    private let preferences = UserDefaults.standard
    private var refreshTimer: Timer?
    private var retainedSound: NSSound?
    private var pending = 0
    private var webReady = false
    private var lastStatus: [String: Any] = [:]
    private var fileDialogOpen = false
    private var smokeTest = ProcessInfo.processInfo.arguments.contains("--smoke-test")
    private var smokeFixture: [String: Any]?
    private var smokeOnline = true
    private var smokeApplied = Set<String>()
    private var pinned: Bool {
        get { preferences.bool(forKey: "pinned") }
        set { preferences.set(newValue, forKey: "pinned"); popover.behavior = newValue ? .applicationDefined : .transient; dispatch("pinned", newValue) }
    }
    private var resourceRoot: URL { Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true) }
    private var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0.0" }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        NSApp.appearance = NSAppearance(named: .darkAqua)
        preferences.register(defaults: ["sound": "soft", "menuDisplay": "count", "notifications": false, "pinned": false])
        installMainMenu()
        webView = makeWebView(compact: false)
        let controller = NSViewController()
        controller.view = GlassHostView(webView: webView)
        popover.contentViewController = controller
        popover.contentSize = NSSize(width: 425, height: panelHeight())
        popover.behavior = pinned ? .applicationDefined : .transient
        popover.animates = true
        popover.delegate = self
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.autosaveName = "ApplyVigilMenuBar"
        if let button = statusItem.button {
            button.target = self
            button.action = #selector(statusClicked(_:))
            button.sendAction(on: [.leftMouseUp, .rightMouseUp])
            button.image = menuIcon()
            button.imagePosition = .imageLeading
            button.font = .monospacedDigitSystemFont(ofSize: 11, weight: .semibold)
            button.title = " Apply"
            button.setAccessibilityLabel("Apply Vigil")
            button.toolTip = "Apply Vigil · Your daily application tracker"
        }
        UNUserNotificationCenter.current().delegate = self
        webView.loadFileURL(resourceRoot.appendingPathComponent("index.html"), allowingReadAccessTo: resourceRoot)
        refreshTimer = Timer.scheduledTimer(timeInterval: 60, target: self, selector: #selector(didWake), userInfo: nil, repeats: true)
        refreshTimer?.tolerance = 5
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(didWake), name: NSWorkspace.didWakeNotification, object: nil)
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(didWake), name: NSWorkspace.sessionDidBecomeActiveNotification, object: nil)
        if smokeTest { startSmokeTest() }
    }
    private func installMainMenu() {
        let menu = NSMenu()
        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Quit Apply Vigil", action: #selector(quit), keyEquivalent: "q").target = self
        appItem.submenu = appMenu; menu.addItem(appItem)
        let edit = NSMenuItem(); let editMenu = NSMenu(title: "Edit")
        for (title, action, key) in [("Undo", "undo:", "z"), ("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            editMenu.addItem(withTitle: title, action: Selector(action), keyEquivalent: key)
        }
        edit.submenu = editMenu; menu.addItem(edit)
        NSApp.mainMenu = menu
    }
    private func menuIcon() -> NSImage {
        let image = NSImage(size: NSSize(width: 19, height: 19), flipped: false) { bounds in
            NSColor.labelColor.setStroke()
            let ring = NSBezierPath(ovalIn: bounds.insetBy(dx: 2.5, dy: 2.5)); ring.lineWidth = 1.5; ring.stroke()
            let check = NSBezierPath(); check.move(to: NSPoint(x: 5.8, y: 9.2)); check.line(to: NSPoint(x: 8.2, y: 6.8)); check.line(to: NSPoint(x: 13.5, y: 12.2)); check.lineWidth = 1.7; check.lineCapStyle = .round; check.lineJoinStyle = .round; check.stroke()
            return true
        }
        image.isTemplate = true
        return image
    }
    private func panelHeight() -> CGFloat { min(600, max(380, (NSScreen.main?.visibleFrame.height ?? 800) - 55)) }
    private func makeWebView(compact: Bool) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = websiteDataStore
        configuration.processPool = processPool
        configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "applyVigil")
        configuration.userContentController.addUserScript(WKUserScript(source: "window.__APPLY_VIGIL_NATIVE__ = {version: '\(version)', testing: \(smokeTest), surface: '\(compact ? "compact" : "dashboard")'};", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: compact ? 340 : 425, height: compact ? 430 : 600), configuration: configuration)
        view.pageZoom = 0.85; view.navigationDelegate = self; view.uiDelegate = self; view.underPageBackgroundColor = .clear; view.setValue(false, forKey: "drawsBackground")
        return view
    }
    @objc private func openCompact() {
        if let compactPanel { compactPanel.makeKeyAndOrderFront(nil); return }
        let panel = CompactPanel(contentRect: NSRect(x: 0, y: 0, width: 340, height: 430), styleMask: [.titled, .closable, .resizable, .utilityWindow], backing: .buffered, defer: false)
        panel.title = "Apply Vigil · Compact"
        panel.level = .floating; panel.hidesOnDeactivate = false; panel.isReleasedWhenClosed = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.minSize = NSSize(width: 320, height: 400); panel.maxSize = NSSize(width: 480, height: 700)
        panel.delegate = self
        let view = makeWebView(compact: true)
        compactPanel = panel; compactWebView = view; panel.contentView = GlassHostView(webView: view)
        if !panel.setFrameUsingName("ApplyVigilCompact") { panel.center() }
        panel.setFrameAutosaveName("ApplyVigilCompact")
        view.loadFileURL(resourceRoot.appendingPathComponent("index.html"), allowingReadAccessTo: resourceRoot)
        if !smokeTest { panel.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true) }
        dispatch("compact", true)
    }
    func windowWillClose(_ notification: Notification) {
        guard let panel = notification.object as? NSWindow, panel === compactPanel else { return }
        compactWebView?.stopLoading()
        compactWebView?.configuration.userContentController.removeScriptMessageHandler(forName: "applyVigil", contentWorld: .page)
        compactPanel?.contentView = nil; compactWebView = nil; compactPanel = nil
        dispatch("compact", false); refresh()
    }
    @objc private func statusClicked(_ sender: Any?) {
        if NSApp.currentEvent?.type == .rightMouseUp { showContextMenu(); return }
        if popover.isShown { popover.performClose(nil) } else { showPanel() }
    }
    private func showPanel(page: String? = nil) {
        guard let button = statusItem.button else { return }
        if !popover.isShown {
            popover.contentSize = NSSize(width: 425, height: panelHeight())
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        }
        NSApp.activate(ignoringOtherApps: true)
        popover.contentViewController?.view.window?.makeKey()
        webView.window?.makeFirstResponder(webView)
        refresh()
        if let page { dispatch("navigate", page) }
    }
    func popoverShouldClose(_ popover: NSPopover) -> Bool { !fileDialogOpen }
    @objc private func openPanel() { showPanel() }
    @objc private func openSettings() { showPanel(page: "settings") }
    @objc private func openWebsite() { NSWorkspace.shared.open(APIBoundary.origin) }
    @objc private func togglePin() { pinned.toggle() }
    @objc private func didWake() { refresh() }
    private func refresh() { if webReady { dispatch("refresh", NSNull()) } }
    private func showContextMenu() {
        let menu = NSMenu()
        let items: [(String, Selector)] = [("Open Apply Vigil", #selector(openPanel)), ("Pop out compact view", #selector(openCompact)), (pinned ? "Unpin panel" : "Keep panel open", #selector(togglePin)), ("Settings…", #selector(openSettings)), ("Open web dashboard", #selector(openWebsite))]
        for (title, action) in items { menu.addItem(withTitle: title, action: action, keyEquivalent: "").target = self }
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit Apply Vigil", action: #selector(quit), keyEquivalent: "q").target = self
        statusItem.menu = menu; statusItem.button?.performClick(nil); statusItem.menu = nil
    }
    @objc private func quit() {
        if pending > 0 {
            let alert = NSAlert(); alert.messageText = "\(pending) changes are waiting to sync"; alert.informativeText = "They are retained on this Mac and will sync when you reopen Apply Vigil."
            alert.addButton(withTitle: "Keep syncing"); alert.addButton(withTitle: "Quit with changes retained")
            if alert.runModal() != .alertSecondButtonReturn { return }
        }
        NSApp.terminate(nil)
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { showPanel(); return false }
    func applicationWillTerminate(_ notification: Notification) { refreshTimer?.invalidate() }

    private func dispatch(_ event: String, _ detail: Any) {
        guard webReady, let encoded = try? JSONSerialization.data(withJSONObject: ["name": "apply-vigil:\(event)", "detail": detail]), let json = String(data: encoded, encoding: .utf8) else { return }
        let script = "(()=>{const e=\(json);window.dispatchEvent(new CustomEvent(e.name,{detail:e.detail}));})()"
        webView.evaluateJavaScript(script, completionHandler: nil)
        if event == "refresh" || event == "pinned" { compactWebView?.evaluateJavaScript(script, completionHandler: nil) }
    }
    nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            if webView === compactWebView {
                _ = try? await webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('apply-vigil:refresh'))")
                return
            }
            webReady = true; refresh(); dispatch("pinned", pinned)
            if !smokeTest && (!preferences.bool(forKey: "hasLaunched") || ProcessInfo.processInfo.arguments.contains("--show")) {
                preferences.set(true, forKey: "hasLaunched"); showPanel()
            }
        }
    }
    nonisolated func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { Task { @MainActor in showLoadError() } }
    nonisolated func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { Task { @MainActor in if webView === self.webView { webReady = false }; webView.reload() } }
    private func showLoadError() {
        let alert = NSAlert(); alert.messageText = "Apply Vigil could not load its interface"; alert.informativeText = "Reopen the app. Your retained entries remain on this Mac."; alert.runModal()
    }
    private func isBundled(_ url: URL) -> Bool {
        url.isFileURL && url.standardizedFileURL.path.hasPrefix(resourceRoot.standardizedFileURL.path + "/")
    }
    nonisolated func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
      Task { @MainActor in
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if isBundled(url) { decisionHandler(.allow); return }
        // Only user-clicked links to this workspace open externally. All remote
        // navigation is blocked in the privileged view, including redirects.
        if navigationAction.navigationType == .linkActivated, url.scheme == "https", url.host == APIBoundary.origin.host { NSWorkspace.shared.open(url) }
        decisionHandler(.cancel)
      }
    }
    nonisolated func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
      Task { @MainActor in
        guard frame.isMainFrame else { completionHandler(nil); return }
        fileDialogOpen = true
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.json]; panel.allowsMultipleSelection = false; panel.canChooseDirectories = false
        panel.begin { [weak self] response in self?.fileDialogOpen = false; completionHandler(response == .OK ? panel.urls : nil) }
      }
    }

    nonisolated func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
      Task { @MainActor in
        guard message.frameInfo.isMainFrame, let source = message.frameInfo.request.url, isBundled(source), let data = message.body as? [String: Any], let command = data["command"] as? String else {
            replyHandler(nil, "This desktop message is not allowed."); return
        }
        do { replyHandler(try await handle(command, data: data), nil) }
        catch { replyHandler(nil, error.localizedDescription) }
      }
    }
    private func handle(_ command: String, data: [String: Any]) async throws -> Any {
        switch command {
        case "request":
            guard let path = data["path"] as? String, let method = data["method"] as? String else { throw DesktopError.message("Incomplete API request.") }
            if smokeTest { return try mockRequest(path: path, method: method, body: data["body"] as? String) }
            return try await api.request(path: path, method: method, body: data["body"] as? String)
        case "status": updateStatus(data); return true
        case "settings": return await settings()
        case "setPreference": return try await setPreference(data)
        case "togglePin": pinned.toggle(); return await settings()
        case "openCompact": openCompact(); return true
        case "openDashboard": showPanel(page: "today"); return true
        case "openWebsite": openWebsite(); return true
        case "previewSound": playSound(celebration: true); return true
        case "alerts": await deliverAlerts(data); return true
        case "saveFile": return try await saveFile(data)
        case "quit": quit(); return true
        default: throw DesktopError.message("Unknown desktop action.")
        }
    }
    private func updateStatus(_ data: [String: Any]) {
        lastStatus = data; pending = data["pending"] as? Int ?? 0
        guard let button = statusItem.button else { return }
        let day = data["day"] as? String ?? "", status = data["status"] as? String ?? "loading"
        let today = ISO8601DateFormatter().string(from: Date()).prefix(10)
        let total = data["total"] as? Int, goal = data["goal"] as? Int
        let mode = preferences.string(forKey: "menuDisplay") ?? "count"
        let stale = day != today || status != "saved"
        if let total, let goal, goal > 0, day == today {
            switch mode {
            case "icon": button.title = ""
            case "percent": button.title = " \(Int((Double(total) / Double(goal) * 100).rounded()))%\(stale ? " ·" : "")"
            default: button.title = " \(total)/\(goal)\(stale ? " ·" : "")"
            }
            button.toolTip = "Apply Vigil · \(total) of \(goal) today (UTC) · \(status)\(pending > 0 ? " · \(pending) pending" : "")"
        } else { button.title = mode == "icon" ? "" : " Apply"; button.toolTip = "Apply Vigil · \(status == "auth" ? "Sign in to sync" : "Loading workspace")" }
        button.setAccessibilityLabel(button.toolTip)
    }
    private func settings() async -> [String: Any] {
        let notificationSettings = await UNUserNotificationCenter.current().notificationSettings()
        let notificationStatus: String
        switch notificationSettings.authorizationStatus {
        case .authorized, .provisional: notificationStatus = "authorized"
        case .denied: notificationStatus = "denied"
        default: notificationStatus = "notDetermined"
        }
        let login = SMAppService.mainApp.status
        return ["launchAtLogin": login == .enabled, "loginStatus": login == .requiresApproval ? "requiresApproval" : login == .enabled ? "enabled" : "notRegistered", "notifications": preferences.bool(forKey: "notifications") && notificationStatus == "authorized", "notificationStatus": notificationStatus, "sound": (AlertSound(rawValue: preferences.string(forKey: "sound") ?? "soft") ?? .soft).rawValue, "menuDisplay": preferences.string(forKey: "menuDisplay") ?? "count", "pinned": pinned, "version": version]
    }
    private func setPreference(_ data: [String: Any]) async throws -> [String: Any] {
        guard let key = data["key"] as? String else { throw DesktopError.message("Missing preference.") }
        switch key {
        case "pinned": guard let value = data["value"] as? Bool else { throw DesktopError.message("Invalid preference.") }; pinned = value
        case "launchAtLogin":
            guard !smokeTest, let value = data["value"] as? Bool else { throw DesktopError.message("Login items are unavailable in the test app.") }
            if value { try SMAppService.mainApp.register() } else { try await SMAppService.mainApp.unregister() }
        case "notifications":
            guard let value = data["value"] as? Bool else { throw DesktopError.message("Invalid preference.") }
            if value { let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]); preferences.set(granted, forKey: key) }
            else { preferences.set(false, forKey: key) }
        case "sound", "menuDisplay":
            guard let value = data["value"] as? String, (key == "sound" ? AlertSound.allCases.map(\.rawValue) : ["count", "percent", "icon"]).contains(value) else { throw DesktopError.message("Invalid preference.") }
            preferences.set(value, forKey: key)
        default: throw DesktopError.message("Unknown preference.")
        }
        updateStatus(lastStatus)
        return await settings()
    }
    private func makeSound(_ choice: AlertSound, celebration: Bool) -> NSSound? {
        if choice == .none { return nil }
        if choice == .glass { return NSSound(named: "Glass") }
        let file = choice == .soft ? (celebration ? "complete" : "gentle") : choice.rawValue
        guard let url = Bundle.main.url(forResource: file, withExtension: "wav") else { return nil }
        return NSSound(contentsOf: url, byReference: true)
    }
    private func playSound(celebration: Bool) {
        guard !smokeTest else { return }
        let choice = AlertSound(rawValue: preferences.string(forKey: "sound") ?? "soft") ?? .soft
        retainedSound?.stop()
        retainedSound = makeSound(choice, celebration: celebration)
        retainedSound?.volume = 0.35; retainedSound?.play()
    }
    private func deliverAlerts(_ data: [String: Any]) async {
        guard !smokeTest, let items = data["items"] as? [[String: Any]] else { return }
        let now = Date(), formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var ledger = preferences.dictionary(forKey: "deliveredAlerts") as? [String: Double] ?? [:]
        ledger = ledger.filter { now.timeIntervalSince1970 - $0.value < 15 * 86400 }
        var fresh: [[String: Any]] = []
        for item in items {
            guard let id = item["id"] as? String, ledger[id] == nil else { continue }
            ledger[id] = now.timeIntervalSince1970
            if let stamp = item["createdAt"] as? String, let created = formatter.date(from: stamp), now.timeIntervalSince(created) >= -5, now.timeIntervalSince(created) < 120, item["readAt"] is NSNull { fresh.append(item) }
        }
        preferences.set(ledger, forKey: "deliveredAlerts")
        guard data["paused"] as? Bool != true, let item = fresh.first, let title = item["title"] as? String, let detail = item["detail"] as? String else { return }
        // One sound per reconciliation; the shared policy caps actual new cards.
        playSound(celebration: ["goal", "streak", "record", "milestone"].contains(item["kind"] as? String ?? ""))
        if preferences.bool(forKey: "notifications") {
            let content = UNMutableNotificationContent(); content.title = title; content.body = detail; content.threadIdentifier = "apply-vigil-progress"
            // Sound is played once above, including when the popover is open.
            let request = UNNotificationRequest(identifier: "apply-vigil-\(item["id"] as? String ?? UUID().uuidString)", content: content, trigger: nil)
            try? await UNUserNotificationCenter.current().add(request)
        }
    }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) { completionHandler([.banner, .list]) }
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) { Task { @MainActor in showPanel(page: "alerts"); completionHandler() } }
    private func saveFile(_ data: [String: Any]) async throws -> [String: Any] {
        guard let text = data["text"] as? String, text.utf8.count <= 32_000_000, let name = data["name"] as? String,
              name.range(of: "^vigil-[0-9]{4}-[0-9]{2}-[0-9]{2}\\.(json|csv)$", options: .regularExpression) != nil else { throw DesktopError.message("Invalid backup file.") }
        fileDialogOpen = true
        defer { fileDialogOpen = false }
        let panel = NSSavePanel(); panel.nameFieldStringValue = name; panel.canCreateDirectories = true
        panel.allowedContentTypes = name.hasSuffix(".json") ? [.json] : [.commaSeparatedText]
        let response = await withCheckedContinuation { continuation in panel.begin { continuation.resume(returning: $0) } }
        guard response == .OK, let url = panel.url else { return ["saved": false] }
        try text.write(to: url, atomically: true, encoding: .utf8)
        return ["saved": true]
    }

    // Native smoke checks are implemented separately and never contact production.
    private func startSmokeTest() { runSmokeChecks() }
    private func mockRequest(path: String, method: String, body: String?) throws -> [String: Any] { try smokeRequest(path: path, method: method, body: body) }

    private func smokeRequest(path: String, method: String, body: String?) throws -> [String: Any] {
        guard APIBoundary.allows(path, method: method) else { throw DesktopError.message("Blocked test request") }
        guard smokeOnline else { throw DesktopError.message("Test connection is offline") }
        if smokeFixture == nil {
            let now = ISO8601DateFormatter().string(from: Date()), day = String(now.prefix(10))
            smokeFixture = ["entries": [], "policies": [["date": "1970-01-01", "value": 75]], "overrides": [], "trackingStart": day, "revision": 0, "goalRevision": 0, "serverNow": now]
        }
        var result: [String: Any]
        if method == "GET" {
            result = smokeFixture!
            result["acknowledged"] = Array(smokeApplied)
        } else if let body, let bytes = body.data(using: .utf8), let operation = try JSONSerialization.jsonObject(with: bytes) as? [String: Any], let id = operation["id"] as? String, let entry = operation["entry"] as? [String: Any], operation["type"] as? String == "create" {
            var entries = smokeFixture!["entries"] as? [[String: Any]] ?? []
            if !smokeApplied.contains(id) {
                var saved = entry; saved["createdAt"] = entry["loggedAt"]; saved["updatedAt"] = entry["loggedAt"]; saved["version"] = 1; saved["deleted"] = false
                entries.append(saved); smokeFixture!["entries"] = entries; smokeFixture!["revision"] = (smokeFixture!["revision"] as? Int ?? 0) + 1; smokeApplied.insert(id)
            }
            result = ["revision": smokeFixture!["revision"]!, "goalRevision": 0, "entries": entries]
        } else { throw DesktopError.message("Unsupported isolated test operation") }
        return ["status": 200, "body": String(data: try JSONSerialization.data(withJSONObject: result), encoding: .utf8)!]
    }
    private func evaluate(_ script: String, in target: WKWebView? = nil) async throws -> Any? {
        try await (target ?? webView).callAsyncJavaScript("return await (\(script));", arguments: [:], in: nil, contentWorld: .page)
    }
    private func waitForTestState(_ expression: String) async throws {
        for _ in 0..<100 {
            if (try? await evaluate(expression)) as? Bool == true { return }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let detail = (try? await evaluate("JSON.stringify(window.__applyVigilTest?.state())")) as? String ?? "Interface unavailable"
        throw DesktopError.message("Native check timed out: \(expression) · \(detail)")
    }
    private func runSmokeChecks() {
        Task { @MainActor in
            do {
                try await waitForTestState("window.__applyVigilTest?.state().status === 'saved'")
                for choice in AlertSound.allCases where choice != .none {
                    for celebration in [false, true] {
                        guard let sound = makeSound(choice, celebration: celebration), sound.duration > 0 else { throw DesktopError.message("The \(choice.rawValue) sound asset could not be decoded") }
                    }
                }
                guard NSApp.activationPolicy() == .accessory else { throw DesktopError.message("Dock activation policy failed") }
                guard !APIBoundary.allows("https://example.com/api/snapshot", method: "GET"), !APIBoundary.allows("/api/../secret", method: "GET"), !APIBoundary.allows("/api/snapshot?redirect=bad", method: "GET") else { throw DesktopError.message("API boundary check failed") }
                _ = try await evaluate("window.__applyVigilTest.draft({kind:'native-test',value:'retained'})")
                smokeOnline = false
                _ = try await evaluate("window.__applyVigilTest.log(3,2)")
                try await waitForTestState("window.__applyVigilTest.state().queue.length === 1 && window.__applyVigilTest.state().status === 'retry'")
                webReady = false; webView.reload()
                try await waitForTestState("window.__applyVigilTest?.state().initialized && window.__applyVigilTest.state().queue.length === 1 && window.__applyVigilTest.state().draft?.value === 'retained'")
                smokeOnline = true; refresh()
                try await waitForTestState("window.__applyVigilTest.state().status === 'saved' && window.__applyVigilTest.state().queue.length === 0")
                let count = (try await evaluate("window.__applyVigilTest.state().snapshot.entries.reduce((n,e)=>n+e.easy+e.external,0)")) as? Int
                guard count == 5, smokeApplied.count == 1, statusItem.button?.title.contains("5/75") == true else { throw DesktopError.message("Native sync/count verification failed") }
                _ = try await evaluate("window.__applyVigilTest.sync()")
                guard smokeApplied.count == 1 else { throw DesktopError.message("Operation was duplicated") }
                pinned = true; guard popover.behavior == .applicationDefined else { throw DesktopError.message("Pin behavior failed") }
                pinned = false; guard popover.behavior == .transient else { throw DesktopError.message("Unpin behavior failed") }
                // A real second WKWebView must share the durable queue with the
                // menu panel, including after the floating window is closed.
                smokeOnline = false; openCompact()
                guard let compact = compactWebView else { throw DesktopError.message("Compact window was not created") }
                var compactReady = false
                for _ in 0..<100 {
                    if (try? await evaluate("window.__applyVigilTest?.state().initialized === true", in: compact)) as? Bool == true { compactReady = true; break }
                    try await Task.sleep(nanoseconds: 100_000_000)
                }
                guard compactReady, (try await evaluate("window.__applyVigilTest.state().snapshot?.entries.reduce((n,e)=>n+e.easy+e.external,0)", in: compact)) as? Int == 5 else { throw DesktopError.message("Compact window did not share the cached workspace") }
                _ = try await evaluate("window.__applyVigilTest.log(1,1)", in: compact)
                compactPanel?.close()
                smokeOnline = true; refresh()
                try await waitForTestState("window.__applyVigilTest.state().status === 'saved' && window.__applyVigilTest.state().queue.length === 0 && window.__applyVigilTest.state().snapshot.entries.reduce((n,e)=>n+e.easy+e.external,0) === 7")
                guard smokeApplied.count == 2 else { throw DesktopError.message("Shared compact operation was not applied exactly once") }
                let report: [String: Any] = ["passed": true, "checks": ["bundled WebKit UI in native glass host", "all six alert sounds decode", "file-origin IndexedDB and crypto", "no Dock activation", "restricted API bridge", "offline durable queue", "draft and queue survive reload", "reconnect sync", "idempotent retry", "menu bar progress", "pin and dismissal behavior", "compact window shares cache and queue", "compact pending write survives closing its window"], "appliedOperations": smokeApplied.count, "total": 7, "panelWidth": 425, "panelHeight": panelHeight(), "interfaceScale": webView.pageZoom]
                try writeSmokeReport(report)
                print("Apply Vigil native smoke tests passed.")
                NSApp.terminate(nil)
            } catch {
                try? writeSmokeReport(["passed": false, "error": error.localizedDescription])
                fputs("Apply Vigil native smoke test failed: \(error.localizedDescription)\n", stderr)
                exit(1)
            }
        }
    }
    private func writeSmokeReport(_ report: [String: Any]) throws {
        if let index = ProcessInfo.processInfo.arguments.firstIndex(of: "--report"), ProcessInfo.processInfo.arguments.count > index + 1 {
            try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys]).write(to: URL(fileURLWithPath: ProcessInfo.processInfo.arguments[index + 1]), options: .atomic)
        }
    }
}

@main struct ApplyVigilMain {
    @MainActor static func main() {
        let application = NSApplication.shared
        let delegate = AppDelegate()
        application.delegate = delegate
        withExtendedLifetime(delegate) { application.run() }
    }
}

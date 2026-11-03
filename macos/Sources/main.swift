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
    private lazy var cloudBackup = CloudBackup(directory: smokeTest ? FileManager.default.temporaryDirectory.appendingPathComponent("ApplyVigil-cloud-tests-\(UUID().uuidString)") : FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("ApplyVigil/CloudBackup"))
    private lazy var historyVault = HistoryVault(root: smokeTest ? FileManager.default.temporaryDirectory.appendingPathComponent("ApplyVigil-history-tests-\(UUID().uuidString)") : nil, legacyDetection: !smokeTest)
    private let preferences = UserDefaults.standard
    private var refreshTimer: Timer?
    private var retainedSound: NSSound?
    private var pending = 0
    private var webReady = false
    private var lastStatus: [String: Any] = [:]
    private var smokeTimePreferences: [String: String]?
    private var fileDialogOpen = false
    private var smokeTest = ProcessInfo.processInfo.arguments.contains("--smoke-test")
    private var smokeFixture: [String: Any]?
    private var smokeOnline = true
    private var smokeApplied = Set<String>()
    private var apiRequests = 0
    private var localOnly: Bool { Bundle.main.object(forInfoDictionaryKey: "ApplyVigilLocalOnly") as? Bool ?? false }
    private var pinned: Bool {
        get { preferences.bool(forKey: "pinned") }
        set { preferences.set(newValue, forKey: "pinned"); popover.behavior = newValue ? .applicationDefined : .transient; dispatch("pinned", newValue) }
    }
    private var resourceRoot: URL { Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true) }
    private var version: String { Bundle.main.object(forInfoDictionaryKey: "ApplyVigilDisplayVersion") as? String ?? Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0.0" }

    func applicationDidFinishLaunching(_ notification: Notification) {
        if !smokeTest, let identifier = Bundle.main.bundleIdentifier,
           let existing = NSRunningApplication.runningApplications(withBundleIdentifier: identifier).filter({ $0.processIdentifier < NSRunningApplication.current.processIdentifier }).first {
            // One workspace, one running host. Launching an older copy from a
            // build folder must not create a second, apparently separate app.
            if let url = existing.bundleURL { NSWorkspace.shared.open(url) }
            existing.activate(options: [.activateAllWindows])
            NSApp.terminate(nil); return
        }
        NSApp.setActivationPolicy(.accessory)
        NSApp.appearance = NSAppearance(named: .darkAqua)
        preferences.register(defaults: ["sound": "soft", "menuDisplay": "count", "notifications": false, "pinned": false])
        if !smokeTest {
            if preferences.object(forKey: "launchAtLoginDesired") == nil {
                preferences.set(SMAppService.mainApp.status == .enabled || SMAppService.mainApp.status == .requiresApproval, forKey: "launchAtLoginDesired")
            }
            if preferences.bool(forKey: "launchAtLoginDesired"), SMAppService.mainApp.status != .enabled, SMAppService.mainApp.status != .requiresApproval {
                do { try SMAppService.mainApp.register(); preferences.removeObject(forKey: "launchAtLoginError") }
                catch { preferences.set(error.localizedDescription, forKey: "launchAtLoginError") }
            }
            preferences.set(loginStatusName, forKey: "launchAtLoginRegistrationStatus")
        }
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
        configuration.userContentController.addUserScript(WKUserScript(source: "window.__APPLY_VIGIL_NATIVE__ = {version: '\(version)', testing: \(smokeTest), localOnly: \(localOnly), surface: '\(compact ? "compact" : "dashboard")'};", injectionTime: .atDocumentStart, forMainFrameOnly: true))
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
    @objc private func openWebsite() { NSWorkspace.shared.open(APIBoundary.websiteURL(localOnly: localOnly)) }
    @objc private func togglePin() { pinned.toggle() }
    @objc private func didWake() { refresh() }
    private func refresh() { if webReady { dispatch("refresh", NSNull()) } }
    private func showContextMenu() {
        let menu = NSMenu()
        let items: [(String, Selector)] = [("Open Apply Vigil", #selector(openPanel)), ("Pop out compact view", #selector(openCompact)), (pinned ? "Unpin panel" : "Keep panel open", #selector(togglePin)), ("Settings…", #selector(openSettings)), (localOnly ? "Visit Apply Vigil" : "Open web dashboard", #selector(openWebsite))]
        for (title, action) in items { menu.addItem(withTitle: title, action: action, keyEquivalent: "").target = self }
        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit Apply Vigil", action: #selector(quit), keyEquivalent: "q").target = self
        statusItem.menu = menu; statusItem.button?.performClick(nil); statusItem.menu = nil
    }
    @objc private func quit() {
        if pending > 0 {
            let alert = NSAlert(); alert.messageText = "\(pending) changes are waiting to \(localOnly ? "save" : "sync")"; alert.informativeText = "They are retained on this Mac and will \(localOnly ? "save" : "sync") when you reopen Apply Vigil."
            alert.addButton(withTitle: localOnly ? "Keep saving" : "Keep syncing"); alert.addButton(withTitle: "Quit with changes retained")
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
        if event == "refresh" || event == "pinned" || event == "timePreferences" { compactWebView?.evaluateJavaScript(script, completionHandler: nil) }
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
            guard !localOnly else { throw DesktopError.message("This local app does not connect to an owner account.") }
            apiRequests += 1
            guard let path = data["path"] as? String, let method = data["method"] as? String else { throw DesktopError.message("Incomplete API request.") }
            if smokeTest { return try smokeRequest(path: path, method: method, body: data["body"] as? String) }
            return try await api.request(path: path, method: method, body: data["body"] as? String)
        case "status": updateStatus(data); return true
        case "settings": return await settings()
        case "timePreferences": return timePreferences
        case "setTimePreferences":
            guard let value = data["value"] as? [String: String], let zone = value["timeZone"], zone.count <= 100, TimeZone(identifier: zone) != nil,
                  let format = value["clockFormat"], ["12h", "24h"].contains(format) else { throw DesktopError.message("Choose a valid time zone and clock format.") }
            let saved = ["timeZone": zone, "clockFormat": format]
            if smokeTest { smokeTimePreferences = saved } else { preferences.set(saved, forKey: "timeDisplay") }
            dispatch("timePreferences", saved)
            return saved
        case "setPreference": return try await setPreference(data)
        case "togglePin": pinned.toggle(); return await settings()
        case "openCompact": openCompact(); return true
        case "openDashboard": showPanel(page: "today"); return true
        case "openWebsite": openWebsite(); return true
        case "previewSound": playSound(celebration: true); return true
        case "alerts": await deliverAlerts(data); return true
        case "saveFile": return try await saveFile(data)
        case "historyLoad":
            guard localOnly else { throw DesktopError.message("Only the local workspace uses a local safety image.") }
            return await historyVault.loadLocal()
        case "cloudStatus": return cloudBackup.status()
        case "cloudConnect":
            guard !smokeTest, let origin = data["origin"] as? String, let password = data["password"] as? String else { throw DesktopError.message("Cloud connection is unavailable in this test or request.") }
            return try await cloudBackup.connect(origin: origin, password: password)
        case "cloudSave":
            guard let json = data["backupJSON"] as? String, let revision = data["revision"] as? Int, let fingerprint = data["fingerprint"] as? String else { throw DesktopError.message("Invalid cloud backup payload.") }
            let result = await cloudBackup.save(json: json, revision: revision, fingerprint: fingerprint)
            dispatch("cloudBackup", result); return result
        case "cloudList": return try await cloudBackup.list()
        case "cloudRead":
            guard let id = data["id"] as? String else { throw DesktopError.message("Choose a cloud backup.") }
            return try await cloudBackup.read(id: id)
        case "cloudDisconnect": return try await cloudBackup.disconnect()
        case "historySave":
            guard localOnly, let image = data["image"] as? [String: Any] else { throw DesktopError.message("Invalid local history image.") }
            try await historyVault.saveLocal(image); return true
        case "historyCapture":
            guard let backup = data["backup"] as? [String: Any] else { throw DesktopError.message("Missing history backup.") }
            return try await historyVault.capture(backup: backup, local: localOnly, working: data["working"] as? [String: Any] ?? [:])
        case "historyStatus": return await historyVault.status(local: localOnly)
        case "historyRecovered":
            guard let message = data["message"] as? String else { throw DesktopError.message("Missing recovery notice.") }
            try await historyVault.noteRecovery(message, local: localOnly); return true
        case "historyAcknowledge": try await historyVault.acknowledgeRecovery(local: localOnly); return true
        case "historyList": return await historyVault.list()
        case "historyRead":
            guard let id = data["id"] as? String else { throw DesktopError.message("Choose a history copy.") }
            return try await historyVault.recoveryBackup(id: id)
        case "historyConfirmSeparate":
            guard localOnly else { throw DesktopError.message("This choice is for a separate local workspace.") }
            try await historyVault.confirmSeparateHistory(); return true
        case "historyReveal":
            let directory = try await historyVault.directory(); NSWorkspace.shared.open(directory); return true
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
        let stale = day != today || !["saved", "local"].contains(status)
        if let total, let goal, goal > 0, day == today {
            switch mode {
            case "icon": button.title = ""
            case "percent": button.title = " \(Int((Double(total) / Double(goal) * 100).rounded()))%\(stale ? " ·" : "")"
            default: button.title = " \(total)/\(goal)\(stale ? " ·" : "")"
            }
            button.toolTip = "Apply Vigil · \(total) of \(goal) today (UTC) · \(status == "local" ? "On this Mac" : status)\(pending > 0 ? " · \(pending) pending" : "")"
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
        preferences.set(loginStatusName, forKey: "launchAtLoginRegistrationStatus")
        return ["launchAtLogin": login == .enabled, "loginStatus": loginStatusName, "loginError": preferences.string(forKey: "launchAtLoginError") ?? "", "notifications": preferences.bool(forKey: "notifications") && notificationStatus == "authorized", "notificationStatus": notificationStatus, "sound": (AlertSound(rawValue: preferences.string(forKey: "sound") ?? "soft") ?? .soft).rawValue, "menuDisplay": preferences.string(forKey: "menuDisplay") ?? "count", "pinned": pinned, "version": version]
    }
    private var loginStatusName: String {
        let status = SMAppService.mainApp.status
        return status == .enabled ? "enabled" : status == .requiresApproval ? "requiresApproval" : status == .notFound ? "notFound" : "notRegistered"
    }
    private var timePreferences: [String: String] {
        let saved = smokeTest ? smokeTimePreferences : preferences.dictionary(forKey: "timeDisplay") as? [String: String]
        let zone = saved?["timeZone"] ?? "Asia/Kolkata", format = saved?["clockFormat"] ?? "12h"
        return ["timeZone": TimeZone(identifier: zone) != nil ? zone : "Asia/Kolkata", "clockFormat": format == "24h" ? "24h" : "12h"]
    }
    private func setPreference(_ data: [String: Any]) async throws -> [String: Any] {
        guard let key = data["key"] as? String else { throw DesktopError.message("Missing preference.") }
        switch key {
        case "pinned": guard let value = data["value"] as? Bool else { throw DesktopError.message("Invalid preference.") }; pinned = value
        case "launchAtLogin":
            guard !smokeTest, let value = data["value"] as? Bool else { throw DesktopError.message("Login items are unavailable in the test app.") }
            if value { try SMAppService.mainApp.register() } else { try await SMAppService.mainApp.unregister() }
            preferences.set(value, forKey: "launchAtLoginDesired"); preferences.removeObject(forKey: "launchAtLoginError")
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
    private func startSmokeTest() { if localOnly { runLocalSmokeChecks() } else { runSmokeChecks() } }

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
        do { return try await (target ?? webView).callAsyncJavaScript("return await (\(script));", arguments: [:], in: nil, contentWorld: .page) }
        catch { throw DesktopError.message("Native test JavaScript failed: \((error as NSError).userInfo) · expression: \(script)") }
    }
    private func waitForTestState(_ expression: String, in target: WKWebView? = nil) async throws {
        for _ in 0..<100 {
            if (try? await evaluate(expression, in: target)) as? Bool == true { return }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        let detail = (try? await evaluate("JSON.stringify(window.__applyVigilTest?.state())", in: target)) as? String ?? "Interface unavailable"
        throw DesktopError.message("Native check timed out: \(expression) · \(detail)")
    }
    private func checkTimePreferences() async throws {
        try await waitForTestState("window.__applyVigilTest?.timePreferences().timeZone === 'Asia/Kolkata' && window.__applyVigilTest.timePreferences().clockFormat === '12h'")
        try await waitForTestState("!!document.querySelector('[aria-label=\"Settings\"]')")
        _ = try await evaluate("document.querySelector('[aria-label=\"Settings\"]').click()")
        try await waitForTestState("!!document.querySelector('[aria-label=\"Clock format\"]')")
        try await checkSettingsNavigation()
        _ = try await evaluate("[...document.querySelectorAll('[aria-label=\"Clock format\"] button')].find(button=>button.textContent==='24-hour').click()")
        try await waitForTestState("window.__applyVigilTest.timePreferences().clockFormat === '24h'")
        _ = try await evaluate("window.__applyVigilTimeReload = true")
        webReady = false; webView.reload()
        try await waitForTestState("!window.__applyVigilTimeReload && window.__applyVigilTest?.state().status === 'saved' && window.__applyVigilTest.timePreferences().clockFormat === '24h'")
        let blocked = try await evaluate("window.webkit.messageHandlers.applyVigil.postMessage({command:'setTimePreferences',value:{timeZone:'Mars/Olympus',clockFormat:'24h'}}).then(()=>false,()=>true)")
        guard blocked as? Bool == true else { throw DesktopError.message("An invalid time zone reached native preferences") }
        _ = try await evaluate("window.__applyVigilTest.setTimePreferences({timeZone:'Asia/Kolkata',clockFormat:'12h'})")
    }
    private func checkSettingsNavigation() async throws {
        let script = """
        (async()=>{
          const check=(ok,message)=>{if(!ok)throw new Error(message)},wait=async(test)=>{for(let n=0;n<100;n++){if(test())return;await new Promise(resolve=>setTimeout(resolve,10))}throw new Error('Settings interface did not settle')};
          const modal=document.querySelector('.settings-modal'),tabs=[...modal.querySelectorAll('[role="tab"]')],tab=name=>tabs.find(button=>button.dataset.settingsTab===name),panel=name=>modal.querySelector('#'+CSS.escape(tab(name).getAttribute('aria-controls')));
          const snapshot=JSON.stringify(window.__applyVigilTest.state().snapshot),input=panel('general').querySelector('.time-zone-field input'),draft=input.value;
          const type=value=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))};
          check(tabs.length===3&&!panel('general').hidden&&panel('alerts').hidden&&panel('data').hidden,'Settings must show one of three tabs');
          type('America/New_York');await wait(()=>input.value==='America/New_York');
          tab('general').focus();tab('general').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
          await wait(()=>!panel('alerts').hidden);
          check(document.activeElement===tab('alerts')&&tab('alerts').getAttribute('aria-selected')==='true','Arrow keys must select and focus the next tab');
          check(panel('alerts').querySelector('[role="switch"]')&&panel('alerts').querySelector('[aria-label="Preview sound"]'),'Alert controls are missing');
          tab('alerts').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));await wait(()=>!panel('data').hidden);
          [...panel('data').querySelectorAll('button')].find(button=>button.textContent==='Recover history').click();await wait(()=>panel('data').querySelector('[aria-label="Saved history copies"]'));
          tab('general').click();await wait(()=>!panel('general').hidden);check(input.value==='America/New_York','Switching tabs discarded an unapplied time zone');
          const box=modal.getBoundingClientRect(),general=panel('general');
          check(general.scrollWidth<=general.clientWidth+1&&box.left>=0&&box.right<=innerWidth+1,'Settings has horizontal overflow');
          check(general.scrollHeight<=general.clientHeight+1,'Everyday settings should fit without scrolling');
          tab('data').click();await wait(()=>!panel('data').hidden);check(panel('data').querySelector('[aria-label="Saved history copies"]'),'Switching tabs discarded the recovery review');
          check([...panel('data').querySelectorAll('.settings-details')].every(details=>!details.open),'Detailed explanations must start collapsed');
          tab('data').focus();tab('data').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));await wait(()=>!panel('general').hidden);
          check(document.activeElement===tab('general')&&tabs.filter(button=>button.tabIndex===0).length===1,'Settings keyboard focus is inconsistent');
          type(draft);await new Promise(resolve=>setTimeout(resolve,10));
          check(JSON.stringify(window.__applyVigilTest.state().snapshot)===snapshot,'Browsing Settings changed application history');
          return true;
        })()
        """
        guard (try await evaluate(script)) as? Bool == true else { throw DesktopError.message("Settings navigation check failed") }
    }
    private func checkSharedTimePreferences(in compact: WKWebView) async throws {
        _ = try await evaluate("window.__applyVigilTest.setTimePreferences({timeZone:'America/New_York',clockFormat:'24h'})", in: compact)
        let selected = "window.__applyVigilTest.timePreferences().timeZone === 'America/New_York' && window.__applyVigilTest.timePreferences().clockFormat === '24h'"
        try await waitForTestState(selected); try await waitForTestState(selected, in: compact)
        _ = try await evaluate("window.__applyVigilTest.setTimePreferences({timeZone:'Asia/Kolkata',clockFormat:'12h'})")
        try await waitForTestState("window.__applyVigilTest.timePreferences().clockFormat === '12h'", in: compact)
    }
    private func checkMomentum() async throws {
        let expression = """
        (()=>{
          const snapshot=window.__applyVigilTest.state().snapshot,today=new Date().toISOString().slice(0,10);
          const entries=snapshot.entries.filter(e=>!e.deleted&&e.date<=today),sum=items=>items.reduce((n,e)=>n+e.easy+e.external,0);
          const shift=offset=>new Date(Date.parse(today+'T00:00:00.000Z')+offset*86400000).toISOString().slice(0,10);
          const text=id=>document.querySelector('[data-testid="momentum-'+id+'"]').textContent;
          if(text('yesterday')!==sum(entries.filter(e=>e.date===shift(-1))).toLocaleString('en')||text('all-time')!==sum(entries).toLocaleString('en'))return false;
          for(const days of [7,30]){
            const total=sum(entries.filter(e=>e.date>=shift(1-days)));
            if(text(days+'-total')!==total.toLocaleString('en')||text(days+'-average')!==(total/days).toLocaleString('en',{maximumFractionDigits:2}))return false;
          }
          const easyOn=day=>entries.filter(e=>e.date===day).reduce((n,e)=>n+e.easy,0),easy=easyOn(today);
          let offset=easy>=20?0:-1,streak=0;
          while(shift(offset)>=snapshot.trackingStart&&easyOn(shift(offset))>=20){streak++;offset--;}
          if(document.querySelector('[data-testid="easy-streak-days"]').textContent!==streak.toLocaleString('en')||document.querySelector('[data-testid="easy-streak-today"]').textContent!==easy+'/20'||Number(document.querySelector('.easy-streak-fill').getAttribute('stroke-dashoffset'))!==100-Math.round(Math.min(easy/20,1)*100))return false;
          const columns=[...document.querySelectorAll('.momentum-column')].map(el=>el.getBoundingClientRect());
          const parent=document.querySelector('.momentum-columns').getBoundingClientRect(),workspace=document.querySelector('.workspace');
          return columns.length===4&&columns.every((rect,i)=>Math.abs(rect.top-columns[0].top)<1&&rect.right<=parent.right+1&&(!i||rect.left>=columns[i-1].right-1))&&workspace.scrollWidth<=workspace.clientWidth+1;
        })()
        """
        try await waitForTestState(expression)
    }
    private func checkQuickMomentum() async throws {
        let start = (try await evaluate("Number(document.querySelector('[data-testid=\"daily-count\"]').textContent.replaceAll(',',''))")) as! Int
        for (label, amount) in [("Add 1 LinkedIn Easy Apply applications", 1), ("Add 5 External / form applications", 6)] {
            _ = try await evaluate("document.querySelector('[aria-label=\"\(label)\"]').click()")
            try await waitForTestState("Number(document.querySelector('[data-testid=\"daily-count\"]').textContent.replaceAll(',','')) === \(start + amount)")
            try await checkMomentum()
        }
        for amount in [1, 0] {
            _ = try await evaluate("document.querySelector('.desktop-undo').click()")
            try await waitForTestState("Number(document.querySelector('[data-testid=\"daily-count\"]').textContent.replaceAll(',','')) === \(start + amount)")
            try await checkMomentum()
        }
        try await waitForTestState("window.__applyVigilTest.state().status === 'saved' && window.__applyVigilTest.state().queue.length === 0")
        let easy = (try await evaluate("window.__applyVigilTest.state().snapshot.entries.filter(e=>!e.deleted&&e.date===new Date().toISOString().slice(0,10)).reduce((n,e)=>n+e.easy,0)")) as! Int
        let addition = max(1, 20 - easy)
        _ = try await evaluate("window.__applyVigilTest.log(\(addition),0)")
        try await waitForTestState("document.querySelector('.easy-streak').classList.contains('reached')")
        try await checkMomentum()
        _ = try await evaluate("document.querySelector('.desktop-undo').click()")
        try await waitForTestState("Number(document.querySelector('[data-testid=\"daily-count\"]').textContent.replaceAll(',','')) === \(start)")
        try await checkMomentum()
        try await waitForTestState("window.__applyVigilTest.state().status === 'saved' && window.__applyVigilTest.state().queue.length === 0")
    }
    private func checkUsageLayout() async throws {
        // The test bundle uses its own temporary history. Changing only its
        // display zone reproduces the logged-date/assigned-date boundary.
        print("Checking compact Usage and Rhythm…"); fflush(stdout)
        let script = """
        (async()=>{
          const check=(ok,message)=>{if(!ok)throw new Error(message)},wait=async(test,label='Usage interface')=>{for(let n=0;n<20;n++){if(test())return;await new Promise(resolve=>setTimeout(resolve,50))}const c=document.querySelector('.rhythm-scroll');throw new Error(label+' did not settle: '+JSON.stringify(c?{left:c.scrollLeft,width:c.clientWidth,total:c.scrollWidth,view:c.getBoundingClientRect(),last:[...c.querySelectorAll('.rhythm-day')].at(-1).getBoundingClientRect(),track:c.firstElementChild.getBoundingClientRect()}:{}))};
          const click=label=>document.querySelector('[aria-label="'+label+'"]').click(),snapshot=()=>JSON.stringify(window.__applyVigilTest.state().snapshot.entries);
          const before=snapshot(),original=window.__applyVigilTest.timePreferences(),homeSizes=['.summary','.logging','.desktop-insights'].map(selector=>document.querySelector(selector).getBoundingClientRect().height);
          const zone=new Date().getUTCHours()<10?'Pacific/Honolulu':'Pacific/Kiritimati';
          await window.__applyVigilTest.setTimePreferences({timeZone:zone,clockFormat:'12h'});click('Usage');
          await wait(()=>document.querySelector('.desktop-usage .entry-time .entry-assigned-date'));
          const root=document.querySelector('.desktop-usage'),workspace=root.querySelector('.workspace'),ranges=[...root.querySelectorAll('[aria-label="History range"] button')],originalRange=ranges.find(button=>button.getAttribute('aria-pressed')==='true').textContent;
          for(const format of ['12h','24h']){
            await window.__applyVigilTest.setTimePreferences({timeZone:zone,clockFormat:format});await new Promise(resolve=>setTimeout(resolve,10));
            for(const node of root.querySelectorAll('.entry-time')){
              check(node.innerText.trim().split(String.fromCharCode(10)).length===2&&node.getBoundingClientRect().height<=29,'An entry timestamp uses more than two lines');
              const line=node.querySelector('.entry-date-line');check(line.scrollWidth<=line.clientWidth+1,'The entry date is clipped');
              check(node.title.includes('Assigned application date:')&&node.title.includes('UTC'),'Full date details are missing');
            }
          }
          for(const days of [7,15,30]){
            ranges.find(button=>button.textContent===days+' days').click();await wait(()=>root.querySelectorAll('.chart-day').length===days);
            check(root.querySelector('.chart svg').viewBox.baseVal.height<300,'The Usage plot is unnecessarily tall');
            check([...root.querySelectorAll('.chart-day')].every(day=>day.getBoundingClientRect().height>0),'A chart day is no longer interactive');
          }
          const rhythm=root.querySelector('.rhythm'),calendar=rhythm.querySelector('.rhythm-scroll'),today=new Date().toISOString().slice(0,10),start=new Date(Date.parse(today+'T00:00:00.000Z')-89*86400000).toISOString().slice(0,10);
          const entries=window.__applyVigilTest.state().snapshot.entries.filter(entry=>!entry.deleted&&entry.date>=start&&entry.date<=today),total=entries.reduce((sum,entry)=>sum+entry.easy+entry.external,0),easy=entries.filter(entry=>entry.date===today).reduce((sum,entry)=>sum+entry.easy,0),external=entries.filter(entry=>entry.date===today).reduce((sum,entry)=>sum+entry.external,0);
          check(rhythm.querySelector('[data-testid="rhythm-total"]').textContent===total.toLocaleString('en'),'Rhythm does not include the full rolling 90-day total');
          check(rhythm.querySelectorAll('.rhythm-month').length===6&&rhythm.querySelectorAll('.rhythm-day[tabindex="0"]').length===1,'Rhythm must start with six months and one keyboard entry point');
          const atLatest=()=>{const tile=calendar.querySelector('[data-date="'+today+'"]').getBoundingClientRect(),view=calendar.getBoundingClientRect();return tile.left>=view.left&&tile.right<=view.right+1};
          await wait(atLatest,'Rhythm newest dates');
          const visible=[...calendar.querySelectorAll('.rhythm-day')].filter(tile=>tile.getBoundingClientRect().right>calendar.getBoundingClientRect().left&&tile.getBoundingClientRect().left<calendar.getBoundingClientRect().right).map(tile=>tile.dataset.date).sort();
          check(visible.at(-1)===today&&Math.abs(Date.parse(visible[0])-Date.parse(start))<=7*86400000,'Rhythm does not open at the latest 90 days');
          const left=calendar.scrollLeft;rhythm.querySelector('[aria-label="Earlier Rhythm months"]').click();await wait(()=>calendar.scrollLeft<left-20,'Earlier months');
          const oldFirst=calendar.querySelector('.rhythm-month'),oldX=oldFirst.getBoundingClientRect().left,oldWidth=calendar.scrollWidth;
          rhythm.querySelector('[aria-label="Load earlier months"]').click();await wait(()=>calendar.querySelectorAll('.rhythm-month').length===12,'Six earlier months');
          check(calendar.scrollWidth>oldWidth&&Math.abs(oldFirst.getBoundingClientRect().left-oldX)<2,'Loading earlier months moved the currently viewed dates');
          check(rhythm.querySelector('[data-testid="rhythm-total"]').textContent===total.toLocaleString('en'),'Loading months changed the rolling total');
          const previousDate=calendar.querySelector('.rhythm-day');previousDate.focus();await wait(()=>rhythm.querySelector('[role="tooltip"]'),'Earlier-month tooltip');
          previousDate.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));await wait(atLatest,'End returns to latest dates');
          rhythm.querySelector('[aria-label="Earlier Rhythm months"]').click();await wait(()=>calendar.scrollLeft<calendar.scrollWidth-calendar.clientWidth-20,'Earlier months after expansion');
          const secondAnchor=oldFirst.getBoundingClientRect().left;
          rhythm.querySelector('[aria-label="Load earlier months"]').click();await wait(()=>calendar.querySelectorAll('.rhythm-month').length===18,'Next six earlier months');
          check(Math.abs(oldFirst.getBoundingClientRect().left-secondAnchor)<2,'Loading another batch moved the viewed dates');
          const expandedFirst=calendar.querySelector('.rhythm-day');expandedFirst.focus();
          expandedFirst.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));await wait(atLatest,'Latest dates after expansion');
          await wait(()=>rhythm.querySelector('[aria-label="Later Rhythm months"]').disabled,'Latest-month navigation state');
          const todayTile=calendar.querySelector('[data-date="'+today+'"]');todayTile.focus();await wait(()=>rhythm.querySelector('[role="tooltip"]'));
          const tip=rhythm.querySelector('[role="tooltip"]'),tipBox=tip.getBoundingClientRect(),rhythmBox=rhythm.getBoundingClientRect();
          check(tip.textContent.includes(easy+' Easy Apply')&&tip.textContent.includes(external+' form fill'),'The single Rhythm tooltip is missing the application breakdown');
          check(tipBox.left>=rhythmBox.left-1&&tipBox.right<=rhythmBox.right+1,'The Rhythm tooltip escapes the panel');
          todayTile.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));await wait(()=>document.activeElement?.dataset.date===new Date(Date.parse(today+'T00:00:00.000Z')-7*86400000).toISOString().slice(0,10));
          todayTile.click();await wait(()=>todayTile.getAttribute('aria-pressed')==='true');
          check(workspace.scrollWidth<=workspace.clientWidth+1,'Usage has horizontal overflow');
          root.querySelector('.chart-day').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait(()=>root.querySelector('.chart-day.selected'));
          [...root.querySelectorAll('[aria-label="Browse days"] button')].find(button=>button.textContent==='Today').click();
          ranges.find(button=>button.textContent===originalRange).click();await window.__applyVigilTest.setTimePreferences(original);click('Today');await wait(()=>document.querySelector('.desktop-today'));
          check(homeSizes.every((height,index)=>Math.abs(height-document.querySelector(['.summary','.logging','.desktop-insights'][index]).getBoundingClientRect().height)<1),'Usage spacing changed the Home layout');
          check(snapshot()===before,'Usage layout changes modified application records');return true;
        })()
        """
        guard (try await evaluate(script)) as? Bool == true else { throw DesktopError.message("Usage layout check failed") }
    }
    private func runSmokeChecks() {
        Task { @MainActor in
            do {
                try await waitForTestState("window.__applyVigilTest?.state().status === 'saved'")
                try await checkTimePreferences()
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
                try await checkMomentum()
                webReady = false; webView.reload()
                try await waitForTestState("window.__applyVigilTest?.state().initialized && window.__applyVigilTest.state().queue.length === 1 && window.__applyVigilTest.state().draft?.value === 'retained'")
                smokeOnline = true; refresh()
                try await waitForTestState("window.__applyVigilTest.state().status === 'saved' && window.__applyVigilTest.state().queue.length === 0")
                let count = (try await evaluate("window.__applyVigilTest.state().snapshot.entries.filter(e=>!e.deleted).reduce((n,e)=>n+e.easy+e.external,0)")) as? Int
                guard count == 5, smokeApplied.count == 1, statusItem.button?.title.contains("5/75") == true else { throw DesktopError.message("Native sync/count verification failed") }
                try await checkUsageLayout()
                try await checkMomentum()
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
                guard compactReady, (try await evaluate("window.__applyVigilTest.state().snapshot?.entries.filter(e=>!e.deleted).reduce((n,e)=>n+e.easy+e.external,0)", in: compact)) as? Int == 5 else { throw DesktopError.message("Compact window did not share the cached workspace") }
                try await checkSharedTimePreferences(in: compact)
                _ = try await evaluate("window.__applyVigilTest.log(1,1)", in: compact)
                compactPanel?.close()
                smokeOnline = true; refresh()
                try await waitForTestState("window.__applyVigilTest.state().status === 'saved' && window.__applyVigilTest.state().queue.length === 0 && window.__applyVigilTest.state().snapshot.entries.filter(e=>!e.deleted).reduce((n,e)=>n+e.easy+e.external,0) === 7")
                guard smokeApplied.count == 2 else { throw DesktopError.message("Shared compact operation was not applied exactly once") }
                try await checkMomentum()
                let report: [String: Any] = ["passed": true, "checks": ["bundled WebKit UI in native glass host", "four-column inclusive rolling totals and averages", "India AM/PM defaults", "clock controls persist across reload", "invalid time zones rejected", "time preferences shared across native windows", "all six alert sounds decode", "file-origin IndexedDB and crypto", "no Dock activation", "restricted API bridge", "offline durable queue", "draft and queue survive reload", "reconnect sync", "idempotent retry", "menu bar progress", "pin and dismissal behavior", "compact window shares cache and queue", "compact pending write survives closing its window"], "appliedOperations": smokeApplied.count, "total": 7, "panelWidth": 425, "panelHeight": panelHeight(), "interfaceScale": webView.pageZoom]
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
    private func runLocalSmokeChecks() {
        Task { @MainActor in
            do {
                try await waitForTestState("window.__applyVigilTest?.state().status === 'saved'")
                try await checkTimePreferences()
                guard (try await evaluate("document.body.textContent.includes('Owner password')")) as? Bool == false else { throw DesktopError.message("Local mode unexpectedly asks for an owner password") }
                _ = try await evaluate("window.__applyVigilTest.log(3,2)")
                _ = try await evaluate("window.__applyVigilTest.draft({kind:'local-test',value:'retained'})")
                try await waitForTestState("window.__applyVigilTest.state().queue.length === 0 && window.__applyVigilTest.state().status === 'saved'")
                try await checkQuickMomentum()
                try await checkUsageLayout()
                webReady = false; webView.reload()
                try await waitForTestState("window.__applyVigilTest?.state().status === 'saved' && window.__applyVigilTest.state().draft?.value === 'retained' && window.__applyVigilTest.state().snapshot.entries.filter(e=>!e.deleted).reduce((n,e)=>n+e.easy+e.external,0) === 5")
                openCompact()
                guard let compact = compactWebView else { throw DesktopError.message("Compact local window was not created") }
                var ready = false
                for _ in 0..<100 {
                    if (try? await evaluate("window.__applyVigilTest?.state().status === 'saved'", in: compact)) as? Bool == true { ready = true; break }
                    try await Task.sleep(nanoseconds: 100_000_000)
                }
                guard ready else { throw DesktopError.message("Compact local window did not initialize") }
                try await checkSharedTimePreferences(in: compact)
                _ = try await evaluate("window.__applyVigilTest.log(1,1)", in: compact)
                compactPanel?.close(); refresh()
                try await waitForTestState("window.__applyVigilTest.state().status === 'saved' && window.__applyVigilTest.state().queue.length === 0 && window.__applyVigilTest.state().snapshot.entries.filter(e=>!e.deleted).reduce((n,e)=>n+e.easy+e.external,0) === 7")
                let copies = await historyVault.list()
                guard copies.contains(where: { $0["applications"] as? Int == 7 }) else { throw DesktopError.message("The local history did not get an independent safety copy") }
                // Exercise the same reviewed merge as the recovery screen, in
                // this test bundle's nonpersistent store and temporary vault.
                let recoveryID = UUID().uuidString
                let restoreScript = "(async()=>{const s=window.__applyVigilTest.state().snapshot,stamp=new Date().toISOString(),day=stamp.slice(0,10);const backup={format:'vigil-backup',version:1,exportedAt:stamp,trackingStart:s.trackingStart,policies:s.policies,overrides:s.overrides,entries:[...s.entries,{id:'\(recoveryID)',date:day,easy:2,external:0,loggedAt:stamp,createdAt:stamp,updatedAt:stamp,version:1,deleted:false,backdated:false}]};await window.__applyVigilTest.recover(backup);await window.__applyVigilTest.recover(backup);return true})()"
                _ = try await evaluate(restoreScript)
                try await waitForTestState("window.__applyVigilTest.state().status === 'saved' && window.__applyVigilTest.state().snapshot.entries.filter(e=>!e.deleted).reduce((n,e)=>n+e.easy+e.external,0) === 9")
                _ = try await evaluate("(async()=>{await new Promise((resolve,reject)=>{const request=indexedDB.open('apply-vigil-device-records-v1');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('meta','readwrite');tx.objectStore('meta').delete('snapshot');tx.oncomplete=()=>{db.close();resolve(true)};tx.onerror=()=>reject(tx.error)}});await window.__applyVigilTest.sync();return true})()")
                try await waitForTestState("window.__applyVigilTest.state().status === 'saved' && window.__applyVigilTest.state().snapshot.entries.filter(e=>!e.deleted).reduce((n,e)=>n+e.easy+e.external,0) === 9")
                let blocked = try await evaluate("window.webkit.messageHandlers.applyVigil.postMessage({command:'request',path:'/api/snapshot',method:'GET'}).then(()=>false,()=>true)")
                guard blocked as? Bool == true, apiRequests == 0, NSApp.activationPolicy() == .accessory else { throw DesktopError.message("Local-only network or Dock boundary failed") }
                try writeSmokeReport(["passed": true, "mode": "local", "total": 9, "apiRequests": apiRequests, "checks": ["first launch without account", "quick-button and undo averages update immediately", "four-column inclusive rolling totals and averages", "India AM/PM defaults", "clock controls persist across reload", "invalid time zones rejected", "time preferences shared across native windows", "durable local records and drafts", "reload restores local data", "two native windows share local data", "closing compact window preserves local writes", "independent native safety copy", "reviewed recovery is duplicate-safe", "missing primary snapshot restores automatically", "native owner API is blocked", "no network requests or Dock icon"]])
                print("Apply Vigil local-only native checks passed.")
                NSApp.terminate(nil)
            } catch {
                try? writeSmokeReport(["passed": false, "error": error.localizedDescription])
                fputs("Apply Vigil local-only check failed: \(error.localizedDescription)\n", stderr)
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

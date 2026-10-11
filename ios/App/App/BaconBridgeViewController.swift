import UIKit
import WebKit
import Capacitor

/// The app's root view controller: Capacitor's bridge (which loads the live
/// site from `server.url` and hosts the native plugins) plus the two things the
/// web layer can't work out for itself.
class BaconBridgeViewController: CAPBridgeViewController {

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        // The configured backgroundColor is one hex for both appearances; swap
        // in the adaptive asset colour so dark mode never flashes cream while
        // the first page paints (the web view is transparent until then).
        let background = UIColor(named: "LaunchBackground") ?? .systemBackground
        webView?.backgroundColor = background
        webView?.scrollView.backgroundColor = background

        exposeNativeInfo()
    }

    /// Publishes `window.BaconNative` to every page, before any page script runs:
    ///  - `apsEnvironment`: which APNs gateway this build's device token belongs
    ///    to ("sandbox" for Xcode/development-signed builds, "production" for
    ///    TestFlight and the App Store). Sent with the token to /api/push/register.
    ///  - `serverUrl`: the live site, so the bundled offline page can retry it.
    private func exposeNativeInfo() {
        let bundle = Bundle.main.infoDictionary ?? [:]
        var info: [String: Any] = [
            "platform": "ios",
            "apsEnvironment": PushEnvironment.current,
            "appVersion": bundle["CFBundleShortVersionString"] as? String ?? "",
            "build": bundle["CFBundleVersion"] as? String ?? ""
        ]
        if let serverURL = bridge?.config.serverURL {
            info["serverUrl"] = serverURL.absoluteString
        }
        guard let json = try? JSONSerialization.data(withJSONObject: info, options: []),
              let literal = String(data: json, encoding: .utf8) else { return }
        let script = WKUserScript(source: "window.BaconNative = Object.freeze(\(literal));",
                                  injectionTime: .atDocumentStart,
                                  forMainFrameOnly: true)
        webView?.configuration.userContentController.addUserScript(script)
    }
}

/// Which APNs environment issued this install's device token.
///
/// Development-signed builds (Run from Xcode) carry an embedded provisioning
/// profile whose `aps-environment` is "development"; their tokens only work
/// against the sandbox gateway. App Store and TestFlight builds carry no
/// embedded profile and always use production; ad-hoc builds embed a profile
/// that says "production". The server also self-corrects: a token that APNs
/// rejects as BadDeviceToken is retried once on the other gateway (lib/apns.ts).
enum PushEnvironment {
    static let current: String = {
        #if targetEnvironment(simulator)
        return "sandbox"
        #else
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url),
              let text = String(data: data, encoding: .isoLatin1),
              let key = text.range(of: "<key>aps-environment</key>") else {
            return "production"
        }
        // The profile is a CMS-signed plist; its XML body is readable as text.
        let rest = text[key.upperBound...]
        guard let open = rest.range(of: "<string>") else { return "production" }
        let value = rest[open.upperBound...]
        guard let close = value.range(of: "</string>") else { return "production" }
        let environment = value[..<close.lowerBound].trimmingCharacters(in: .whitespacesAndNewlines)
        return environment == "development" ? "sandbox" : "production"
        #endif
    }()
}

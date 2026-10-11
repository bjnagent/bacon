import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        // Behind everything during launch and rotation: the same adaptive
        // cream / near-black as the launch screen and the web app.
        window?.backgroundColor = UIColor(named: "LaunchBackground") ?? .systemBackground
        window?.rootViewController = BaconBridgeViewController()
        window?.makeKeyAndVisible()

        // Universal links / URLs that launched the app are delivered to the
        // App plugin (`appUrlOpen`) once the bridge has loaded.
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        // Universal links (https://<host>/analyze/NVDA …) while running.
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

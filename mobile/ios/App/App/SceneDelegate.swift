import UIKit
import Capacitor
import WebKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = UINavigationController(rootViewController: WorkspaceViewController())
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}

final class WorkspaceViewController: UIViewController, WKNavigationDelegate {
    private var web: WKWebView!
    private var origin: URL?
    private func text(_ en: String, _ zh: String) -> String {
        Locale.preferredLanguages.first?.hasPrefix("zh") == true ? zh : en
    }
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "Hermes"
        view.backgroundColor = .systemBackground
        web = WKWebView(frame: .zero)
        web.navigationDelegate = self
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        navigationItem.rightBarButtonItem = UIBarButtonItem(image: UIImage(systemName: "server.rack"), style: .plain, target: self, action: #selector(chooseServer))
        navigationItem.rightBarButtonItem?.accessibilityLabel = text("Workspace server", "工作台服务器")
        if let saved = UserDefaults.standard.string(forKey: "workbenchOrigin"), let url = normalized(saved, rootOnly: true) {
            origin = url; web.load(URLRequest(url: url))
        } else { DispatchQueue.main.async { self.chooseServer() } }
    }
    private func normalized(_ value: String, rootOnly: Bool) -> URL? {
        guard var parts = URLComponents(string: value.trimmingCharacters(in: .whitespacesAndNewlines)),
              parts.scheme?.lowercased() == "https", let host = parts.host, !host.isEmpty,
              parts.user == nil, parts.password == nil else { return nil }
        if rootOnly && (!(parts.path.isEmpty || parts.path == "/") || parts.query != nil || parts.fragment != nil) { return nil }
        parts.scheme = "https"; parts.host = host.lowercased(); parts.path = ""; parts.query = nil; parts.fragment = nil
        if parts.port == 443 { parts.port = nil }
        return parts.url
    }
    @objc private func chooseServer() {
        let alert = UIAlertController(title: text("Workspace server", "工作台服务器"), message: nil, preferredStyle: .alert)
        alert.addTextField { field in
            field.placeholder = "https://"; field.text = self.origin?.absoluteString
            field.keyboardType = .URL; field.autocapitalizationType = .none; field.autocorrectionType = .no
        }
        alert.addAction(UIAlertAction(title: text("Cancel", "取消"), style: .cancel))
        alert.addAction(UIAlertAction(title: text("Connect", "连接"), style: .default) { _ in
            guard let url = self.normalized(alert.textFields?.first?.text ?? "", rootOnly: true) else {
                self.showError(self.text("Enter an HTTPS server origin.", "请输入 HTTPS 服务器根地址。")); return
            }
            let confirm = UIAlertController(title: url.absoluteString, message: self.text("Switch server? Unsent content will be lost.", "切换服务器？未发送内容将丢失。"), preferredStyle: .alert)
            confirm.addAction(UIAlertAction(title: self.text("Cancel", "取消"), style: .cancel))
            confirm.addAction(UIAlertAction(title: self.text("Connect", "连接"), style: .default) { _ in
                self.web.stopLoading(); self.origin = url
                UserDefaults.standard.set(url.absoluteString, forKey: "workbenchOrigin")
                self.web.load(URLRequest(url: url))
            })
            self.present(confirm, animated: true)
        })
        present(alert, animated: true)
    }
    private func showError(_ message: String) {
        let alert = UIAlertController(title: text("Connection", "连接"), message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default)); present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if navigationAction.targetFrame?.isMainFrame == false { decisionHandler(.allow); return }
        if normalized(url.absoluteString, rootOnly: false) == origin { decisionHandler(.allow); return }
        decisionHandler(.cancel)
        guard url.scheme == "https" else { return }
        let alert = UIAlertController(title: text("Open external link?", "打开外部链接？"), message: url.host, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: text("Cancel", "取消"), style: .cancel))
        alert.addAction(UIAlertAction(title: text("Open", "打开"), style: .default) { _ in UIApplication.shared.open(url) })
        present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { showError(text("Connection failed. Check your server address.", "连接失败，请检查服务器地址。")) }
    }
}

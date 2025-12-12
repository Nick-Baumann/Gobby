import ClawdisNodeKit
import SwiftUI
import WebKit

@MainActor
final class ScreenController: ObservableObject {
    let webView: WKWebView

    @Published var mode: ClawdisScreenMode = .web
    @Published var urlString: String = "https://example.com"
    @Published var errorText: String?

    init() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        self.webView = WKWebView(frame: .zero, configuration: config)
    }

    func setMode(_ mode: ClawdisScreenMode) {
        self.mode = mode
        self.reload()
    }

    func navigate(to urlString: String) {
        self.urlString = urlString
        self.reload()
    }

    func reload() {
        switch self.mode {
        case .web:
            guard let url = URL(string: self.urlString.trimmingCharacters(in: .whitespacesAndNewlines)) else { return }
            self.webView.load(URLRequest(url: url))
        case .canvas:
            self.webView.loadHTMLString(Self.canvasScaffoldHTML, baseURL: nil)
        }
    }

    func eval(javaScript: String) async throws -> String {
        try await withCheckedThrowingContinuation { cont in
            self.webView.evaluateJavaScript(javaScript) { result, error in
                if let error {
                    cont.resume(throwing: error)
                    return
                }
                if let result {
                    cont.resume(returning: String(describing: result))
                } else {
                    cont.resume(returning: "")
                }
            }
        }
    }

    func snapshotPNGBase64(maxWidth: CGFloat? = nil) async throws -> String {
        let config = WKSnapshotConfiguration()
        if let maxWidth {
            config.snapshotWidth = NSNumber(value: Double(maxWidth))
        }
        let image: UIImage = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<UIImage, Error>) in
            self.webView.takeSnapshot(with: config) { image, error in
                if let error {
                    cont.resume(throwing: error)
                    return
                }
                guard let image else {
                    cont.resume(throwing: NSError(domain: "Screen", code: 2, userInfo: [
                        NSLocalizedDescriptionKey: "snapshot failed",
                    ]))
                    return
                }
                cont.resume(returning: image)
            }
        }
        guard let data = image.pngData() else {
            throw NSError(domain: "Screen", code: 1, userInfo: [
                NSLocalizedDescriptionKey: "snapshot encode failed",
            ])
        }
        return data.base64EncodedString()
    }

    private static let canvasScaffoldHTML = """
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Canvas</title>
        <style>
          :root { color-scheme: dark; }
          html,body { height:100%; margin:0; }
          body {
            font: 13px -apple-system, system-ui;
            display:flex;
            align-items:center;
            justify-content:center;
            background:#0b1020;
            color:#e5e7eb;
          }
          .card {
            max-width: 520px;
            padding: 18px;
            border-radius: 14px;
            border: 1px solid rgba(255,255,255,.10);
            background: rgba(255,255,255,.06);
            box-shadow: 0 18px 60px rgba(0,0,0,.35);
          }
          .muted { color: rgba(229,231,235,.75); margin-top: 8px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div style="font-weight:600; font-size:14px;">Canvas scaffold</div>
          <div class="muted">Next: agent-driven on-disk workspace.</div>
        </div>
      </body>
    </html>
    """
}

import SwiftUI
import WebKit

private let defaultPort = 5500

private var appURL: URL {
    let portStr = ProcessInfo.processInfo.environment["PICISA_PORT"] ?? "\(defaultPort)"
    let port = Int(portStr) ?? defaultPort
    return URL(string: "http://localhost:\(port)")!
}

// MARK: - WebView

struct WebView: NSViewRepresentable {
    let url: URL
    @Binding var loadFailed: Bool

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.processPool = WKProcessPool()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.allowsMagnification = true
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, WKNavigationDelegate {
        var parent: WebView

        init(_ parent: WebView) {
            self.parent = parent
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            parent.loadFailed = true
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            parent.loadFailed = true
        }
    }
}

// MARK: - ContentView

struct ContentView: View {
    @State private var loadFailed = false

    var body: some View {
        Group {
            if loadFailed {
                VStack(spacing: 16) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(.secondary)
                    Text("Cannot connect to Picisa server")
                        .font(.title2)
                    Text("Start the server (e.g. npm run start) then open this app again.")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: 400)
                    Button("Retry") {
                        loadFailed = false
                    }
                    .buttonStyle(.borderedProminent)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                WebView(url: appURL, loadFailed: $loadFailed)
            }
        }
    }
}

#Preview {
    ContentView()
        .frame(width: 900, height: 700)
}

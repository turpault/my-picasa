# Picisa macOS wrapper

Minimal macOS app that shows the Picisa web UI in a window (WKWebView). Use it instead of Electron for local-only use: no installer, no distribution.

## Requirements

- macOS 14+
- Xcode or Xcode Command Line Tools (Swift 5, SwiftUI)
- Picisa server running (see main repo)

## Build and run

1. **Start the Picisa server** from the project root:
   ```bash
   npm run start
   ```
   Leave this running.

2. **Open the wrapper in Xcode** and run:
   ```bash
   open PicisaApp.xcodeproj
   ```
   Then press **Run** (⌘R). Or build from the command line:
   ```bash
   xcodebuild -project PicisaApp.xcodeproj -scheme PicisaApp -configuration Debug -derivedDataPath build
   open build/Build/Products/Debug/PicisaApp.app
   ```

3. The app opens a window pointing at `http://localhost:5500`. If the server is not running, you’ll see an error and a **Retry** button.

## Port

Default port is **5500**. To use another port, set `PICISA_PORT` before launching the app, e.g.:

```bash
PICISA_PORT=8080 open build/Release/PicisaApp.app
```

Or in Xcode: **Product → Scheme → Edit Scheme → Run → Arguments → Environment Variables** and add `PICISA_PORT` = `8080`.

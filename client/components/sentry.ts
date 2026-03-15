import * as Sentry from "@sentry/browser";

declare global {
  var __PICISA_DEV__: boolean | undefined;
}

export function initClientSentry() {
  if (typeof globalThis.__PICISA_DEV__ === "boolean" && globalThis.__PICISA_DEV__) {
    return;
  }
  if (isElectron()) {
    Sentry.init({
      dsn:
        "https://dd602459ed34409dbe4020713a85dbf6@o73322.ingest.sentry.io/6432140",
      integrations: [Sentry.browserTracingIntegration()],

      // Set tracesSampleRate to 1.0 to capture 100%
      // of transactions for performance monitoring.
      // We recommend adjusting this value in production
      tracesSampleRate: 1.0,
    });
  }
}

function isElectron() {
  // Detect the user agent when the `nodeIntegration` option is set to true
  if (
    typeof navigator === "object" &&
    typeof navigator.userAgent === "string" &&
    navigator.userAgent.indexOf("Electron") >= 0
  ) {
    return true;
  }

  return false;
}

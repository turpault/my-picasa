import * as Sentry from '@sentry/node';

export function startSentry() {
  Sentry.init({
    dsn: "https://dd602459ed34409dbe4020713a85dbf6@o73322.ingest.sentry.io/6432140",

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,
  });
}
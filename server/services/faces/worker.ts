const serviceName = process.env.PICISA_SERVICE_NAME ?? "faces";

function send(msg: { type: string; data?: unknown }): void {
  if (typeof process.send === "function") process.send(msg);
}

async function main(): Promise<void> {
  send({ type: "ready" });
  const { startWorkerStatsReporter, stopWorkerStatsReporter } = await import("../../utils/worker-stats");
  const { runFacesWorker } = await import("./internal/run-faces-worker");
  startWorkerStatsReporter();
  try {
    await runFacesWorker();
  } finally {
    stopWorkerStatsReporter();
  }
  send({ type: "done" });
}

main().catch((err) => {
  console.error(`Worker ${serviceName} error:`, err);
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  console.error(`Worker ${serviceName} uncaughtException:`, err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(`Worker ${serviceName} unhandledRejection:`, promise, reason);
  process.exit(1);
});

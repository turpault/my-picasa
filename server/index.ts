import { info } from "console";
import { startServer, startServices } from "./start";
import { imagesRoot, rootPath } from "./utils/constants";

function getPortFromArgsOrEnv(): number {
  const args = process.argv.slice(2);
  const candidate = args[args.length - 1];

  if (candidate) {
    const parsed = parseInt(candidate, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  const envPort = process.env.PICISA_PORT;
  if (envPort) {
    const parsed = parseInt(envPort, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return 5500;
}

async function start() {
  const port = getPortFromArgsOrEnv();
  info(
    `Starting standalone server on port ${port} in folder ${rootPath}. Photos root is ${imagesRoot}`,
  );
  await startServer(port);
  // Defer services so /ping responds immediately; heavy work runs after first tick
  setImmediate(() => void startServices());
}

start();

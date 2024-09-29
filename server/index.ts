import { info } from "console";
import { startServer, startServices } from "./start";
import { imagesRoot, rootPath } from "./utils/constants";
let port: any = process.argv.slice(-1)[0];

try {
  port = parseInt(port);
  if (Number.isNaN(port)) {
    throw new Error("Not a number");
  }
} catch (e) {
  port = 5500;
}

async function start() {
  info(
    `Starting server on port ${port} in folder ${rootPath}. Photos root is ${imagesRoot}`,
  );
  await startServer(port);
  await startServices();
}
start();

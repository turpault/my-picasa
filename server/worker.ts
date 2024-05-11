import { startBackgroundServices } from "./background/bg-services";
import { startServices } from "./start";

async function start() {
  await startServices();
  await startBackgroundServices();
}
start();

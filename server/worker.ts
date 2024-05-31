import { startBackgroundServices } from "./background/bg-services";
import { startRedis, stopRedis } from "./background/redis-process";
import { startServices } from "./start";

async function start() {
  process.env.PICASA_INI_SLEEP_DELAY = "60";
  // Don't clear ini map ever
  process.env.PICASA_INI_GRACE_DELAY = "60000";
  await startRedis();
  await startServices();
  await startBackgroundServices();
  await stopRedis();
}
start();

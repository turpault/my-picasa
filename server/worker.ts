import { sleep } from "../shared/lib/utils";
import { startBackgroundServices } from "./background/bg-services";
import { startRedis, stopRedis } from "./background/redis-process";
import { startServices } from "./start";

async function start() {
  // write dirty files every minute
  process.env.PICASA_WRITE_SLEEP_DELAY = "60";
  // Don't clear ini map ever
  process.env.PICASA_INI_GRACE_DELAY = "60000";
  await startRedis();
  await startServices();
  await startBackgroundServices();
  await stopRedis();
  await sleep(parseInt(process.env.PICASA_WRITE_SLEEP_DELAY) + 10);
  process.exit(0);
}
start();

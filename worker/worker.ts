import { sleep } from "../shared/lib/utils";
import { startBackgroundServices } from "./background/bg-services";
import { startRedis, stopRedis } from "./background/redis-process";
import { updateLastWalkLoop } from "../server/walker";
import { info } from "console";

async function start() {
  // write dirty files every minute
  process.env.PICASA_WRITE_SLEEP_DELAY = "60";
  // Don't clear ini map ever
  process.env.PICASA_INI_GRACE_DELAY = "60000";
  info("Starting services...");
  updateLastWalkLoop();
  await startRedis();
  await startBackgroundServices();
  await stopRedis();
  await sleep(parseInt(process.env.PICASA_WRITE_SLEEP_DELAY) + 10);
  process.exit(0);
}
start();

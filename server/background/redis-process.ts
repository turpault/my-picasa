import { spawn } from "child_process";
import { start } from "repl";

let proc: ReturnType<typeof spawn> | undefined;
let startCount = 0;
export function startRedis(): ReturnType<typeof spawn> {
  startCount++;
  if (proc) {
    return proc;
  }
  proc = spawn("redis-server", ["--port", "6379"]);
  return proc;
}

export function stopRedis() {
  if (--startCount === 0) {
    proc!.kill();
    proc = undefined;
  }
}

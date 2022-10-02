import chalk from "chalk";
import { buildEmitter } from "../../../shared/lib/event";

export type ClientState = {
  ready: {}
}
const emitter = buildEmitter<ClientState>();
export function clientReady() {
  console.info(chalk.red("Client is Ready"));
  emitter.emit("ready", {});
}
export function clientEmitter() {
  return emitter;
}
import { start } from "./start";
let port: any = process.argv.slice(-1)[0];

try {
  port = parseInt(port);
  if (Number.isNaN(port)) {
    throw new Error("Not a number");
  }
} catch (e) {
  port = 5500;
}

start(port);

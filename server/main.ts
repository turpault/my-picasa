import { app, BrowserWindow, contentTracing } from "electron";
import { join } from "path";
import { getPort, start } from "./start";
function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
  });

  win.loadFile(join(__dirname, "..", "..", "public", `index.html`), {
    hash: getPort().toString(),
  });
}

app
  .whenReady()
  .then(() => start())
  .then(() => {
    createWindow();
  });

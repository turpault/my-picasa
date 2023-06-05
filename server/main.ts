import { app, BrowserWindow } from "electron";
import { join } from "path";
import { sleep } from "../shared/lib/utils";
import { clientEmitter } from "./rpc/rpcFunctions/ready";
import { getPort, start } from "./start";

async function createSplash(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 600,
    height: 600,
    frame: false,
    center: true,
  });

  win.loadFile(
    join(__dirname, "..", "..", "public", "resources", "images", "splash.html")
  );
  return new Promise((resolve) => win.on("show", () => resolve(win)));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 2000,
    height: 1500,
    //    fullscreen: true,
    //    fullscreenable: true,
    center: true,
    show: false,
  });
  const query: Record<string, string> = { port: getPort().toString() };
  if (process.env.PICISA_WINDOWS) {
    query["window"] = "browser";
  }

  win.loadFile(join(__dirname, "..", "..", "public", `index.html`), {
    query,
  });
  return win;
}
(async () => {
  await app.whenReady();
  const client = clientEmitter();
  const splash = await createSplash();

  const minSplash = sleep(10);
  await start();
  const renderer = createWindow();
  client.on("ready", async () => {
    await minSplash;
    splash.close();
    splash.destroy();
    renderer.show();
  });
})();

import { app, BrowserWindow } from "electron";
import { join } from "path";
function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
  });

  win.loadFile(join(__dirname, "..", "..", "public", "index.html"));
}

app.whenReady().then(() => {
  createWindow();
});

import { spawn } from "child_process";

/**
 * Opens the Explorer and executes the callback function in windows os
 * @param {string} path The path string to be opened in the explorer
 */
async function openExplorerinWindows(path: string) {
  path = path || "=";
  let p = spawn("explorer", [path]);
  p.on("error", (err) => {
    p.kill();
  });
}

/**
 * Opens the Explorer and executes the callback function in osX
 * @param {string} path The path string to be opened in the explorer
 */
async function openExplorerinMac(path: string) {
  path = path || "/";
  let p = spawn("open", [path]);
  p.on("error", (err) => {
    p.kill();
  });
}

/**
 * Opens the Explorer and executes the callback function in ubuntu like os
 * @param {string} path The path string to be opened in the explorer
 */
async function openExplorerinLinux(path: string) {
  path = path || "/";
  let p = spawn("xdg-open", [path]);
  p.on("error", (err) => {
    p.kill();
  });
}
/**
 * Opens the Explorer and executes the callback function
 * @param {string} path The path string to be opened in the explorer
 */
import os from "os";
export async function openExplorer(path: string) {
  let osType = os.type();
  if (osType == "Windows_NT") {
    openExplorerinWindows(path);
  } else if (osType == "Darwin") {
    openExplorerinMac(path);
  } else {
    openExplorerinLinux(path);
  }
}

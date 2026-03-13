#!/usr/bin/env bun
/**
 * Single entry point for all build steps. Run with: bun run build
 */
import { rmSync, mkdirSync, cpSync } from "fs";
import { join } from "path";

const root = import.meta.dir + "/..";

function run(cmd: string[], cwd: string = root): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = Bun.spawn(cmd, {
      cwd,
      stdout: "inherit",
      stderr: "inherit",
    });
    proc.exited.then((code) => (code === 0 ? resolve(code) : reject(code)));
  });
}

async function main() {
  console.log("[build] Clean…");
  rmSync(join(root, "dist"), { recursive: true, force: true });
  try {
    rmSync(join(root, "picisa.dmg"), { force: true });
  } catch {
    // ignore
  }

  console.log("[build] Prebuild: mkdir dist, cp public → dist…");
  mkdirSync(join(root, "dist"), { recursive: true });
  cpSync(join(root, "public"), join(root, "dist"), { recursive: true });

  console.log("[build] Native filters…");
  await run(["bun", "run", "configure"], join(root, "server/imageOperations/native-filters"));
  await run(["bun", "run", "build"], join(root, "server/imageOperations/native-filters"));

  console.log("[build] Client (Vite)…");
  await run(["bunx", "vite", "build"]);

  console.log("[build] Icons (icns)…");
  await run([
    "png2icons",
    "resources/picisa.png",
    "resources/picisa",
    "-icns",
  ]);

  console.log("[build] Icons (ico)…");
  await run([
    "png2icons",
    "resources/picisa.png",
    "public/favicon",
    "-ico",
  ]);

  console.log("[build] Splash base64…");
  await run([
    "bun",
    "server/toBase64Url.mjs",
    "public/resources/images/splash.png",
  ]);

  console.log("[build] Done.");
}

main().catch((code) => {
  process.exit(typeof code === "number" ? code : 1);
});

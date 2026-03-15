#!/usr/bin/env bun
/**
 * Single entry point for all build steps. Run with: bun run build
 */
import { rmSync, mkdirSync, cpSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import png2icons from "png2icons";

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

  console.log("[build] Client (Bun bundle)…");
  const result = await Bun.build({
    entrypoints: [
      join(root, "public/index.html"),
      join(root, "client/stats.ts"),
    ],
    outdir: join(root, "public/dist"),
    minify: true,
  });
  if (!result.success) {
    console.error(result.logs);
    throw new Error("Client build failed");
  }

  // Re-inject env.js script (stripped by bundler) so client can detect dev mode
  const distDir = join(root, "public/dist");
  const distIndexPath = join(distDir, "index.html");
  const distIndex = readFileSync(distIndexPath, "utf-8");
  writeFileSync(
    distIndexPath,
    distIndex.replace(
      /(<head[^>]*>)/,
      "$1<script src=\"/env.js\"></script>",
    ),
  );
  cpSync(join(root, "public/env.js"), join(distDir, "env.js"));

  console.log("[build] Icons…");
  const pngInput = readFileSync(join(root, "resources/picisa.png"));

  const icns = png2icons.createICNS(pngInput, png2icons.BICUBIC, 0);
  if (!icns) throw new Error("Failed to create ICNS");
  writeFileSync(join(root, "resources/picisa.icns"), new Uint8Array(icns));

  const ico = png2icons.createICO(pngInput, png2icons.BICUBIC, 0, false);
  if (!ico) throw new Error("Failed to create ICO");
  writeFileSync(join(root, "public/favicon.ico"), new Uint8Array(ico));

  console.log("[build] Splash base64…");
  const splashPath = join(root, "public/resources/images/splash.png");
  const splashB64 = readFileSync(splashPath).toString("base64");
  writeFileSync(
    splashPath.replace(".png", ".html"),
    `<!DOCTYPE html>
<html dir="ltr" lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0" />
  </head>
  <body>
    <img style="left:0;right:0;top:0;bottom:0;width:100%;height:100%;position:fixed;" src="data:image/png;base64,${splashB64}" />
  </body>
</html>
`,
  );

  console.log("[build] Done.");
}

main().catch((code) => {
  process.exit(typeof code === "number" ? code : 1);
});

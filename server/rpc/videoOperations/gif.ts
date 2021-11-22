import { spawn } from "child_process";
import { join } from "path";
import { lock } from "../../../shared/lib/utils.js";
import { AlbumEntry } from "../../../shared/types/types.js";
import { imagesRoot } from "../../utils/constants.js";
import { delayEnd, delayStart, inc, rate } from "../../utils/stats.js";

export async function createGif(
  asset: AlbumEntry,
  size: number
): Promise<Buffer> {
  rate("createGif");
  const unlock = await lock("createGif");
  const i = delayStart("createGif");
  const source = join(imagesRoot, asset.album.key, asset.name);
  var result: Buffer[] = [];
  const converted = await new Promise<boolean>((resolve) => {
    const p = spawn("sh", [
      "-c",
      `ffmpeg -t 20 -i "${source}" -vf "fps=10,scale=${size}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 -f gif -`,
    ]);
    p.stdout.on("data", (data) => {
      result.push(data);
    });
    p.on("exit", (code) => {
      resolve(code === 0);
    });
  });
  delayEnd(i);
  unlock();

  if (converted) {
    return Buffer.concat(result);
  }
  throw new Error(`Conversion to gif failed for file "${source}"`);
}

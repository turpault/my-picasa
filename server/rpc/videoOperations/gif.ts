import { spawn } from "child_process";
import { lock } from "../../../shared/lib/utils";
import { AlbumEntry } from "../../../shared/types/types";
import { entryFilePath } from "../../utils/serverUtils";
import { delayEnd, delayStart, rate } from "../../utils/stats";

var pathToFfmpeg = require('ffmpeg-static');

export async function createGif(
  asset: AlbumEntry,
  size: number,
  animated: boolean
): Promise<Buffer> {
  rate("createGif");
  let converted = false;
  var result: Buffer[] = [];
  const source = entryFilePath(asset);
  // Global lock - only one gif created at any given time
  const unlock = await lock("createGif");
  try {
    const i = delayStart("createGif");
    converted = await new Promise<boolean>((resolve) => {
      const ffmpegArg = animated ? `"${pathToFfmpeg}" -t 20 -i "${source}" -vf "fps=10,scale=${size}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 -f gif -` :
      `"${pathToFfmpeg}" -t 1 -i "${source}" -vf "fps=10,scale=${size}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop -1 -f gif -`;
      const p = spawn("sh", [
        "-c",
        ffmpegArg,
      ]);
      p.stdout.on("data", (data) => {
        result.push(data);
      });
      p.stderr.on("data", (data) => {
        console.info(data.toString());
      });
      p.on("exit", (code) => {
        resolve(code === 0);
      });
    });
    delayEnd(i);
  } catch (e) {
    console.error(
      `Could not create a animated gif from video: ${asset.name}: ${e}`
    );
  } finally {
    unlock();
    if (converted) {
      return Buffer.concat(result);
    }
    throw new Error(`Conversion to gif failed for file "${source}"`);
  }
}

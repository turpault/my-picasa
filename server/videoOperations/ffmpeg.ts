import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { lock } from "../../shared/lib/mutex";
import { delayEnd, delayStart, rate } from "../utils/stats";
import { join } from "path";
import { tmpdir } from "os";
import { uuid } from "../../shared/lib/utils";
import { writeFile } from "fs/promises";

export async function ffmpeg(args: string[], outFile: string): Promise<void> {
  rate("ffmpeg");
  const unlock = await lock("ffmpeg");
  try {
    const i = delayStart("ffmpeg");
    return new Promise<void>(async (resolve, reject) => {
      console.info(
        `Running ffmpeg with args:\n${ffmpegPath!} ${args.join(" ")}`,
      );
      const scriptFile = join(tmpdir(), `ffmpeg-${uuid()}.sh`);
      await writeFile(
        scriptFile,
        `#!/bin/bash\n"${ffmpegPath!}" ${args.join(" ")} "${outFile}"`,
      );
      const p = spawn("/bin/bash", [scriptFile]);
      p.stderr.on("data", (data) => {
        console.info(data.toString());
      });
      p.on("exit", (code) => {
        if (code === 0) {
          delayEnd(i);
          resolve();
        } else {
          console.error(`ffmpeg exited with code ${code}`);
          reject(new Error(`ffmpeg exited with code ${code}`));
        }
      });
    });
  } finally {
    unlock();
  }
}

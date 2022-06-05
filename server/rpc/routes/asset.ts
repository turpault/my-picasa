import { writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { isVideo } from "../../../shared/lib/utils";
import { AlbumEntry } from "../../../shared/types/types";
import { entryFilePath } from "../../utils/serverUtils";
import {
  buildContext,
  destroyContext,
  encode,
  setOptions,
  transform
} from "../imageOperations/sharp-processor";
import { readPicasaIni } from "../rpcFunctions/picasaIni";

export async function asset(entry: AlbumEntry): Promise<string> {
  if (isVideo(entry)) {
    // Send the video pack as-is
    const path = entryFilePath(entry);
    return path;
  }

  const picasa = await readPicasaIni(entry.album);
  const options = picasa[entry.name] || {};

  const context = await buildContext(entry);
  if (options) {
    await setOptions(context, options);
  }
  if (options.filters) {
    await transform(context, options.filters);
  }
  const res = (await encode(context, "image/jpeg", "Buffer")) as {
    width: number;
    height: number;
    data: Buffer;
  };
  await destroyContext(context);
  const out = join(tmpdir(), entry.name);
  await writeFile(out, res.data);
  return out;
}

import { writeFile, stat } from "fs/promises";
import { join } from "path/posix";
import { AlbumEntry } from "../../../shared/types/types";
import { readPicasaIni } from "../rpcFunctions/picasaIni";
import {
  encode,
  buildContext,
  setOptions,
  transform,
  destroyContext,
} from "./sharp-processor";

export async function exportToFolder(entry: AlbumEntry, targetFolder: string) {
  const picasa = await readPicasaIni(entry.album);
  const options = picasa[entry.name] || {};
  const context = await buildContext(entry);

  await setOptions(context, options);

  if (options.filters) {
    await transform(context, options.filters!);
  }
  const res = (await encode(context)) as Buffer;
  await destroyContext(context);
  let targetFile = join(targetFolder, entry.name);
  let idx = 0;
  while (
    await stat(targetFile)
      .then(() => {
        targetFile = join(targetFolder, (idx++).toString() + ".jpg");
        return true;
      })
      .catch(() => {
        return false;
      })
  ) {}
  await writeFile(targetFile, res);
}

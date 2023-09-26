import { writeFile, stat, copyFile } from "fs/promises";
import { extname, join } from "path";
import {
  encode,
  buildContext,
  setOptions,
  transform,
  destroyContext,
  commit,
} from "./sharp-processor";
import { AlbumEntry } from "../../shared/types/types";
import { readAlbumIni } from "../rpc/rpcFunctions/picasa-ini";
import { isPicture, isVideo, namify } from "../../shared/lib/utils";
import { entryFilePath, safeWriteFile } from "../utils/serverUtils";

export async function exportToFolder(entry: AlbumEntry, targetFolder: string) {
  const picasa = await readAlbumIni(entry.album);
  const options = picasa[entry.name] || {};
  const targetFilename = namify(entry.album.name + "_" + entry.name);
  if (isVideo(entry)) {
    // Straight copy
    const ext = extname(entry.name);
    await copyFile(
      entryFilePath(entry),
      join(targetFolder, targetFilename + ext)
    );
  } else if (isPicture(entry)) {
    const context = await buildContext(entry);

    await setOptions(context, options);

    if (options.filters) {
      await transform(context, options.filters!);
    }
    await commit(context);
    const res = (await encode(context)).data as Buffer;
    await destroyContext(context);
    let targetFile = join(targetFolder, targetFilename);
    let idx = 0;
    while (
      await stat(targetFile)
        .then(() => {
          targetFile = targetFile + (idx ? "" : idx).toString() + ".jpg";
          idx++;
          return true;
        })
        .catch(() => {
          return false;
        })
    ) {}
    await safeWriteFile(targetFile, res);
  }
}

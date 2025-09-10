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
    let targetFileRoot = join(targetFolder, targetFilename);

    let idx = 0;
    let targetFile = targetFileRoot + ".jpg";
    while (
      await stat(targetFile)
        .then(() => {
          idx++;
          targetFile = targetFileRoot + "-" + idx.toString() + ".jpg";
          return true;
        })
        .catch(() => {
          return false;
        })
    ) { }
    await safeWriteFile(targetFile, res);
  }
}

export async function exportToSpecificFile(entry: AlbumEntry, targetFilePath: string) {
  const picasa = await readAlbumIni(entry.album);
  const options = picasa[entry.name] || {};
  
  if (isVideo(entry)) {
    // Straight copy
    await copyFile(entryFilePath(entry), targetFilePath);
  } else if (isPicture(entry)) {
    const context = await buildContext(entry);

    await setOptions(context, options);

    if (options.filters) {
      await transform(context, options.filters!);
    }
    await commit(context);
    const res = (await encode(context)).data as Buffer;
    await destroyContext(context);
    
    await safeWriteFile(targetFilePath, res);
  }
}

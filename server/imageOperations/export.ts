import { copyFile, utimes } from "fs/promises";
import { extname, join } from "path";
import { RESIZE_ON_EXPORT_SIZE } from "../../shared/lib/shared-constants";
import { isPicture, isVideo, namifyAlbumEntry } from "../../shared/lib/utils";
import { AlbumEntry } from "../../shared/types/types";
import { getPicasaEntry } from "../rpc/rpcFunctions/picasa-ini";
import { entryFilePath, fileExists, mediaName, safeWriteFile } from "../utils/serverUtils";
import { addImageInfo } from "./info";
import {
  buildImage
} from "./sharp-processor";
import { ThumbnailSizes } from "../utils/constants";


const originDate = new Date(1900, 0, 1);
function albumNameToDate(name: string): Date {
  let [y, m, d] = name
    .split(" ")[0]
    .split("-")
    .map((v) => parseInt(v));
  if (y < 1900) {
    y = 1900;
  }
  if (y > 3000 || y < 1800 || Number.isNaN(y)) {
    // No date information, return an old date
    return originDate;
  }

  // Month are 1-based in the input string, but 0-based in the Date object
  if (m === undefined || m < 1 || m > 12 || Number.isNaN(m)) {
    m = 0;
  } else {
    m--;
  }
  // Day are 1-based in the input string, but 0-based in the Date object
  if (d === undefined || d < 1 || d > 31 || Number.isNaN(d)) {
    d = 1;
  } else {
    d--;
  }
  return new Date(y, m, d, 12);
}


export async function exportToFolder(entry: AlbumEntry, targetFolder: string, exportOptions?: { extraOperations?: any[], label?: boolean, filename?: string, resize?: number, filters?: string, overwrite?: boolean }): Promise<string> {
  const targetFilename = exportOptions?.filename || namifyAlbumEntry(entry);
  const label = exportOptions?.label || false;
  const filters = exportOptions?.filters || "";

  if (isVideo(entry)) {
    // Straight copy
    const ext = extname(entry.name);
    const targetFile = join(targetFolder, targetFilename + ext);
    const shouldOverwrite = exportOptions?.overwrite || false;
    const fileExistsCheck = shouldOverwrite ? Promise.resolve(false) : fileExists(targetFile);

    if (!(await fileExistsCheck)) {
      await copyFile(entryFilePath(entry), targetFile);
      const albumDate = albumNameToDate(entry.album.name);
      await utimes(targetFile, albumDate, albumDate);
    }

    return targetFile;
  } else if (isPicture(entry)) {
    const targetFile = join(targetFolder, targetFilename + '.jpg');
    const shouldOverwrite = exportOptions?.overwrite || false;
    const fileExistsCheck = shouldOverwrite ? Promise.resolve(false) : fileExists(targetFile);

    if (!(await fileExistsCheck)) {
      const imageLabel = mediaName(entry);
      const [entryMeta] = await Promise.all([getPicasaEntry(entry)]);
      const transform = entryMeta.filters || "";
      // Build transformation string with proper conditional concatenation
      const parts: string[] = [];
      if (exportOptions?.resize) {
        parts.push(`compress=1,${exportOptions?.resize},`);
      }
      if (transform) {
        parts.push(`${transform}`);
      }
      if (filters) {
        parts.push(`${filters}`);
      }
      if (label) {
        parts.push(`label=1,${encodeURIComponent(imageLabel)},25,south`);
      }
      const transformations = parts.join(";");

      const res = await buildImage(
        entry,
        entryMeta,
        transformations,
        exportOptions?.extraOperations,
      );
      let dateTimeOriginal = entryMeta.dateTaken ? new Date(entryMeta.dateTaken) : albumNameToDate(entry.album.name);
      if (dateTimeOriginal < originDate) {
        dateTimeOriginal = originDate;
      }
      const imageData = addImageInfo(res.data, {
        softwareInfo: "PICISA",
        imageDescription: entry.album.name,
        dateTaken: dateTimeOriginal,
      });

      await safeWriteFile(targetFile, imageData);
      // Parallelize file write and utimes operations
      await utimes(targetFile, dateTimeOriginal, dateTimeOriginal).catch((e) => {
        console.error(`Failed to update file times for ${targetFile}:`, e);
      })

    }
    return targetFile;
  }

  // This should never be reached, but TypeScript requires a return statement
  throw new Error(`Unsupported file type for entry: ${entry.name}`);
}

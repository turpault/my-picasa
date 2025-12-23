import { readFile } from "fs/promises";
import { join } from "path";
import { isPicture, isVideo, removeDiacritics } from "../../shared/lib/utils";
import {
  AlbumEntry,
  AlbumEntryMetaData,
  AlbumEntryWithMetadata,
  Filetype,
  idFromKey,
} from "../../shared/types/types";
import { getExifData, getFileStats } from "../rpc/rpcFunctions/exif";
import {
  getPicasaEntry,
  updatePicasaEntry,
} from "../rpc/rpcFunctions/picasa-ini";
import { pathForAlbumEntry, safeWriteFile } from "../utils/serverUtils";
import { TagValues, dump, insert, load } from "./piexif/index";
import {
  buildContext,
  destroyContext,
  encode,
  setOptions,
  transform,
} from "./sharp-processor";

export async function imageInfo(
  entry: AlbumEntry,
  metadata?: AlbumEntryMetaData,
): Promise<AlbumEntryWithMetadata> {
  metadata ||= await getPicasaEntry(entry);
  const options = metadata;
  const res: AlbumEntryWithMetadata = {
    ...entry,
    meta: { transform: "", type: Filetype.Picture, width: 0, height: 0 },
  };
  if (isVideo(entry)) {
    res.meta.type = Filetype.Video;
  } else if (isPicture(entry)) {
    res.meta.type = Filetype.Picture;

    const [exifData, stats] = await Promise.all([getExifData(entry), getFileStats(entry)]);
    if (exifData) {
      // Fix dateTaken from exif, if available
      let dateTaken =
        exifData.DateTimeOriginal ||
        exifData.CreateDate ||
        exifData.ModifyDate ||
        (stats && stats.mtime);
      if (dateTaken && dateTaken instanceof Date) {
        dateTaken = dateTaken.toISOString();
      }

      if (dateTaken && dateTaken !== metadata.dateTaken) {
        updatePicasaEntry(entry, "dateTaken", dateTaken);
        metadata.dateTaken = dateTaken;
      }
    }
    if (
      options.dimensions &&
      options.dimensionsFromFilter === options.filters
    ) {
      const [w, h] = options.dimensions.split("x");
      res.meta.width = parseInt(w);
      res.meta.height = parseInt(h);
    } else {
      const context = await buildContext(entry);
      await setOptions(context, options);
      if (options.filters) {
        await transform(context, options.filters!);
      }
      try {
        const encoded = await encode(context);
        res.meta.width = encoded.width;
        res.meta.height = encoded.height;
        await Promise.all([
          updatePicasaEntry(entry, "dimensions", `${encoded.width}x${encoded.height}`),
          updatePicasaEntry(entry, "dimensionsFromFilter", options.filters),
        ]);
      } catch (e) {
        console.error(
          "Error getting image info for file",
          pathForAlbumEntry(entry),
          e,
        );
      } finally {
        await destroyContext(context);
      }
    }
    res.meta.transform = options.filters;
  }
  return res;
}

export function entryRelativePath(entry: AlbumEntry): string {
  return join(idFromKey(entry.album.key).id, entry.name);
}

export function addImageInfo(
  image: Buffer,
  value: { softwareInfo: string; imageDescription: string, dateTaken?: Date },
): Buffer {
  const imageStr = image.toString("binary");
  const exif = load(imageStr);
  exif["0th"] = {
    ...exif["0th"],
    [TagValues.ImageIFD.ProcessingSoftware]: value.softwareInfo,
    [TagValues.ImageIFD.ImageDescription]: removeDiacritics(
      `${value.softwareInfo}: ${value.imageDescription}`,
    ),
  };
  if (value.dateTaken) {
    exif["Exif"] = {
      ...exif["Exif"],
      [TagValues.ExifIFD.DateTimeOriginal]: value.dateTaken.toISOString(),
      [TagValues.ExifIFD.DateTimeDigitized]: value.dateTaken.toISOString(),
    };
  }
  var exifStr = dump(exif);
  return Buffer.from(insert(exifStr, imageStr), "binary");
}

export async function updateImageDate(fileName: string, time: Date) {
  const imageStr = (await readFile(fileName)).toString("binary");
  const exif = load(imageStr);
  exif["Exif"] = {
    ...exif["Exif"],
    [TagValues.ExifIFD.DateTimeOriginal]: time.toISOString(),
    [TagValues.ExifIFD.DateTimeDigitized]: time.toISOString(),
  };
  var exifStr = dump(exif);
  await safeWriteFile(
    fileName,
    Buffer.from(insert(exifStr, imageStr), "binary"),
  );
}

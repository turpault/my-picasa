import { readFile } from "fs/promises";
import { join } from "path";
import { isPicture, isVideo, removeDiacritics } from "../../shared/lib/utils";
import {
  AlbumEntry,
  AlbumEntryWithMetadata,
  Filetype,
  idFromKey,
} from "../../shared/types/types";
import { exifDataAndStats } from "../rpc/rpcFunctions/exif";
import {
  readAlbumIni,
  updatePicasaEntries,
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
): Promise<AlbumEntryWithMetadata> {
  const picasa = await readAlbumIni(entry.album);
  const options = picasa[entry.name] || {};
  const res: AlbumEntryWithMetadata = {
    ...entry,
    raw: options,
    meta: { transform: "", type: Filetype.Picture, width: 0, height: 0 },
  };
  if (isVideo(entry)) {
    res.meta.type = Filetype.Video;
  } else if (isPicture(entry)) {
    res.meta.type = Filetype.Picture;

    const exif = await exifDataAndStats(entry);
    if (exif) {
      // Fix dateTaken from exif, if available
      let dateTaken =
        exif.tags.DateTimeOriginal ||
        exif.tags.CreateDate ||
        exif.tags.ModifyDate ||
        (exif.stats && exif.stats.mtime);
      if (dateTaken && dateTaken instanceof Date) {
        dateTaken = dateTaken.toISOString();
      }

      if (dateTaken && dateTaken !== res.raw.dateTaken) {
        updatePicasaEntry(entry, "dateTaken", dateTaken);
        res.raw.dateTaken = dateTaken;
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
        updatePicasaEntries(entry, {
          dimensions: `${encoded.width}x${encoded.height}`,
          dimensionsFromFilter: options.filters,
        });
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
  value: { softwareInfo: string; imageDescription: string },
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

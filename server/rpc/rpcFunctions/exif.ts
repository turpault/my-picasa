import exifr from "exifr";
import { Stats } from "fs";
import { readFile, stat } from "fs/promises";
import { lock } from "../../../shared/lib/mutex";
import { isPicture, isVideo } from "../../../shared/lib/utils";
import { AlbumEntry } from "../../../shared/types/types";
import { dimensionsFromFileBuffer } from "../../imageOperations/sharp-processor";
import { entryFilePath } from "../../utils/serverUtils";
import { getPicasaEntry, updatePicasaEntry } from "./picasa-ini";

export async function exifDataAndStats(
  entry: AlbumEntry,
): Promise<{ stats: Stats; tags: any }> {
  const path = entryFilePath(entry);
  const [s, t] = await Promise.all([stat(path), exifData(entry)]);
  const tags = t || {};

  return {
    stats: s,
    tags: { ...tags.image, ...tags.gps, ...tags.exif, ...tags },
  };
}

export function toExifDate(isoDate: string) {
  // exif is YYYY:MM:DD HH:MM:SS
  // iso is YYYY-MM-DDTHH:mm:ss.sssZ
  return `${isoDate.slice(0, 4)}:${isoDate.slice(5, 7)}:${isoDate.slice(
    8,
    10,
  )} ${isoDate.slice(11, 13)}:${isoDate.slice(14, 16)}:${isoDate.slice(
    17,
    19,
  )}`;
}

const exifTags = Object.fromEntries(
  [
    "ApertureValue",
    "BrightnessValue",
    "ColorSpace",
    "ComponentsConfiguration",
    "CreateDate",
    "DateTimeOriginal",
    "DigitalZoomRatio",
    "DigitalZoomRatio",
    "ExifImageHeight",
    "ExifImageWidth",
    "ExifVersion",
    "ExposureMode",
    "ExposureMode",
    "ExposureProgram",
    "ExposureTime",
    "FileSource",
    "Flash",
    "FlashpixVersion",
    "FNumber",
    "FocalLength",
    "GPSAltitude",
    "GPSImgDirection",
    "GPSImgDirectionRef",
    "GPSLatitude",
    "GPSLatitudeRef",
    "GPSLongitude",
    "GPSLongitudeRef",
    "GPSTimeStamp",
    "ImageUniqueID",
    "ISO",
    "latitude",
    "LightSource",
    "longitude",
    "Make",
    "MeteringMode",
    "Model",
    "ModifyDate",
    "Orientation",
    "ResolutionUnit",
    "SceneCaptureType",
    "SceneType",
    "SensingMethod",
    "ShutterSpeedValue",
    "Software",
    "SubjectArea",
    "SubSecTimeDigitized",
    "SubSecTimeOriginal",
    "WhiteBalance",
    "XResolution",
    "YResolution",
  ].map((k) => [k, true]),
);
function filterExifTags(tags: any): any {
  const filtered: { [tag: string]: any } = {};
  for (const key in tags) {
    if (tags[key] && exifTags[key]) {
      filtered[key] = tags[key];
    } else {
      // console.warn("Tag not included in exif: " + key);
    }
  }
  return filtered;
}

export async function exifData(
  entry: AlbumEntry,
  withStats = true,
): Promise<any> {
  const picasaEntry = await getPicasaEntry(entry);
  let exif: any;
  if (isPicture(entry)) {
    const path = entryFilePath(entry);
    const r = await lock(`exifData/${path}`);
    try {
      if (picasaEntry.exif) {
        try {
          exif = JSON.parse(picasaEntry.exif);
        } catch (e) {
          console.error(
            `Exception while parsing exif for ${path}: ${e}, will get exif data from file`,
          );
        }
      }
      if (!exif) {
        const fileData = await readFile(path);
        const tags = await exifr.parse(fileData).catch((e: any) => {
          console.error(`Exception while reading exif for ${path}: ${e}`);
          exif = {};
        });
        const dimensions = dimensionsFromFileBuffer(fileData);
        const filtered = {
          ...filterExifTags(tags || {}),
          imageWidth: dimensions.width,
          imageHeight: dimensions.height,
        };
        exif = filtered;
        updatePicasaEntry(entry, "exif", JSON.stringify(filtered));
      }
    } finally {
      r();
    }
  } else if (isVideo(entry)) {
    exif = {};
  }
  if (withStats) {
    const path = entryFilePath(entry);
    const stats = await stat(path);
    exif = { ...exif, ...stats };
  }
  // Not a video or picture
  return exif;
}

import exifr from "exifr";
import { Stats } from "fs";
import { stat } from "fs/promises";
import { isPicture, isVideo, lock } from "../../../shared/lib/utils";
import { AlbumEntry } from "../../../shared/types/types";
import { dimensionsFromFile as dimensionsFromFileBuffer } from "../../imageOperations/sharp-processor";
import { entryFilePath } from "../../utils/serverUtils";
import { readPicasaEntry, updatePicasaEntry } from "./picasaIni";

export async function exifDataAndStats(
  entry: AlbumEntry
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
    10
  )} ${isoDate.slice(11, 13)}:${isoDate.slice(14, 16)}:${isoDate.slice(
    17,
    19
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
  ].map((k) => [k, true])
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

export async function exifData(entry: AlbumEntry): Promise<any> {
  const picasaEntry = await readPicasaEntry(entry);
  if (isPicture(entry)) {
    const path = entryFilePath(entry);
    const r = await lock(`exifData/${path}`);
    try {
      const stats = await stat(path);
      if (picasaEntry.exif) {
        return { ...JSON.parse(picasaEntry.exif), ...stats };
      }
      console.info(`Read exif from ${path}`);
      const tags = await exifr.parse(path).catch((e: any) => {
        console.error(`Exception while reading exif for ${path}: ${e}`);
        return {};
      });
      const dimensions = await dimensionsFromFileBuffer(path);
      const filtered = {
        ...filterExifTags(tags || {}),
        imageWidth: dimensions.width,
        imageHeight: dimensions.height,
      };
      updatePicasaEntry(entry, "exif", JSON.stringify(filtered));

      return { ...filtered, ...stats };
    } finally {
      r();
    }
  } else if (isVideo(entry)) {
    const path = entryFilePath(entry);
    const stats = await stat(path);
    // no tags yet
    return { ...stats };
  }
  // Not a video or picture
  return {};
}

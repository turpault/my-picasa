import { watch } from "fs";
import { mkdir, readFile } from "fs/promises";
import { isMediaUrl, sleep } from "../../shared/lib/utils";
import { AlbumEntry } from "../../shared/types/types";
import { isIdle } from "../utils/busy";
import { imagesRoot } from "../utils/constants";
import { fileExists, safeWriteFile } from "../utils/serverUtils";
import { exifData } from "../rpc/rpcFunctions/exif";
import { media } from "../rpc/rpcFunctions/albumUtils";
import {
  getPicasaEntry,
  updatePicasaEntry,
} from "../rpc/rpcFunctions/picasa-ini";
import { getFolderAlbums, waitUntilWalk } from "../walker";

const cacheFolder = `${imagesRoot}/.cacheGeoLocation`;
const precision = 0.0001;

export type GeoInfo = {
  number: string;
  address: string;
  city: string;
  country: string;
  countryCode: string;
  displayNameEn: string;
  displayNameFr: string;
};

async function geoInfo(latitude: number, longitude: number): Promise<GeoInfo> {
  const fromCache = await geoLocationFromCache(latitude, longitude);
  if (fromCache) {
    return fromCache;
  }
  let geoInfo: GeoInfo | undefined = undefined;
  const providers = [
    geoInfoGeoCode,
    geoInfoFromGeocodeXYZ,
    geoInfoFromGoogle,
    geoInfoFromNomatim,
  ];
  for (const provider of providers) {
    try {
      geoInfo = await provider(latitude, longitude);
    } catch (e) {}
    if (geoInfo) {
      break;
    }
  }
  if (geoInfo) {
    await writeGeoLocationToCache(latitude, longitude, geoInfo);
    return geoInfo;
  }
  throw new Error("No geo info found");
}

async function geoLocationFromCache(latitude: number, longitude: number) {
  const lat = Math.round(latitude / precision) * precision;
  const lon = Math.round(longitude / precision) * precision;
  const filename = `${cacheFolder}/${lat}_${lon}.json`;
  if (await fileExists(filename)) {
    const data = await readFile(filename);
    return JSON.parse(data.toString());
  }
}

async function writeGeoLocationToCache(
  latitude: number,
  longitude: number,
  data: any
) {
  const lat = Math.round(latitude / precision) * precision;
  const lon = Math.round(longitude / precision) * precision;
  const filename = `${cacheFolder}/${lat}_${lon}.json`;
  await mkdir(cacheFolder, { recursive: true });
  await safeWriteFile(filename, JSON.stringify(data));
}

async function geoInfoFromGoogle(
  latitude: number,
  longitude: number
): Promise<GeoInfo> {
  const apiKey = "AIzaSyDU5eZpGt84Gdn0T3DLluwL0Z9XjG8CeSw";
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`;
  function valueFromType(data: any, type: string) {
    const component = data.results[0]!.address_components?.find((c: any) =>
      c.types.includes(type)
    );
    return component ? component.long_name : undefined;
  }
  const geo = await fetch(url)
    .then((response) => response.json())
    .then((data) => {
      if (!data || !data.results || !data.results[0])
        throw new Error("No data");
      return data;
    })
    .then((data) => ({
      number: valueFromType(data, "street_number"),
      address: valueFromType(data, "route"),
      city: valueFromType(data, "postal_town"),
      country: valueFromType(data, "country"),
      countryCode: valueFromType(data, "country"),
      displayNameEn: data.results[0].formatted_address,
      displayNameFr: data.results[0].formatted_address,
    }));
  return geo;
}

async function geoInfoGeoCode(
  latitude: number,
  longitude: number
): Promise<GeoInfo> {
  const url = `https://geocode.maps.co/reverse?lat=${latitude}&lon=${longitude}`;
  const geo = await fetch(url)
    .then((response) => response.json())
    .then((data) => ({
      number: data.address.house_number,
      address: data.address.road,
      city: data.address.city,
      countryCode: data.address.country_code,
      country: data.address.country,
      displayNameEn: data.display_name,
      displayNameFr: data.display_name,
    }));
  return geo;
}

function geoInfoFromNomatim(
  latitude: number,
  longitude: number
): Promise<GeoInfo> {
  const nomatimServer = "http://home.turpault.me:2001/nominatim";
  const url = `${nomatimServer}/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`;
  return fetch(url).then((response) => response.json());
}

function geoInfoFromGeocodeXYZ(
  latitude: number,
  longitude: number
): Promise<GeoInfo> {
  const url = `https://geocode.xyz/${latitude},${longitude}?json=1`;
  return fetch(url)
    .then((response) => response.json())
    .then((data) => ({
      number: data.stnumber,
      address: data.staddress,
      city: data.city,
      country: data.country,
      countryCode: data.country,
      displayNameEn: data.poi.name_en,
      displayNameFr: data.poi.name_fr,
    }));
}

export async function buildGeolocation(exitOnComplete: boolean) {
  await mkdir(cacheFolder, { recursive: true });

  await waitUntilWalk();
  let lastFSChange = new Date().getTime();
  watch(imagesRoot, { recursive: true }, (_eventType, filename) => {
    if (filename && isMediaUrl(filename) && !filename.startsWith(".")) {
      lastFSChange = new Date().getTime();
    }
  });

  while (true) {
    const albums = await getFolderAlbums();
    for (const album of albums.reverse()) {
      let m: { entries: AlbumEntry[] };
      try {
        m = await media(album);
      } catch (e) {
        // Yuck folder is gone...
        continue;
      }
      for (const entry of m.entries) {
        while (!isIdle()) {
          await sleep(1);
        }
        const info = await getPicasaEntry(entry);
        if (info.geoPOI === undefined) {
          const exif = await exifData(entry);

          const {
            GPSLatitude,
            GPSLatitudeRef,
            GPSLongitudeRef,
            GPSLongitude,
          } = exif;

          if (
            GPSLatitude &&
            GPSLatitudeRef &&
            GPSLongitudeRef &&
            GPSLongitude
          ) {
            const latitude =
              (GPSLatitudeRef === "N" ? 1 : -1) *
              (GPSLatitude[0] + GPSLatitude[1] / 60 + GPSLatitude[2] / 3600);
            const longitude =
              (GPSLongitudeRef === "E" ? 1 : -1) *
              (GPSLongitude[0] + GPSLongitude[1] / 60 + GPSLongitude[2] / 3600);
            try {
              const geoPOI = await geoInfoFromGoogle(latitude, longitude);
              updatePicasaEntry(entry, "geoPOI", JSON.stringify(geoPOI));
            } catch (e) {
              console.log("Error geolocating", entry.name, e);
            }
          } else {
            updatePicasaEntry(entry, "geoPOI", JSON.stringify({}));
          }
        }
      }
    }
    if (exitOnComplete) {
      break;
    }
    await sleep(20);
    const now = new Date().getTime();
    while (true) {
      await sleep(1);
      if (lastFSChange > now) break;
    }
  }
}

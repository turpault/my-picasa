import { Folder } from "./folder-monitor.js";
import { readPictureWithTransforms } from "./imageProcess/client.js";
import ini from "./lib/ini.js";
import Jimp from "./lib/jimp/jimp.js";

export type PicasaFileMeta = {
  star?: boolean;
  rotate?: string; // f.e. rotate(angle)
  faces?: string; // f.e. rect64(5a6b0000c28ab778),42d7ff00b9602bb9
  crop?: string; // f.e. rect64(5a491bc4dd659056)
  filters?: string; // crop64=1,5a491bc4dd659056;enhance=1;finetune2=1,0.000000,0.000000,0.190877,00000000,0.000000;autolight=1;tilt=1,-0.233232,0.000000;crop64=1,1ef60000fe77df8d;fill=1,0.448598;autolight=1;fill=1,0.177570;finetune2=1,0.000000,0.000000,0.235789,00000000,0.000000;
};

export type ImageFileMeta = {
  thumbnail?: string; // From the .thumbnails file
};

export type PicasaFolderMeta = {
  [name: string]: PicasaFileMeta;
};
export type ImageFolderMeta = {
  [name: string]: ImageFileMeta;
};

const folderMap: Map<
  string,
  Promise<{ picasa: PicasaFolderMeta; image: ImageFolderMeta }>
> = new Map();
let dirtyPicasaMap: Map<any, PicasaFolderMeta> = new Map();
let dirtyImageMap: Map<any, ImageFolderMeta> = new Map();

setInterval(async () => {
  const d = dirtyPicasaMap;
  dirtyPicasaMap = new Map();
  d.forEach(async (value, key) => {
    const iniHandleWrite = await key.getFileHandle(".picasa.ini", {
      create: true,
    });
    const writable = await iniHandleWrite.createWritable();
    const asIni = ini.encode(value);
    await writable.write(asIni);
    await writable.close();
  });
  const i = dirtyImageMap;
  dirtyImageMap = new Map();
  i.forEach(async (value, key) => {
    const iniHandleWrite = await key.getFileHandle(".thumbnails.ini", {
      create: true,
    });
    const writable = await iniHandleWrite.createWritable();
    const asIni = ini.encode(value);
    await writable.write(asIni);
    await writable.close();
  });
}, 10000);
export async function getFolderInfo(
  f: Folder
): Promise<{ picasa: PicasaFolderMeta; image: ImageFolderMeta }> {
  if (!folderMap.has(f.key)) {
    folderMap.set(
      f.key,
      (async () => {
        try {
          const [picasa, image] = await Promise.all([
            f.handle
              .getFileHandle(".picasa.ini")
              .then((handle: any) => getFileContents(handle, "string"))
              .then((data: string) => ini.decode(data) as PicasaFolderMeta)
              .catch(() => ({})),
            f.handle
              .getFileHandle(".thumbnails.ini")
              .then((handle: any) => getFileContents(handle, "string"))
              .then((data: string) => ini.decode(data) as ImageFolderMeta)
              .catch(() => ({})),
          ]);

          // Add missing pictures
          for (const p of f.pictures) {
            if (!picasa[p.name]) {
              picasa[p.name] = {};
              dirtyPicasaMap.set(f.handle, picasa);
            }
            if (!image[p.name]) {
              image[p.name] = {};
              dirtyImageMap.set(f.handle, image);
            }
          }
          return { picasa, image };
        } catch (e) {
          console.error("Cannot decode ini file: ", e);
          return { picasa: {}, image: {} };
        }
      })()
    );
  }
  return folderMap.get(f.key)!;
}

export async function thumbnail(f: Folder, name: string): Promise<string> {
  const info = await getFolderInfo(f);
  if (!info.image[name].thumbnail) {
    const info = await getFolderInfo(f);
    const fileMeta = info.picasa[name];
    const img = await f.handle.getFileHandle(name);

    const image = await readPictureWithTransforms(img, info.picasa[name], [
      ["scaleToFit", 256, 256, Jimp.RESIZE_NEAREST_NEIGHBOR],
    ]);

    info.image[name].thumbnail = image;

    // make dirty
    dirtyImageMap.set(f.handle, info.image);
  }
  return info.image[name].thumbnail!;
}

export async function getFileContents(
  fh: any,
  format: "base64" | "buffer" | "string" = "base64"
): Promise<string | ArrayBuffer> {
  const file = await fh.getFile();
  let reader = new FileReader();
  if (format === "base64") {
    reader.readAsDataURL(file);
  } else if (format === "buffer") {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file);
  }

  return new Promise<string | ArrayBuffer>((resolve, reject) => {
    reader.onload = function () {
      if (reader.result === null) {
        reject(new Error("Empty"));
      } else {
        resolve(reader.result);
      }
    };
    reader.onerror = function () {
      reject(reader.error);
    };
  });
}

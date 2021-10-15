import { getFileContents, PicasaFileMeta } from "../folder-utils.js";
import Jimp from "../lib/jimp/jimp.js";

async function readPictureWithTransforms(
  fh: any,
  options: PicasaFileMeta,
  extraOperations: any[]
): Promise<string> {
  const data = await getFileContents(fh, "buffer");

  const j = await Jimp.read(data);
  const crop = decodeRect(options.crop);
  if (crop) {
    j.crop(crop.x, crop.y, crop.width, crop.height);
  }
  if (extraOperations) {
    for (const op of extraOperations) {
      j[op[0]](...op.slice(1));
    }
  }

  const t = await j.getBase64Async("image/jpeg");

  return t;
}

function decodeRect(
  rect: string | undefined
): { x: number; y: number; width: number; height: number } | undefined {
  if (!rect) {
    return undefined;
  }
  const rectData = rect.match(/rect64\(([0-9a-f]{4}){4}\)/);
  if (rectData && rectData.groups) {
    return {
      x: parseInt(rectData.groups[0], 16),
      y: parseInt(rectData.groups[1], 16),
      width: parseInt(rectData.groups[2], 16),
      height: parseInt(rectData.groups[3], 16),
    };
  }
  return undefined;
}

onmessage = (e: { data: any[] }) => {
  console.log("Worker: Message received from main script");
  const t = `${e.data[1]}/${e.data[0]}`;
  console.time(t);
  switch (e.data[1]) {
    case "readPictureWithTransforms":
      readPictureWithTransforms(e.data[2], e.data[3], e.data[4])
        .then((res) => {
          console.timeEnd(t);
          postMessage([e.data[0], { res }]);
        })
        .catch((error) => {
          console.timeEnd(t);
          console.warn(t, error);
          postMessage([e.data[0], { error }]);
        });
      break;
  }
};

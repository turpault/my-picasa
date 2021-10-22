import { getFileContents } from "../lib/file.js";
import Jimp from "../lib/jimp/jimp.js";
import { Queue } from "../lib/queue.js";
import { decodeOperations, decodeRect } from "../lib/utils.js";
import { PicasaFileMeta } from "../types/types.js";

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

const contexts = new Map<string, any>();
let id = 0;
async function buildContext(fh: any): Promise<string> {
  const data = await getFileContents(fh, "buffer");
  const j = await Jimp.read(data);
  const key = (++id).toString();
  contexts.set(key, j);
  return key;
}

/*
# Here is a list of valid filter identifiers
#
#|--Identifier-|--------------Parameters-------------|----------Description-----------|---------Example---------------|-- Done--|
#| crop64      |  CROP_RECTANGLE*                    |   crop filter, crops the image | crop64=1,30a730d2bf1ab897     | X
#|             |                                     |    according to crop rectangle |                               |
#| tilt        | !TILT_ANGLE,!SCALE                  |  tilts and scales image        | tilt=1,0.280632,0.000000      | X
#| redeye      |                                     |  redeye removal                | redeye=1                      |
#| enhance     |                                     | "I'm feeling lucky" enhancement| enhance=1                     |
#| autolight   |                                     | automatic contrast correction  | autolight=1                   |
#| autocolor   |                                     | automatic color correction     | autocolor=1                   | X
#| retouch     |                                     | retouch                        | retouch=1                     | ?
#| finetune2   | (unidentified params)               | finetuning (brightness,        | finetune2=1,0.000000,0.000000,|
#|             |                                     |highlights, shadows,color temp) | 0.000000,fff7f5f3,0.000000;   |
#| unsharp2    | !AMOUNT                             | unsharp mask filter            | unsharp2=1,0.600000;          |
#| sepia       |                                     | sepia filter (no params)       | sepia=1                       |
#| bw          |                                     | black/white filter (no params) | bw=1                          |
#| warm        |                                     | warming filter (no params)     | bw=1                          |
#| grain2      |                                     | film grain filter (no params)  | grain2=1                      |
#| tint        |!!PRESERVE_COLOR ,#TINT COLOR        | tint filter                    | tint=1,79.842102,ffff         |
#| sat         |!SATURATION                          | saturation filter              | sat=1,0.161800;               |
#| radblur     |!MOUSE_X,!MOUSE_Y,!SIZE,!AMOUNT      | radial blur                    | radblur=1,0.500000,0.500000,  |
#|             |                                     |                                | 0.239766,0.146199;            |
#| glow2       |!INTENSITY,!!RADIUS                  | glow effect                    | glow2=1,0.650000,3.000000;    |
#| ansel       |#COLOR                               | filtered black/white           | ansel=1,ffffffff;             |
#| radsat      |!MOUSE_X,!MOUSE_Y,!RADIUS,!SHARPNESS | radial saturation              | radsat=1,0.421652,0.594697,   |
#|             |                                     |                                | 0.333333,0.309942;            |
#| dir_tint    |!MOUSE_X,!MOUSE_Y,!GRADIENT,!SHADOW  | directed gradient              | dir_tint=1,0.306743,0.401515, |
#|             |                                     |                                | 0.250000,0.250000,ff5bfff3;   |
# LEGEND:
# ! = float between 0 and 1, precision:6
# !! = float with arbitrary range, precision:6
# # = 32-bit color in hex notation, e.g.: fff7f5f3
# [] = crop rectangle
*/

async function transform(
  context: string,
  transformation: string
): Promise<string> {
  const j = contexts.get(context);
  // Transform is <cmd>=arg,arg;<cmd>...
  const operations = decodeOperations(transformation);
  for (const { name, args } of operations) {
    switch (name) {
      case "sepia":
        j.sepia();
        break;
      case "crop64":
        const crop = decodeRect(args[1]);
        if (crop) {
          j.crop(crop.x, crop.y, crop.width, crop.height);
        }
        break;
      case "bw":
        j.greyscale();
        break;
      case "tilt":
        const angle = parseInt(args[1]);
        const scale = parseInt(args[2]);
        j.scale(scale);
        j.rotate(180 * angle/Math.PI, false);
        break;
      case "finetune2":
        const brightness = parseFloat(args[1]);
        const highlights = parseFloat(args[2]);
        const shadows = parseFloat(args[3]);
        const temp = parseFloat(args[4]);
        const what = parseFloat(args[5]);
        debugger;
        break;
      case "autocolor":
        j.normalize();
        break;
      default:
        debugger;
        break;
    }
  }
  return context;
}

async function cloneContext(context: string): Promise<string> {
  const j = contexts.get(context);
  const key = (++id).toString();
  contexts.set(key, j.clone());
  return key;
}

async function destroyContext(context: string): Promise<void> {
  contexts.delete(context);
}

async function encode(
  context: string,
  mime: string = "image/jpeg"
): Promise<string | ImageData> {
  const j = contexts.get(context);
  if ((mime = "imagedata")) {
    const imageData = new ImageData(
      Uint8ClampedArray.from(j.bitmap.data),
      j.bitmap.width,
      j.bitmap.height
    );
    return imageData;
  }
  const t = await j.getBase64Async(mime);
  return t;
}

// Only process 2 pictures at any given time
const q = new Queue(2, { fifo: false });

function response(e: Promise<any>, data: any[]) {
  return e
    .then((res) => {
      postMessage([data[0], { res }]);
    })
    .catch((error) => {
      console.warn(data.join(","), error);
      postMessage([data[0], { error }]);
    });
}

onmessage = (e: { data: any[] }) => {
  console.log("Worker: Message received from main script");

  switch (e.data[1]) {
    case "readPictureWithTransforms":
      q.add(() =>
        response(
          (readPictureWithTransforms as Function)(...e.data.slice(2)),
          e.data
        )
      );
      break;
    case "buildContext":
      q.add(() =>
        response((buildContext as Function)(...e.data.slice(2)), e.data)
      );
      break;
    case "transform":
      q.add(() =>
        response((transform as Function)(...e.data.slice(2)), e.data)
      );
      break;
    case "encode":
      q.add(() => response((encode as Function)(...e.data.slice(2)), e.data));
      break;
    case "cloneContext":
      q.add(() =>
        response((cloneContext as Function)(...e.data.slice(2)), e.data)
      );
      break;
    case "destroyContext":
      q.add(() =>
        response((destroyContext as Function)(...e.data.slice(2)), e.data)
      );
      break;
  }
};

import { getFileContents } from "../lib/file.js";
import Jimp from "../lib/jimp/jimp.js";
import { Queue } from "../lib/queue.js";
import { decodeOperations, decodeRect } from "../lib/utils.js";

async function readPictureWithTransforms(
  fh: any,
  transforms: string,
  extraOperations: any[]
): Promise<string> {
  const context = await buildContext(fh);
  if (transforms) {
    await transform(context, transforms);
  }
  if (extraOperations) {
    await execute(context, extraOperations);
  }

  const t = await encode(context, "image/jpeg");
  destroyContext(context);

  return t as string;
}

const contexts = new Map<string, any>();
const options = new Map<string, any>();
const fonts = new Map<string, any>();

// Only process 2 pictures at any given time
const q = new Queue(2, { fifo: false });


async function getFont(name:string): Promise<any> {
  if(!fonts.has(name)) {
    const f = await Jimp.loadFont(`/resources/bitmapfonts/${name}.fnt`);
    fonts.set(name, f);
  }
  return fonts.get(name);
}

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
  context: string | any,
  transformation: string
): Promise<string> {
  const j = typeof context === "string" ? contexts.get(context) : context;
  // Transform is <cmd>=arg,arg;<cmd>...
  const operations = decodeOperations(transformation);
  for (const { name, args } of operations) {
    switch (name) {
      case "sepia":
        j.sepia();
        break;
      case "crop64":
        const crop = decodeRect(args[1]);
        const w = j.bitmap.width;
        const h = j.bitmap.height;
        if (crop) {
          j.crop(crop.left * w, crop.top * h, w * crop.right, h * crop.bottom);
        }
        break;
      case "bw":
        j.greyscale();
        break;
      case "tilt":
        const angle = parseInt(args[1]);
        const scale = parseInt(args[2]);
        if (scale !== 0) {
          debugger;
          j.scale(scale + 1);
        }
        j.rotate((10 * angle) / Math.PI, false);
        break;
      case "finetune2":
        const brightness = parseFloat(args[1]);
        const highlights = parseFloat(args[2]);
        const shadows = parseFloat(args[3]);
        const temp = parseFloat(args[4]);
        const what = parseFloat(args[5]);
        break;
      case "autocolor":
        j.normalize();
        break;
      case "Polaroid": {
        const angle = parseFloat(args[1]);
        const c = j.clone();
        const minDim = Math.min(j.bitmap.height, j.bitmap.width) * 0.9;
        c.cover(
          minDim,
          minDim,
          Jimp.HORIZONTAL_ALIGN_CENTER | Jimp.VERTICAL_ALIGN_MIDDLE
        );
        c.background(Jimp.cssColorToHex("#ffffff"));
        const newImage = await new Jimp(
          j.bitmap.width,
          j.bitmap.height,
          Jimp.cssColorToHex("#ffffff")
        );
        newImage.blit(
          c,
          newImage.bitmap.width / 20,
          newImage.bitmap.width / 20
        );
        const col =
          args[2].length > 6 ? args[2].slice(2) + args[2].slice(0, 2) : args[2];
        const bgng = Jimp.cssColorToHex(col);

        const imgOptions = options.get(context);
        if(imgOptions && imgOptions.caption) {
          const font = await getFont("polaroid");
          // load font from .fnt file
          newImage.print(font, newImage.bitmap.width *0.1, newImage.bitmap.height * 0.8, imgOptions.caption, newImage.bitmap.width * 0.8);
        }
        newImage.background(bgng);
        // ARGB to RGBA
        newImage.rotate(-angle, true);
        contexts.set(context, newImage);
        break;
      }
      default:
        break;
    }
  }
  return context;
}

async function execute(context: string, operations: string[][]): Promise<void> {
  const j = contexts.get(context);
  for (const op of operations) {
    j[op[0]](...op.slice(1));
  }
  return;
}


export async function setOptions(
  context: string,
  options: any
): Promise<void> {
  options.set(context, options);
  return;
}
async function cloneContext(context: string): Promise<string> {
  const j = contexts.get(context);
  const key = (++id).toString();
  contexts.set(key, j.clone());
  return key;
}

async function destroyContext(context: string): Promise<void> {
  q.event.once('drain', () => {
    contexts.delete(context);
  });
}

async function encode(
  context: string,
  mime: string = "image/jpeg"
): Promise<string | ImageData> {
  const j = contexts.get(context);
  if (mime === "raw") {
    let a = Uint8ClampedArray.from(j.bitmap.data);
    if (a.length > j.bitmap.width * j.bitmap.height * 4) {
      a = a.slice(0, j.bitmap.width * j.bitmap.height * 4);
    }
    const imageData = new ImageData(a, j.bitmap.width, j.bitmap.height);
    return imageData;
  }
  const t = await j.getBase64Async(mime);
  return t;
}


let reqId = 0;
function response(e: Promise<any>, data: any[]) {
  const msg = `${reqId++}: ${data[0]}(${data.slice(1).join(",")})`;
  console.time(msg);
  console.info(msg);
  return e
    .then((res) => {
      postMessage([data[0], { res }]);
    })
    .catch((error) => {
      console.warn(msg, error);
      postMessage([data[0], { error }]);
    })
    .finally(() => console.timeEnd(msg));
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
    case "execute":
      q.add(() => response((execute as Function)(...e.data.slice(2)), e.data));
      break;
      case "setOptions":
        q.add(() => response((setOptions as Function)(...e.data.slice(2)), e.data));
        break;
    }
};

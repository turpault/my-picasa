import { readFile } from "fs/promises";
import { join } from "path";
import sharp, { Sharp } from "sharp";
import { decodeOperations, decodeRect, uuid } from "../../../shared/lib/utils";
import { AlbumEntry, PicasaFileMeta } from "../../../shared/types/types.js";
import { imagesRoot } from "../../utils/constants";

const contexts = new Map<string, Sharp>();
const options = new Map<string, PicasaFileMeta>();

function getContext(context: string): Sharp {
  const j = contexts.get(context);
  if (!j) {
    throw new Error("context not found");
  }
  return j;
}

function setContext(context: string, j: Sharp) {
  contexts.set(context, j);
}

export async function buildContext(entry: AlbumEntry): Promise<string> {
  const fileData = await readFile(
    join(imagesRoot, entry.album.key, entry.name)
  );
  const contextId = uuid();
  let s = sharp(fileData, { limitInputPixels: false }).rotate();
  contexts.set(contextId, s);
  return contextId;
}
export async function cloneContext(context: string): Promise<string> {
  const j = getContext(context);
  const contextId = uuid();
  setContext(contextId, j.clone());
  return contextId;
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
#| rotate      | angle (increments of 90)            | rotation (clockwise)           | 1,3                           |  New
#| mirror      |                                     | mirror                         | 1                             |  New
#| flip        |                                     | flip                           | 1                             |  New
# LEGEND:
# ! = float between 0 and 1, precision:6
# !! = float with arbitrary range, precision:6
# # = 32-bit color in hex notation, e.g.: fff7f5f3
# [] = crop rectangle
*/

export async function transform(
  context: string,
  transformation: string
): Promise<string> {
  // Transform is <cmd>=arg,arg;<cmd>...
  const operations = decodeOperations(transformation);
  for (const { name, args } of operations) {
    let j = getContext(context);
    switch (name) {
      case "sepia":
        j = j.recomb([
          [0.3588, 0.7044, 0.1368],
          [0.299, 0.587, 0.114],
          [0.2392, 0.4696, 0.0912],
        ]);
        break;
      case "rotate":
        await commit(context);
        j = getContext(context);
        let r: number;
        if (args[1] && (r = parseInt(args[1])) != 0) {
          j = j.rotate(-r * 90);
        }
        break;
      case "flip":
        j = j.flip();
        break;
      case "mirror":
        j = j.flop();
        break;
      case "crop64":
        const crop = decodeRect(args[1]);
        if (crop) {
          const { info } = await j.raw().toBuffer({ resolveWithObject: true });
          const w = info.width!;
          const h = info.height!;
          j = j.extract({
            left: Math.floor(crop.left * w),
            top: Math.floor(crop.top * h),
            width: Math.floor(w * (crop.right - crop.left)),
            height: Math.floor(h * (crop.bottom - crop.top)),
          });
        }
        break;
      case "bw":
        j.greyscale();
        break;
      case "tilt":
        const angle = parseInt(args[1]);
        const scale = parseInt(args[2]);
        if (scale !== 0) {
          const metadata = await j.metadata();
          const w = metadata.width!;
          const h = metadata.height;
          j = j.resize(Math.floor(w * (1 + scale)));
        }
        j = j.rotate((10 * angle) / Math.PI);
        break;
      case "finetune2":
        const brightness = parseFloat(args[1] || "0");
        const highlights = parseFloat(args[2] || "0");
        const shadows = parseFloat(args[3] || "0");
        const temp = args[4];
        const what = parseFloat(args[5] || "0");
        const modulate: {
          brightness?: number | undefined;
          saturation?: number | undefined;
          hue?: number | undefined;
          lightness?: number | undefined;
        } = {};
        let doModulate = false;
        modulate.brightness = 1 + brightness - shadows;
        modulate.lightness = highlights;
        if (modulate.brightness || modulate.lightness) {
          j = j.modulate(modulate);
        }
        if (what) {
          j = j.composite([
            {
              input: {
                create: {
                  width: 10,
                  height: 10,
                  channels: 4,
                  background:
                    "#" +
                    temp +
                    Math.floor(what * 255)
                      .toString(16)
                      .padStart(2, "0"),
                },
              },
              tile: true,
              blend: "multiply",
            },
          ]);
        }

        break;
      case "autocolor":
        j = j.normalize();
        break;
      case "Polaroid": {
        const angle = parseFloat(args[1]);
        let c = j.clone();
        const metadata = await c.metadata();
        const w = metadata.width!;
        const h = metadata.height!;
        const maxDim = Math.floor(Math.min(w, h) * 0.9);
        c = c.resize(maxDim, maxDim, { fit: "cover" });
        let newImage = sharp({
          create: {
            width: w,
            /** Number of pixels high. */
            height: h,
            /** Number of bands e.g. 3 for RGB, 4 for RGBA */
            channels: 4,
            /** Parsed by the [color](https://www.npmjs.org/package/color) module to extract values for red, green, blue and alpha. */
            background: "#ffffff",
          },
          limitInputPixels: false,
        });
        const { data, info } = await c
          .raw()
          .toBuffer({ resolveWithObject: true });

        newImage = newImage.composite([
          {
            input: data,
            left: Math.floor(h / 20),
            top: Math.floor(w / 20),
            raw: info,
          },
        ]);
        const col =
          "#" +
          (args[2].length > 6
            ? args[2].slice(2) + args[2].slice(0, 2)
            : args[2]);
        /*

        const imgOptions = options.get(context);
        if (imgOptions && imgOptions.caption) {
          const font = await getFont("verdana_regular", newImage.bitmap.width);
          newImage.print(
            font,
            newImage.bitmap.width * 0.1,
            newImage.bitmap.height * 0.8,
            imgOptions.caption,
            newImage.bitmap.width * 0.8
          );
        }*/
        // ARGB to RGBA
        const updated = await newImage
          .raw()
          .toBuffer({ resolveWithObject: true });
        j = sharp(updated.data, { limitInputPixels: false, raw: updated.info });
        j = j.rotate(-angle, { background: col });
        break;
      }
      default:
        break;
    }
    setContext(context, j);
  }
  return context;
}

export async function setOptions(
  context: string,
  _options: PicasaFileMeta
): Promise<void> {
  options.set(context, _options);
  return;
}

export async function destroyContext(context: string): Promise<void> {
  contexts.delete(context);
}

export async function encode(
  context: string,
  mime: string = "image/jpeg",
  format: string = "Buffer"
): Promise<Buffer | string> {
  let j = getContext(context);
  switch (mime) {
    case "image/jpeg":
      j = j.jpeg();
      break;
    case "image/png":
      j = j.png();
      break;
    case "raw":
      j = j.raw();
      break;
    case "image/tiff":
      j = j.tiff();
      break;
    case "image/gif":
      j = j.gif();
      break;
  }
  switch (format) {
    case "base64":
      {
        const { data, info } = await j.toBuffer({ resolveWithObject: true });
        return data.toString(format);
      }
      break;
    case "base64url":
      {
        const { data, info } = await j.toBuffer({ resolveWithObject: true });
        return "data:" + mime + ";base64," + data.toString("base64");
      }
      break;
    case "Buffer":
    default:
      return j.toBuffer();
  }
}

export async function execute(
  context: string,
  operations: string[][]
): Promise<void> {
  for (const operation of operations) {
    let j = getContext(context);
    j = (j as any)[operation[0] as string](...operation.slice(1));
    setContext(context, j);
  }
}

export async function commit(context: string): Promise<void> {
  let j = getContext(context);
  const updated = await j.raw().toBuffer({ resolveWithObject: true });
  j = sharp(updated.data, { limitInputPixels: false, raw: updated.info });

  setContext(context, j);
}

import { readFile } from "fs/promises";
import { join } from "path";
import sharp, { Sharp } from "sharp";
import {
  clipColor,
  decodeOperations,
  decodeRect,
  fromHex,
  toHex2,
  uuid,
} from "../../../shared/lib/utils";
import { AlbumEntry, PicasaFileMeta } from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";
import { promisify } from "util";
import sizeOf from "image-size";

const s = promisify(sizeOf);

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

export async function dimensionsFromFile(
  file: string
): Promise<{ width: number; height: number }> {
  const d = await s(file);
  return { width: d!.width!, height: d!.height! };
}

export async function dimensions(
  data: Buffer
): Promise<{ width: number; height: number }> {
  let s = sharp(data, { limitInputPixels: false, failOnError: false }).rotate();
  const metadata = await s.metadata();
  return { width: metadata.width!, height: metadata.height! };
}

export async function buildContext(entry: AlbumEntry): Promise<string> {
  const fileData = await readFile(
    join(imagesRoot, entry.album.key, entry.name)
  );
  const contextId = uuid();
  let s = sharp(fileData, {
    limitInputPixels: false,
    failOnError: false,
  }).rotate();
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
#| autolight   |                                     | automatic contrast correction  | autolight=1                   | X
#| fill        |                                     | gamma correction               | fill=1,0.43222                | X
#| autocolor   |                                     | automatic color correction     | autocolor=1                   | X
#| retouch     |                                     | retouch                        | retouch=1                     | ?
#| finetune2   | (unidentified params)               | finetuning (brightness,        | finetune2=1,0.000000,0.000000,| X
#|             |                                     |highlights, shadows,grey point,color temp) | 0.000000,fff7f5f3,0.000000;   |
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
#| blur        |                                     | blur                           | 1                             |  New
#| sharpen     |                                     | sharpen                        | 1                             |  New

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
        {
          await commit(context);
          j = getContext(context);
          let r: number;
          if (args[1] && (r = parseInt(args[1])) != 0) {
            j = j.rotate(-r * 90);
          }
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
        j = j.greyscale();
        break;
      case "fill":
        {
          await commit(context);
          j = getContext(context);
          const amount = parseFloat(args[1]);
          j = j.modulate({ brightness: amount });
        }
        break;
      case "blur":
        {
          const amount = parseFloat(args[1]);
          j = j.blur(amount);
        }
        break;
      case "sharpen":
        const amount = parseFloat(args[1]);
        j = j.sharpen(amount);
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
        // Really neeps mapLut from vips - kind of a best approach for now.
        const brightness = parseFloat(args[1] || "0"); // 0->1
        if (brightness > 0) {
          j = j.modulate({ brightness: brightness + 1 });
        }

        const highlights = parseFloat(args[2] || "0"); // 0->0.5
        const shadows = parseFloat(args[3] || "0"); // 0->0.5
        let whitepoint = args[4];
        if (whitepoint.length == 6) {
          whitepoint = "00" + whitepoint;
        }

        const layers: sharp.OverlayOptions[] = [];

        let [a, r, g, b] = fromHex(whitepoint);
        if (r + g + b === 0 || r + g + b === 255 * 3) {
          // no whitepoint set
          r = g = b = 127;
        }
        const gr = (r + g + b) / 3; // average value, used to calculate the gray distance
        [a, r, g, b] = [a, r, g, b].map((v) => 127 + v - gr);
        const temperature = parseFloat(args[5] || "0"); // can be negative
        r = r * (1 + temperature);
        b = b * (1 - temperature);
        a = 0x80;
        const rgba = [r, g, b, a].map(clipColor).map(toHex2).join("");
        layers.push({
          input: {
            create: {
              width: 10,
              height: 10,
              channels: 4,
              background: "#" + rgba,
            },
          },
          tile: true,
          blend: "colour-dodge",
        });
        if (highlights > 0) {
          layers.push({
            input: {
              create: {
                width: 10,
                height: 10,
                channels: 4,
                background: "#ffffff" + toHex2(highlights * 255),
              },
            },
            tile: true,
            blend: "hard-light",
          });
        }
        if (shadows > 0) {
          layers.push({
            input: {
              create: {
                width: 10,
                height: 10,
                channels: 4,
                background: "#000000" + toHex2(shadows * 255),
              },
            },
            tile: true,
            blend: "colour-burn",
          });
        }

        j = j.composite(layers);

        break;
      case "autocolor":
        j = j.normalize();
        break;
      case "contrast":
        let contrast = parseFloat(args[1] || "0") / 100;
        j = j.linear(contrast, -(128 * contrast) + 128);
        break;

      case "Polaroid": {
        await commit(context);
        j = getContext(context);

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
          failOnError: false,
        });
        const { data, info } = await c
          .raw()
          .toBuffer({ resolveWithObject: true });

        const layers: sharp.OverlayOptions[] = [
          {
            input: data,
            left: Math.floor(h / 20),
            top: Math.floor(w / 20),
            raw: info,
          },
        ];
        const o = options.get(context);
        if (o && o.caption) {
          const txtSvg = `<svg height="${Math.floor(
            h / 3
          )}" width="${Math.floor(w * 0.8)}"> <text x="0" y="${Math.floor(
            h / 5
          )}" font-size="${Math.floor(w / 20)}" fill="#000000">${
            options.get(context)!.caption
          }</text> </svg>`;
          layers.push({ input: Buffer.from(txtSvg), gravity: "south" });
        }
        newImage = newImage.composite(layers);
        // ARGB to RGBA
        const updated = await newImage
          .raw()
          .toBuffer({ resolveWithObject: true });
        j = sharp(updated.data, {
          limitInputPixels: false,
          raw: updated.info,
          failOnError: false,
        });
        const col =
          "#" +
          (args[2].length > 6
            ? args[2].slice(2) + args[2].slice(0, 2)
            : args[2]);
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
): Promise<{ width: number; height: number; data: Buffer | string }> {
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
        return {
          data: data.toString(format),
          width: info.width,
          height: info.height,
        };
      }
      break;
    case "base64url":
      {
        const { data, info } = await j.toBuffer({ resolveWithObject: true });
        return {
          data: "data:" + mime + ";base64," + data.toString("base64"),
          width: info.width,
          height: info.height,
        };
      }
      break;
    case "base64urlInfo":
      {
        const { data, info } = await j.toBuffer({ resolveWithObject: true });
        return {
          data: "data:" + mime + ";base64," + data.toString("base64"),
          width: info.width,
          height: info.height,
        };
      }
      break;
    case "Buffer":
    default:
      const { data, info } = await j.toBuffer({ resolveWithObject: true });
      return {
        data,
        width: info.width,
        height: info.height,
      };
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
  j = sharp(updated.data, {
    limitInputPixels: false,
    raw: updated.info,
    failOnError: false,
  });

  setContext(context, j);
}

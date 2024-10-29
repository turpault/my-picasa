import { readFile } from "fs/promises";
import imageSize from "image-size";
import { join } from "path";
import sharp, { Metadata, OverlayOptions, Sharp, Stats } from "sharp";
import { promisify } from "util";
import {
  applyAllFilters,
  applyFilter,
  getConvolution,
  getHistogram,
  heatmap,
  solarize,
} from "./image-filters";
import { entryRelativePath } from "./info";
import {
  AlbumEntry,
  AlbumEntryMetaData,
  FaceData,
  ImageEncoding,
  ImageMimeType,
  Reference,
} from "../../shared/types/types";
import {
  clipColor,
  decodeOperations,
  decodeRect,
  decodeRotate,
  encodeOperations,
  fromBase64,
  fromHex,
  namify,
  noop,
  safeHtml,
  toHex2,
  uuid,
} from "../../shared/lib/utils";
import { imagesRoot } from "../utils/constants";
import { rotateRectangle } from "../../shared/lib/geometry";
import { Queue } from "../../shared/lib/queue";
import {
  getPicasaEntry,
  setFilters,
  setRotate,
  updatePicasaEntry,
} from "../rpc/rpcFunctions/picasa-ini";
import { getFaceRect } from "../rpc/rpcFunctions/faces";
import {
  decodeReferenceId,
  readReferenceFromReferenceId,
} from "../rpc/albumTypes/referenceFiles";
import { rectOfReference } from "../../worker/background/face/face-utils";

const contexts = new Map<string, Sharp>();
const contextOptions = new Map<string, AlbumEntryMetaData>();
const debug = true;
const debugInfo = debug ? console.info : noop;

function getContext(context: string): Sharp {
  const j = contexts.get(context);
  if (!j) {
    throw new Error(`context "${context}" not found`);
  }
  return j;
}

function setContext(context: string, j: Sharp) {
  contexts.set(context, j);
}

export function dimensionsFromFileBuffer(file: Buffer): {
  width: number;
  height: number;
} {
  try {
    const d = imageSize(file);
    return { width: d!.width!, height: d!.height! };
  } catch (e) {
    console.error(`An error occurred while getting dimensions of an image`, e);
    return { width: 0, height: 0 };
  }
}

export async function dimensionsFromFile(
  file: string,
): Promise<{ width: number; height: number }> {
  const buffer = await readFile(file);
  return dimensionsFromFileBuffer(buffer);
}

export async function dimensions(
  data: Buffer,
): Promise<{ width: number; height: number }> {
  let s = sharp(data, { limitInputPixels: false, failOnError: false }).rotate();
  const metadata = await s.metadata();
  return { width: metadata.width!, height: metadata.height! };
}

function colorFromArg(arg: string) {
  arg = arg.replace("#", "");
  return "#" + (arg.length > 6 ? arg.slice(2) + arg.slice(0, 2) : arg);
}

export async function buildNewContext(
  width: number,
  height: number,
  background = "#ffffff",
): Promise<string> {
  const contextId = uuid();
  const j = sharp({
    create: {
      width,
      /** Number of pixels high. */
      height,
      /** Number of bands e.g. 3 for RGB, 4 for RGBA */
      channels: 3,
      /** Parsed by the [color](https://www.npmjs.org/package/color) module to extract values for red, green, blue and alpha. */
      background,
    },
  });

  contexts.set(contextId, j);
  return contextId;
}

export async function buildRawContext(entry: AlbumEntry) {
  const relPath = entryRelativePath(entry);
  const [picasaData, fileData] = await Promise.all([
    getPicasaEntry(entry),
    readFile(join(imagesRoot, relPath)),
  ]);
  const contextId = namify(relPath) + "-" + uuid();

  try {
    let s = sharp(fileData, {
      limitInputPixels: false,
      failOnError: false,
    })
      .withMetadata()
      .rotate();
    contexts.set(contextId, s);
    return { contextId, picasaData };
  } catch (e: any) {
    console.error(
      `An error occured while reading file ${entry.name} in folder ${entry.album.key} : ${e.message}`,
    );
    throw e;
  }
}
export async function buildContextFromBuffer(buffer: Buffer): Promise<string> {
  try {
    const contextId = "buffer-" + uuid();
    let s = sharp(buffer, {
      limitInputPixels: false,
      failOnError: false,
    }).withMetadata();
    contexts.set(contextId, s);
    return contextId;
  } catch (e: any) {
    console.error(
      `An error occured while building a context from a buffer : ${e.message}`,
    );
    debugger;
    throw e;
  }
}

export async function buildContext(entry: AlbumEntry): Promise<string> {
  const { contextId, picasaData } = await buildRawContext(entry);
  let s = getContext(contextId);
  try {
    // Extract filters with rotate=1,x and transform to rotate=rotate(x)
    let rotate = decodeRotate(picasaData.rotate);
    if (picasaData.filters) {
      const filters = decodeOperations(picasaData.filters);
      const filterRotate = filters.find((f) => f.name === "rotate");
      if (filterRotate) {
        const filterRotateValue = filterRotate.args[1];
        if (filterRotateValue) {
          picasaData.rotate = `rotate(${filterRotateValue})`;
          rotate = decodeRotate(picasaData.rotate);
        }
        filters.splice(filters.indexOf(filterRotate), 1);
        setFilters(entry, encodeOperations(filters));
        setRotate(entry, picasaData.rotate);
      }
    }
    // rotate=rotate(3), in 90 increments
    if (rotate !== 0) {
      // rotation increment
      if (rotate > 0) {
        s = await branchContext(s);
        s = s.rotate(-90 * rotate);
      }
    }
    contexts.set(contextId, s);
    return contextId;
  } catch (e: any) {
    console.error(
      `An error occured while reading file ${entry.name} in folder ${entry.album.key} : ${e.message}`,
    );
    throw e;
  }
}
export async function cloneContext(
  context: string,
  hint: string,
): Promise<string> {
  const j = getContext(context);

  const contextId = context + "-" + namify(hint) + "-" + uuid();
  debugInfo("Cloning context", context, "->", contextId);

  const s = j.clone();

  contexts.set(contextId, s);
  return contextId;
}

function tag(
  name: string,
  attrs: { [n: string]: any },
  contents: string = "",
): string {
  return `<${name} ${Object.keys(attrs)
    .map((a) => `${a}="${attrs[a].toString()}"`)
    .join(" ")}>${contents}</${name}>`;
}

export function exifToSharpMeta(obj: { [key: string]: any }): any {
  const asSharp = Object.fromEntries(
    Object.entries(obj)
      .filter(([_key, value]) => value !== undefined)
      .map(([key, value]) => [key, value.toString()]),
  );
  return asSharp;
}

/*
# Here is a list of valid filter identifiers
#
#|--Identifier-|--------------Parameters-------------|----------Description-----------|---------Example---------------|-- Done--|
#| crop64      |  CROP_RECTANGLE*                    |   crop filter, crops the image | crop64=1,30a730d2bf1ab897     | X
#|             |                                     |    according to crop rectangle |                               |
#| tilt        | !TILT_ANGLE,!SCALE                  |  tilts and scales image        | tilt=1,0.280632,0.000000 -1=-10deg / +1=+10deg | X
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
#| Polaroid    |angle,color,text                     | polaroid effect                | Polaroid=1,ff0000,Jello;      |
#| rotate      | angle (increments of 90)            | rotation (clockwise)           | 1,3                           |  New
#| mirror      |                                     | mirror                         | 1                             |  New
#| flip        |                                     | flip                           | 1                             |  New
#| blur        |                                     | blur                           | 1                             |  New
#| sharpen     | sigma (0<sigma<=10)                 | sharpen                        | 1, 10                         |  New
#| resize      | max Dimension                       | resize image (nearest)         | 1, 1500                       | Personal
#| label       | text, fontsize, position (n,s,e,w),color, bgcolor | Adds a label to the image      | 1, "hello", 12, "s", "#000000", "#ffffff"    | Personal
#| filter:name |                                     | Apply a filter to the image    | filter:All                    | Personal
#| solarize    | threshold                           | solarize filter                | solarize=1,0.500000;          | Personal
#| heatmap     |                                     | heatmap filter                 | heatmap=1;                    | Personal
#| convolute   | kernel                              | convolute filter               | convolute=1,name;             | Personal
#| border      | percentage of image, color          | border                         | border=1,3,FFFFFF             | Personal
#| rotateAngle | angle, color                        | rotate Image                   | rotateAngle=1,PI/3,FFFFFF     | Personal
#| scale       | scaleFactor                         | rescale image                  | scale=1,0.5                   | Personal
#| into        | width, height, color                | resize into specified dims     | into=1,1920, 1080,FFFFFF      | Personal

# LEGEND:
# ! = float between 0 and 1, precision:6
# !! = float with arbitrary range, precision:6
# # = 32-bit color in hex notation, e.g.: fff7f5f3
# [] = crop rectangle
*/
export async function transform(
  context: string,
  transformation: string,
): Promise<string> {
  // Transform is <cmd>=arg,arg;<cmd>...
  const operations = decodeOperations(transformation);
  for (const { name, args } of operations) {
    let j = getContext(context);

    switch (name.split(":")[0]) {
      case "sepia":
        j = j.recomb([
          [0.3588, 0.7044, 0.1368],
          [0.299, 0.587, 0.114],
          [0.2392, 0.4696, 0.0912],
        ]);
        break;
      case "alpha":
        {
          j = j.ensureAlpha();
        }
        break;
      case "rotate":
        {
          let r: number;
          if (args[1] && (r = parseInt(args[1])) != 0) {
            if (r % 4 !== 0) {
              j = await commit(context);
              j = j.rotate(-r * 90);
            }
          }
        }
        break;
      case "rotateAngle":
        {
          let r: number;
          const angle = parseFloat(args[1]);
          const color = args[2];
          if (angle) {
            j = await commit(context);
            j = j.rotate(angle, { background: color });
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
        if (
          crop &&
          (crop.left > 0 || crop.top > 0 || crop.right < 1 || crop.bottom < 1)
        ) {
          const { info } = await j.raw().toBuffer({ resolveWithObject: true });
          const w = info.width!;
          const h = info.height!;
          if (Math.floor(w * (crop.right - crop.left)) === 0) debugger;
          if (Math.floor(h * (crop.bottom - crop.top)) === 0) debugger;
          if (
            h > 0 &&
            w > 0 &&
            crop.right - crop.left > 0 &&
            crop.bottom - crop.top > 0
          ) {
            j = j.extract({
              left: Math.floor(crop.left * w),
              top: Math.floor(crop.top * h),
              width: Math.floor(w * (crop.right - crop.left)),
              height: Math.floor(h * (crop.bottom - crop.top)),
            });
          }
        }
        break;
      case "bw":
        j = j.greyscale();
        break;
      case "into":
        {
          const width = parseInt(args[1]);
          const height = parseInt(args[2]);
          const color = colorFromArg(args[3]);
          if (width && height) {
            j = j.resize(width, height, { fit: "contain", background: color });
          }
        }
        break;
      case "fill":
        {
          const amount = parseFloat(args[1]);
          if (amount !== 0) {
            j = await commit(context);
            //j = j.gamma(2.2, 1 + amount);
            j = j.modulate({ brightness: 1 + amount });
          }
        }
        break;
      case "blur":
        {
          const meta = await j.metadata();
          let amount = Math.max(parseFloat(args[1] || "0.3"), 0.3);
          // 0.3 is the minimum blur
          // Adjust the blur amount to the image size
          amount = 0.3 + ((amount - 0.3) * meta.width!) / 4000;
          if (amount !== 0.3) j = j.blur(amount);
        }
        break;
      case "sharpen":
        const amount = args[1]
          ? Math.max(Math.min(parseFloat(args[1]), 10), 0.0001)
          : 2;
        j = j.sharpen({ sigma: amount });
        break;
      case "scale": {
        const amount = parseFloat(args[1]);
        const meta = await j.metadata();
        j = j.resize(Math.floor(meta.width! * amount), null);
        break;
      }
      case "solarize":
        {
          const threshold = parseFloat(args[1]);
          const r = await j.raw().toBuffer({ resolveWithObject: true });
          const pixelSize = r.info.channels as 3 | 4;
          await solarize(r.data, r.info.channels, threshold * 255);
          j = j.composite([
            {
              input: r.data,
              raw: {
                width: r.info.width,
                height: r.info.height,
                channels: pixelSize,
              },
            },
          ]);
          j = await commit(context);
        }

        break;
      case "heatmap":
        {
          const r = await j.raw().toBuffer({ resolveWithObject: true });
          const pixelSize = r.info.channels as 3 | 4;
          await heatmap(r.data, r.info.channels);
          j = j.composite([
            {
              input: r.data,
              raw: {
                width: r.info.width,
                height: r.info.height,
                channels: pixelSize,
              },
            },
          ]);
          j = await commit(context);
        }

        break;
      case "border": {
        j = await commit(context);
        const r = await j.metadata();
        const amount = Math.floor((r.width! * parseFloat(args[1])) / 100),
          color = args[2] || "#000000";
        j = j.extend({
          top: amount,
          bottom: amount,
          left: amount,
          right: amount,
          background: color,
        });
        break;
      }
      case "convolute":
        {
          const name = args[1];
          if (name) {
            const kernel = getConvolution(name);
            if (kernel) {
              j = j.convolve(kernel);
            }
          }
        }

        break;
      case "tilt":
        const angleDeg = 10 * parseFloat(args[1]); // in degrees
        if (angleDeg != 0) {
          const angle = (Math.PI * angleDeg) / 180;
          let scale = parseInt(args[2]);
          j = await branchContext(j);
          const metadata = await j.metadata();
          const w = metadata.width!;
          const h = metadata.height!;
          const newRect = rotateRectangle(w, h, angle);
          if (scale === 0 || Number.isNaN(scale)) {
            scale = newRect.ratio;
          }

          j = j.rotate(-angleDeg);
          j = await branchContext(j);

          if (scale !== 1) {
            const rw = Math.floor(newRect.w * scale);
            const rh = Math.floor(newRect.h * scale);
            j = j.resize(rw, rh);
            j = await branchContext(j);

            const rl = Math.floor((rw - w) / 2);
            const rt = Math.floor((rh - h) / 2);
            /*const layers2: sharp.OverlayOptions[] = [
          {
            input: {
              create: {
                width: w,
                height: h,
                channels: 4,
                background: "#FF0000",
              },
            },
            left: rl,
            top: rt,
            blend: "colour-burn",
          },
        ];

        j = j.composite(layers2);*/
            j = j.extract({
              left: rl,
              top: rt,
              width: w,
              height: h,
            });
          }
        }
        break;
      case "Orton":
        {
          let c = j.clone();
          const { data, info } = await c
            .raw()
            .toBuffer({ resolveWithObject: true });

          j.blur(Math.max(0.3, info.width / 500));
          const layers: sharp.OverlayOptions[] = [
            {
              input: data,
              raw: info,
              blend: "screen",
            },
            {
              input: data,
              raw: info,
              blend: "soft-light",
            },
          ];
          j = j.composite(layers);
        }
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
      case "filter": {
        const filter = name.split(":")[1] || "All";
        const tileSize = 400;

        if (filter.startsWith("All:")) {
          const group = filter.split(":").pop();
          j.resize(tileSize - 10, tileSize - 10);
          const r = await j.raw().toBuffer({ resolveWithObject: true });
          const pixelSize = r.info.channels as 3 | 4;
          console.time("applyAllFilters");
          const filtered = await applyAllFilters(
            r.data,
            r.info.channels,
            group,
          );
          console.timeEnd("applyAllFilters");
          // create a tapestry with all the resulting data
          console.time("composite");
          const tapestryDimension = Math.ceil(Math.sqrt(filtered.length));

          j = sharp({
            create: {
              width: tileSize * tapestryDimension,
              /** Number of pixels high. */
              height: tileSize * tapestryDimension,
              /** Number of bands e.g. 3 for RGB, 4 for RGBA */
              channels: pixelSize,
              /** Parsed by the [color](https://www.npmjs.org/package/color) module to extract values for red, green, blue and alpha. */
              background: "#ffffff",
            },
          });
          const layers: OverlayOptions[] = [];
          filtered.forEach((img, index) => {
            const posX = (index % tapestryDimension) * tileSize;
            const posY = Math.floor(index / tapestryDimension) * tileSize;
            const layer: OverlayOptions = {
              raw: {
                width: tileSize - 10,
                height: tileSize - 10,
                channels: pixelSize,
              },
              input: img.filtered,
              top: posY + 5,
              left: posX + 5,
            };
            layers.push(layer);
            /*const txtSvg =
              `<svg width="${tileSize}" height="${tileSize}"><text x="50%" y="80%" text-anchor="middle" dominant-baseline="middle" font-size="35" fill="#101010">${escapeXml(filtered[index].name)}</text></svg>`;
            layers.push({ input: Buffer.from(safeHtml(txtSvg)), top: posY, left: posX });
            const txtSvgOutline =
              `<svg width="${tileSize}" height="${tileSize}"><text x="50%" y="80%" text-anchor="middle" dominant-baseline="middle" font-size="37" fill="#FFFFFF">${escapeXml(filtered[index].name)}</text></svg>`;
            layers.push({ input: Buffer.from(safeHtml(txtSvgOutline)), top: posY, left: posX });*/
          });
          j = j.composite(layers);
          console.time("endComposite");
        } else {
          const r = await j.raw().toBuffer({ resolveWithObject: true });
          const pixelSize = r.info.channels as 3 | 4;
          await applyFilter(r.data, r.info.channels, filter);
          j = j.composite([
            {
              input: r.data,
              raw: {
                width: r.info.width,
                height: r.info.height,
                channels: pixelSize,
              },
            },
          ]);
        }
        break;
      }
      case "autocolor":
        /*const dominantColor = await j.clone()
          .resize(5, 5, { position: sharp.strategy.attention })
          .toBuffer()
          .then((buffer) => {
            return sharp(buffer)
              .stats()
              .then((stats) => {
                return stats.dominant;
              });
          });
        const reverseTint = {r: 255-dominantColor.r, g: 255-dominantColor.g, b: 255-dominantColor.b};*/
        j = j.normalise();

        /*
        // Get the min/max values
        const levels = (min: number, max: number) => {
          const scale = 255 / (max - min);
          return [scale, -min * scale];
        };
    
        const blurred = await commitContext(await j.clone().blur(5));
        const stats = await blurred.stats();
    
        // For each channel, get the min/max values
        {
          let copy = j.clone();
          const buffers = await Promise.all(
            [0, 1, 2].map((v) =>
              copy
                .extractChannel(v)
                .toColorspace("b-w")
                .linear(...levels(stats.channels[v].min, stats.channels[v].max))
                .toBuffer()
            )
          );
          const meta = await j.metadata();
          j = sharp(meta).joinChannel(buffers);
        }
        */

        break;
      case "identify":
        {
          j = getContext(context);
          const metadata = await j.metadata();
          const w = metadata.width!;
          const h = metadata.height!;

          const stroke = Math.floor(w / 400) + 1;
          let txtSvg = `<svg x="0" y="0" height="${h}" width="${w}">`;
          for (const id of args.slice(1)) {
            const [name, rect, color] = JSON.parse(fromBase64(id));
            const style = `fill:none;stroke-width:${stroke};stroke:${
              color || "rgb(0,255,0)"
            }`;
            const pos = decodeRect(rect);
            const scaledPos = {
              x: Math.floor(pos.left * w),
              y: Math.floor(pos.top * h),
              width: Math.floor(w * (pos.right - pos.left)),
              height: Math.floor(h * (pos.bottom - pos.top)),
            };
            const fontSize = Math.max(Math.floor(scaledPos.width / 6), 30);
            const layer =
              tag(
                "text",
                {
                  x: scaledPos.x,
                  y: scaledPos.y + scaledPos.height + fontSize,
                  width: scaledPos.width,
                  "alignment-baseline": "top",
                  height: fontSize * 2,
                  "font-size": fontSize,
                  fill: color || "rgb(0,255,0)",
                },
                safeHtml(name),
              ) +
              tag("rect", {
                x: scaledPos.x,
                y: scaledPos.y,
                width: scaledPos.width,
                height: scaledPos.height,
                style,
              });
            txtSvg += layer;
          }
          txtSvg += "</svg>";
          debugInfo(txtSvg);
          const layers = [
            {
              input: Buffer.from(txtSvg),
              gravity: "northeast",
              left: 0,
              top: 0,
              width: w,
              height: h,
            },
          ];
          j = j.composite(layers);
        }
        break;

      case "contrast":
        let contrast = parseFloat(args[1] || "0") / 100;
        j = j.linear(contrast, -(128 * contrast) + 128);
        break;

      case "Polaroid": {
        j = await commit(context);

        const angle = parseFloat(args[1]);
        const col = colorFromArg(args[2]);
        const text = decodeURIComponent(args[3] ?? "");
        const metadata = await j.metadata();
        const w = metadata.width!;
        const h = metadata.height!;
        const maxDim = Math.floor(Math.min(w, h) * 0.9);
        j = j.resize(maxDim, maxDim, { fit: "cover" });
        // border top is 1/10th of the height
        const border = Math.floor(maxDim / 10);
        j = j.extend({
          top: border,
          bottom: border * 4,
          left: border,
          right: border,
          background: "#ffffff",
        });
        if (text) {
          const fontSize = Math.max(
            2,
            Math.floor(maxDim / 20) -
              (text.length > 30 ? ((text.length - 30) * maxDim) / 2500 : 0),
          );
          const txtSvg = `<svg height="${Math.floor(
            maxDim / 3,
          )}" width="${maxDim}"> <text x="50%" y="50%" text-anchor="middle" font-size="${fontSize}" fill="#000000">${safeHtml(
            text,
          )}</text> </svg>`;
          j = await commit(context);
          j = j.composite([{ input: Buffer.from(txtSvg), gravity: "south" }]);
          j = await commit(context);
        }
        if (angle !== 0) j = j.rotate(angle, { background: col });
        break;
      }
      case "Polaroid-old": {
        j = await commit(context);

        const angle = parseFloat(args[1]);
        let c = j.clone();
        const text = decodeURIComponent(args[3] ?? "");
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
        if (text) {
          const txtSvg = `<svg height="${Math.floor(
            h / 3,
          )}" width="${Math.floor(w * 0.8)}"> <text x="0" y="${Math.floor(
            h / 5,
          )}" font-size="${Math.floor(w / 20)}" fill="#000000">${safeHtml(
            text,
          )}</text> </svg>`;
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
        const col = colorFromArg(args[2]);
        j = j.rotate(angle, { background: col });
        break;
      }
      case "resize": {
        const sizeW = args[1] ? parseInt(args[1]) : undefined;
        const sizeH = args[2] ? parseInt(args[2]) : undefined;
        j = j.resize(sizeW, sizeH, { fit: "inside" });
        break;
      }
      case "compress": {
        const sizeW = args[1] ? parseInt(args[1]) : undefined;
        const sizeH = args[2] ? parseInt(args[2]) : undefined;
        j = j.resize(sizeW, sizeH, { fit: "inside", withoutEnlargement: true });
        break;
      }
      case "cover": {
        const sizeW = args[1] ? parseInt(args[1]) : undefined;
        const sizeH = args[2] ? parseInt(args[2]) : undefined;
        j = j.resize(sizeW, sizeH, { fit: "cover" });
        break;
      }
      case "exif": {
        const exif = args[0]
          ? JSON.parse(decodeURIComponent(args[0]))
          : undefined;
        j = j.withMetadata({ exif: exif });
        break;
      }
      case "label": {
        j = await commit(context);
        const metadata = await j.metadata();
        const w = metadata.width!;
        const text = decodeURIComponent(args[1]);
        const size = parseInt(args[2]);
        const pos = args[3] || "s";
        const color = colorFromArg(args[4] || "#000000");
        const bgcolor = colorFromArg(args[5] || "#ffffff");
        /*const { data, info } = await j
          .raw()
          .toBuffer({ resolveWithObject: true });
        const leftByPosition = {
          n: w / 2,
          s: w / 2,
          w: 0,
          e: w,
        };*/

        const layers: sharp.OverlayOptions[] = []; /*[
          {
            input: data,
            gravity,
            raw: info,
          },
        ];*/

        const fontSize = Math.floor((size * w) / 1000);
        const svgHeight = Math.floor(fontSize * 1.6);
        const txtSvg = `<svg width="${w}" height="${svgHeight}"> 
        <rect x="0" cy="0" width="${w}" height="${fontSize}" fill="${bgcolor}" style="fill-opacity: .35;" />
        <text  x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}" fill="${color}">${safeHtml(
          text,
        )}</text> 
        </svg>`;
        const gravity =
          { n: "north", s: "south", e: "east", w: "west" }[pos] || "south";
        layers.push({ input: Buffer.from(txtSvg), gravity });

        /*const newImage = sharp({
          create: {
            width: w,
            height: h,
            channels: 4,
            background: "#ffffff",
          },
          limitInputPixels: false,
          failOnError: false,
        });*/
        j = j.composite(layers);
        j = await commit(context);
        break;
      }

      default:
        break;
    }
    setContext(context, j);
  }
  return context;
}
export async function blitMultiple(
  target: string,
  sources: {
    context: string;
    position: {
      left: number;
      top: number;
    };
  }[],
): Promise<void> {
  let targetContext = getContext(target);
  const compositeLayers = await Promise.all(
    sources.map(async (source) => {
      const left = Math.round(source.position.left);
      const top = Math.round(source.position.top);
      const sourceContext = getContext(source.context);
      const pixels = await sourceContext
        .raw()
        .toBuffer({ resolveWithObject: true });
      const pixelSize = pixels.info.channels as 3 | 4;
      return {
        input: pixels.data,
        raw: {
          width: pixels.info.width,
          height: pixels.info.height,
          channels: pixelSize,
        },
        top,
        left,
      };
    }),
  );
  targetContext = targetContext.composite(compositeLayers);
  setContext(target, targetContext);
}

export async function blit(
  target: string,
  source: string,
  left: number,
  top: number,
): Promise<void> {
  left = Math.round(left);
  top = Math.round(top);
  const sourceContext = getContext(source);
  let targetContext = getContext(target);
  const pixels = await sourceContext
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelSize = pixels.info.channels as 3 | 4;
  const targetSize = await targetContext.metadata();
  targetContext = targetContext.composite([
    {
      input: pixels.data,
      raw: {
        width: pixels.info.width,
        height: pixels.info.height,
        channels: pixelSize,
      },
      top,
      left,
    },
  ]);
  setContext(target, targetContext);
}

export async function histogram(
  context: string,
): Promise<{ r: number[]; g: number[]; b: number[] }> {
  const sourceContext = getContext(context);
  const pixels = await sourceContext
    .raw()
    .toBuffer({ resolveWithObject: true });

  return getHistogram(pixels.data, pixels.info.channels as 3 | 4);
}
export async function setOptions(
  context: string,
  options: AlbumEntryMetaData,
): Promise<void> {
  contextOptions.set(context, options);
  return;
}

export async function destroyContext(context: string): Promise<void> {
  debugInfo("Delete context", context);
  contexts.delete(context);
}

const emptyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=",
  "base64",
);
const emptyJpg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==",
  "base64",
);
export async function encode(
  context: string,
  mime: ImageMimeType = "image/jpeg",
  format: ImageEncoding = "Buffer",
): Promise<{ width: number; height: number; data: Buffer | string }> {
  let j: sharp.Sharp;
  try {
    j = getContext(context);
  } catch (e) {
    switch (mime) {
      case "image/jpeg":
        return { width: 1, height: 1, data: emptyJpg };
      default:
        return { width: 1, height: 1, data: emptyPng };
    }
  }
  switch (mime) {
    case "image/jpeg":
      j = j.jpeg({ quality: 95 });
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

  //const exif = exifToSharpMeta(getExif(context));
  //j.withMetadata({exif: {IFD0: exif, IFD1: exif, IFD2: exif, GPSIFD: exif, ExifIFD:exif, ImageIFD: exif}})
  switch (format) {
    case "base64": {
      const { data, info } = await j.toBuffer({ resolveWithObject: true });
      return {
        data: data.toString(format),
        width: info.width,
        height: info.height,
      };
    }
    case "base64url":
    case "base64urlInfo": {
      const { data, info } = await j.toBuffer({ resolveWithObject: true });
      return {
        data: "data:" + mime + ";base64," + data.toString("base64"),
        width: info.width,
        height: info.height,
      };
    }
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
  operations: string[][],
): Promise<void> {
  for (const operation of operations) {
    let j = getContext(context);
    j = (j as any)[operation[0] as string](...operation.slice(1));
    setContext(context, j);
  }
}

export async function commit(context: string): Promise<Sharp> {
  let j = getContext(context);
  j = await branchContext(j);
  setContext(context, j);
  return j;
}

async function branchContext(j: sharp.Sharp): Promise<sharp.Sharp> {
  const raw = await j
    .jpeg({ quality: 100 })
    .toBuffer({ resolveWithObject: true });

  const j2 = sharp(raw.data, {
    limitInputPixels: false,
    failOnError: false,
  }).withMetadata();

  return j2;
}

// Queue last-in first out
const buildImageQueue = new Queue(4, { fifo: false });
export async function buildImage(
  entry: AlbumEntry,
  options: AlbumEntryMetaData | undefined,
  transformations: string | undefined,
  extraOperations: any[] | undefined,
): Promise<{ width: number; height: number; data: Buffer; mime: string }> {
  return buildImageQueue.add(async () => {
    const label = `BuildImage for image ${entry.album.name} / ${
      entry.name
    } / ${transformations} / ${
      extraOperations ? JSON.stringify(extraOperations) : "no op"
    }`;
    console.time(label);
    debugInfo(label);
    try {
      const context = await buildContext(entry);
      if (options) {
        await setOptions(context, options);
      }
      if (extraOperations) {
        await execute(context, extraOperations);
      }
      if (transformations) {
        await transform(context, transformations);
      }
      const res = (await encode(context, "image/jpeg", "Buffer")) as {
        width: number;
        height: number;
        data: Buffer;
      };
      await destroyContext(context);
      console.timeEnd(label);
      return { ...res, mime: "image/jpeg" };
    } catch (e) {
      console.timeEnd(label);
      throw e;
    }
  });
}

const buildFaceImageQueue = new Queue(4, { fifo: false });
export async function buildFaceImage(
  referenceId: string,
): Promise<{ width: number; height: number; data: Buffer; mime: string }> {
  return buildFaceImageQueue.add(async () => {
    const label = `Thumbnail for face ${referenceId}`;
    console.time(label);
    try {
      const rect = await getFaceRect(referenceId);
      const { entry: originalImageEntry } = decodeReferenceId(referenceId);
      const { contextId } = await buildRawContext(originalImageEntry);
      await transform(contextId, `crop64=1,${rect}`);
      const res = (await encode(contextId, "image/jpeg", "Buffer")) as {
        width: number;
        height: number;
        data: Buffer;
      };
      await destroyContext(contextId);
      return { ...res, mime: "image/jpeg" };
    } finally {
      console.timeEnd(label);
    }
  });
}

export async function statsOfContext(context: string): Promise<Stats> {
  const j = getContext(context);
  return j.stats();
}

export async function buildFaceImageFromReference(
  reference: Reference,
): Promise<{ width: number; height: number; data: Buffer; mime: string }> {
  return buildFaceImageQueue.add(async () => {
    const label = `Thumbnail for reference ${reference.id}`;
    console.time(label);
    debugInfo(label);
    try {
      const referenceData = await readReferenceFromReferenceId(reference.id);
      if (!referenceData) {
        throw "Reference not found";
      }
      const rect = rectOfReference(referenceData.data);

      const { entry: originalImageEntry } = decodeReferenceId(reference.id);
      const { contextId } = await buildRawContext(originalImageEntry);

      await transform(contextId, `crop64=1,${rect}`);
      const res = (await encode(contextId, "image/jpeg", "Buffer")) as {
        width: number;
        height: number;
        data: Buffer;
      };
      await destroyContext(contextId);
      console.timeEnd(label);
      return { ...res, mime: "image/jpeg" };
    } catch (e) {
      console.timeEnd(label);
      throw e;
    }
  });
}

export async function imageMetadata(
  data: Buffer,
): Promise<Metadata | undefined> {
  try {
    let s = sharp(data, {
      limitInputPixels: false,
      failOnError: false,
    })
      .withMetadata()
      .rotate();
    const meta = await s.metadata();
    s.destroy();
    return meta;
  } catch (e) {
    return undefined;
  }
}

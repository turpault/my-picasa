import { readFile } from "fs/promises";
import { join, relative, sep } from "path";
import { folder } from "../rpc/rpcFunctions/fs";
import { sleep } from "../../shared/lib/utils";
import { imagesRoot } from "../utils/constants";
import { typeHandlers } from "image-size/dist/types";
import { convolutionKernels } from "./convolutionFilters/convolutionFilters";
import { Kernel } from "sharp";
const { applyLUT } = require("./native-filters/build/Release/lut3d");
const { histogram } = require("./native-filters/build/Release/histogram");
const {
  solarize: solarizeNative,
} = require("./native-filters/build/Release/solarize");
const {
  heatmap: heatmapNative,
} = require("./native-filters/build/Release/heatmap");

export const filtersFolder = ".filters";
/**
 * Enumerate filters folder contents
 */
type LUT3D = {
  width: Number;
  data: Number[][];
  path: string;
  title: string;
  group: string;
};

const allFilters: {
  [path: string]: LUT3D;
} = {};

export async function parseLUTs() {
  try {
    if (Object.keys(allFilters).length === 0) {
      async function crawl(f: string) {
        const contents = await folder(f);
        for (const content of contents) {
          if (content.kind === "directory") {
            await crawl(join(f, content.name));
          } else if (content.name.toLocaleLowerCase().endsWith(".cube")) {
            const p = join(relative(filtersFolder, f), content.name);
            const lut = await read3DLUTFile(p);
            let title = lut.title;
            while (allFilters[title] && allFilters[title].path !== lut.path) {
              title = title + " (1)";
            }
            allFilters[title] = lut;
          }
        }
      }
      await crawl(filtersFolder);
    }
  } catch (e) {
    console.error(e);
  }
}

export function getFilterGroups(): string[] {
  const groups = Object.values(allFilters).reduce(
    (prev, cur) => (prev.includes(cur.group) ? prev : [...prev, cur.group]),
    [] as string[]
  );
  return groups;
}

export function getFilterList(group?: string): string[] {
  return Object.keys(allFilters).filter(
    (f) => !group || allFilters[f].group === group
  );
}

export function getConvolutionKernelNames(): string[] {
  return Object.keys(convolutionKernels);
}
export function getConvolution(name: string): Kernel {
  return convolutionKernels[name];
}

async function read3DLUT(title: string): Promise<LUT3D> {
  if (title.startsWith("any")) {
    const f = getFilterList(getFilterGroups()[0]);
    title = f[0];
  }
  const filter = allFilters[title];
  if (!filter) {
    throw new Error(`Filter ${title} not found`);
  }
  return filter;
}

async function read3DLUTFile(path: string): Promise<LUT3D> {
  const fileData = await readFile(join(imagesRoot, filtersFolder, path));
  const contents = fileData.toString("utf8");
  const lines = contents.split("\n");
  const res = {
    width: 0,
    data: [] as Number[][],
    path,
    title: path.replace(/\..*$/, "").split(sep).pop()!,
    group: path.split(sep)[0]!,
  };
  for (const line of lines) {
    if (line.startsWith("LUT_3D_SIZE")) {
      res.width = parseInt(line.split(" ").pop()!);
    } else if (line.startsWith("TITLE")) {
      let title = line.replace("TITLE ", "").replace(/"/g, "").trim();
      if (title.toLowerCase() !== "untitled") {
        while (allFilters[title]) {
          title += " (1)";
        }
        res.title = title;
      }
    } else if (!isNaN(parseFloat(line))) {
      res.data.push(line.split(" ").map(parseFloat));
    }
  }
  return res;
}

export async function applyFilter(
  buffer: Buffer,
  pixelSize: number,
  filterName: string
): Promise<void> {
  try {
    const lut = await read3DLUT(filterName);
    //console.time(filterName);
    applyLUT(buffer, pixelSize, lut.width, lut.data);
    //console.timeEnd(filterName);
  } catch (e) {
    console.error(e);
  }
}

export async function applyAllFilters(
  buffer: Buffer,
  pixelSize: number,
  group?: string
): Promise<{ filtered: Buffer; name: string }[]> {
  const filterList = await getFilterList(group);
  const res: { filtered: Buffer; name: string }[] = await Promise.all(
    filterList.sort().map(async (name) => {
      const filtered = Buffer.from(buffer);
      await applyFilter(filtered, pixelSize, name);
      return { filtered, name };
    })
  );
  return res;
}

export async function getHistogram(
  buffer: Buffer,
  pixelSize: number
): Promise<{ r: number[]; g: number[]; b: number[] }> {
  const h = histogram(buffer, pixelSize);
  return { r: h[0], g: h[1], b: h[2] };
}

export async function solarize(
  buffer: Buffer,
  pixelSize: number,
  threshold: number
): Promise<boolean> {
  return solarizeNative(buffer, pixelSize, threshold);
}

export async function heatmap(
  buffer: Buffer,
  pixelSize: number
): Promise<boolean> {
  return heatmapNative(buffer, pixelSize);
}

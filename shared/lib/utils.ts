import { Base64 } from "js-base64";
import {
  Album,
  AlbumEntry,
  AlbumKind,
  FaceList,
  animatedPictureExtensions,
  pictureExtensions,
  videoExtensions,
} from "../types/types";

export async function sleep(delay: number) {
  return new Promise((resolve) => setTimeout(resolve, delay * 1000));
}

export function groupBy<T, K>(
  a: T[],
  field: keyof T,
  transform?: (v: any) => K,
): Map<K, T[]> {
  const result = new Map<K, T[]>();
  for (const item of a) {
    let value = item[field] as unknown as K;
    if (transform) value = transform(value);
    if (!result.has(value as K)) {
      result.set(value as K, []);
    }
    result.get(value as K)!.push(item);
  }
  return result;
}
export function sortByKey<T>(
  array: T[],
  keys: (keyof T)[],
  order: ("alpha" | string[] | "numeric")[],
) {
  array.sort(alphaSorter(false, keys as string[], order));
}
export const noop = (..._a: any[]) => {};

export function alphaSorter(
  caseSensitive: boolean = true,
  keys: (string | undefined)[] = [undefined],
  order: ("alpha" | string[] | "numeric")[] = ["alpha"],
): (a: any, b: any) => number {
  return (_a, _b) => {
    for (const [idx, key] of keys.entries()) {
      let va = key ? _a[key] : _a;
      let vb = key ? _b[key] : _b;
      if (va === undefined && vb === undefined) {
        continue;
      }
      if (va === undefined) {
        return 1;
      }
      if (vb === undefined) {
        return -1;
      }
      if (!caseSensitive) {
        va = va.toLowerCase();
        vb = vb.toLowerCase();
      }
      if (Array.isArray(order[idx])) {
        const d = order[idx].indexOf(va) - order[idx].indexOf(vb);
        if (d !== 0) {
          return d;
        } else {
          continue;
        }
      }
      let a, b;
      if (order[idx] === "numeric") {
        a = parseFloat(va);
        b = parseFloat(vb);
        if (Number.isNaN(a)) {
          a = 0;
        }
        if (Number.isNaN(b)) {
          b = 0;
        }
      } else if (order[idx] === "alpha") {
        a = removeDiacritics(va);
        b = removeDiacritics(vb);
      } else {
        throw new Error(`Unknown order ${order[idx]}`);
      }
      if (a === b) {
        continue;
      }
      return a < b ? -1 : 1;
    }
    return 0;
  };
}
export function mergeObjects<T>(a?: T, b?: Partial<T>): T {
  const res = { ...a };
  for (const key of Object.keys({ ...b, ...a })) {
    if (b[key as keyof T]) {
      res[key as keyof T] = b[key as keyof T] as any;
    }
  }
  return res;
}

export function removeDiacritics(from: string): string {
  return from.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function uuid(): string {
  return (
    new Date().getTime().toString(36) + Math.random().toString(36).slice(2)
  );
}

export function hash(from: string): string {
  return from
    .split("")
    .reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0)
    .toString(36);
}

export function fixedEncodeURIComponent(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, function (c) {
    return "%" + c.charCodeAt(0).toString(16);
  });
}

export function namify(s: string) {
  return s.replace(/[^\w]+/gi, "-");
}

export function cssSplitValue(v: string): { value: number; unit: string } {
  if (typeof v === "string" && v !== "") {
    var split = v.match(/^([-.\d]+(?:\.\d+)?)(.*)$/)!;
    if (split.length > 2)
      return { value: parseFloat(split[1].trim()), unit: split[2].trim()! };
  }
  return { value: parseFloat(v), unit: "" };
}

const debounceFcts = new Map<
  Function | string,
  { f: Function; elapse: number; res?: any }
>();
/**
 * Make sure that the function f is called at most every <delay> milliseconds
 * @param f
 * @param delay
 */
export async function debounce(
  f: Function,
  delay: number = 1000,
  guid?: string,
  atStart?: boolean,
) {
  delay = delay ? delay : 1000;
  const key = guid || f;
  if (debounceFcts.has(key)) {
    const fct = debounceFcts.get(key)!;
    fct.f = f;
    return fct.res;
  } else {
    const p = new Promise(async (resolve) => {
      await sleep(0);
      if (atStart) {
        const r = debounceFcts.get(key)?.f();
        if (r instanceof Promise) r.then(resolve);
      }
      await sleep(delay! / 1000);
      if (!atStart) {
        const r = debounceFcts.get(key)?.f();
        if (r instanceof Promise) r.then(resolve);
      }
      debounceFcts.delete(key);
    });
    debounceFcts.set(key, { elapse: Date.now() + delay!, f, res: p });
    return p;
  }
}
/**
 * Debounce a function
 * @param f the function to debounce
 * @param delay the delay in milliseconds
 * @param guid the guid to use to identify the function
 * @param atStart weather to call the function at the start or at the end of the delay
 * @returns
 */
export function debounced<T extends Function>(
  f: T,
  delay: number = 1000,
  atStart: boolean = false,
): T {
  return ((...args: any[]) =>
    debounce(() => f(...args), delay, undefined, atStart)) as unknown as T;
}

export function isMediaUrl(url: string): boolean {
  const ext = url.toLowerCase().split(".").pop()!;
  return pictureExtensions.includes(ext) || videoExtensions.includes(ext);
}

export function isPicture(entry: AlbumEntry): boolean {
  return !!pictureExtensions.find((e) => entry.name.toLowerCase().endsWith(e));
}

export function isAnimated(entry: AlbumEntry): boolean {
  return !!animatedPictureExtensions.find((e) =>
    entry.name.toLowerCase().endsWith(e),
  );
}

export function isVideo(entry: AlbumEntry): boolean {
  return !!videoExtensions.find((e) => entry.name.toLowerCase().endsWith(e));
}

export function isVideoUrl(url: string): boolean {
  return !!videoExtensions.find((e) => url.toLowerCase().endsWith(e));
}

export function range(from: number, to?: number, step: number = 1): number[] {
  if (to === undefined) {
    to = from - 1;
    from = 0;
  }
  const dir = from < to ? step : -step;
  const res = [];
  while (from <= to) {
    res.push(from);
    from += dir;
  }
  return res;
}

export function rectanglesIntersect(
  a: { p1: { x: number; y: number }; p2: { x: number; y: number } },
  b: { p1: { x: number; y: number }; p2: { x: number; y: number } },
) {
  if (Math.min(a.p1.x, a.p2.x) > Math.max(b.p1.x, b.p2.x)) return false;
  if (Math.min(b.p1.x, b.p2.x) > Math.max(a.p1.x, a.p2.x)) return false;
  if (Math.min(a.p1.y, a.p2.y) > Math.max(b.p1.y, b.p2.y)) return false;
  if (Math.min(b.p1.y, b.p2.y) > Math.max(a.p1.y, a.p2.y)) return false;
  return true;
}
/**
 * Rectangle expressed as a set of 0->1 values
 */
export type RectArea = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/*
# Picasa uses a special string format to store crop boxes of
# detected faces and from an applied crop filters. The number encased
# in the rect64() statement is a 64 bit hexadecimal number:

#     rect64(3f845bcb59418507)

# break this number into 4 16-bit numbers by using substrings:

# '3f845bcb59418507'.substring(0,4) //"3f84"
# '3f845bcb59418507'.substring(4,8) //"5bcb"
# '3f845bcb59418507'.substring(8,12) // "5941"
# '3f845bcb59418507'.substring(12,16) // "8507"

# convert each obtained substring to an integer and divide it
# by the highest 16-bit number (2^16 = 65536), which should give 0 < results < 1.
# these are the relative coordinates of the crop rectangle (left,top,right,bottom):

# parseInt("3f84",16)/65536 //0.24810791015625  - left
# parseInt("5bcb",16)/65536 //0.3585662841796875 - top
# parseInt("5941",16)/65536 //0.3486480712890625 - right (measured from left)
# parseInt("8507",16)/65536 //0.5196380615234375 - bottom (measured from top)
*/
export function decodeRect(rect: string): RectArea {
  if (!rect) {
    throw new Error("No Rect");
  }
  const rectData = [
    rect.toLowerCase().match(/^rect64\(([0-9a-f]*)\)/),
    rect.toLowerCase().match(/^([0-9a-f]*)/),
    rect.toLowerCase().match(/^-([0-9a-f]*)/),
  ].find((v) => v && v[1]);
  if (rectData && rectData[1]) {
    const split = rectData[1].padStart(16, "0").match(/.{4}/g)!;
    return {
      left: parseInt(split[0], 16) / 65535,
      top: parseInt(split[1], 16) / 65535,
      right: parseInt(split[2], 16) / 65535,
      bottom: parseInt(split[3], 16) / 65535,
    };
  }
  throw new Error("Invalid Rect");
}

export function toBase64(data: any) {
  return Base64.encode(data, true);
}

export function fromBase64(data: string) {
  return Base64.decode(data);
}

export function getOperationList(filters: string): string[] {
  return (filters || "").split(";").filter((v) => v);
}

export function fromHex(hex: string): number[] {
  return hex.match(/.{1,2}/g)!.map((v) => parseInt(v, 16));
}
export function toHex2(v: number): string {
  return Math.ceil(v).toString(16).padStart(2, "0");
}

export function clipColor(c: number): number {
  return c < 0 ? 0 : c > 255 ? 255 : c;
}

export function encodeRect(rect: RectArea): string {
  return (
    Math.floor(rect.left * 65535)
      .toString(16)
      .padStart(4, "0") +
    Math.floor(rect.top * 65535)
      .toString(16)
      .padStart(4, "0") +
    Math.floor(rect.right * 65535)
      .toString(16)
      .padStart(4, "0") +
    Math.floor(rect.bottom * 65535)
      .toString(16)
      .padStart(4, "0")
  );
}

export type PicasaFilter = {
  name: string;
  args: string[];
};

export function albumInFilter(album: Album, normalizedFilter: string): boolean {
  if (removeDiacritics(album.name).toLowerCase().includes(normalizedFilter)) {
    return true;
  }
  return false;
}

export function encodeOperations(operations: PicasaFilter[]): string {
  return operations
    .map((operation) => `${operation.name}=${operation.args.join(",")}`)
    .join(";");
}

export function decodeOperations(operations: string): PicasaFilter[] {
  const cmds = operations.split(";").filter((v) => v);
  const res: { name: string; args: string[] }[] = [];
  for (const cmd of cmds) {
    res.push(decodeOperation(cmd));
  }
  return res;
}

export function decodeFaces(faces: string): FaceList {
  return faces
    .split(";")
    .map((faceSpec) => {
      const [rect, hash] = faceSpec.split(",");
      return { rect, hash };
    })
    .filter((v) => v.hash && v.rect);
}

export function encodeFaces(faces: FaceList): string {
  return faces.map(({ hash, rect }) => `${rect},${hash}`).join(";");
}

export function decodeOperation(operation: string): PicasaFilter {
  const [name, argsList] = operation.split("=");
  return { name: name, args: argsList ? argsList.split(",") : [] };
}

export function flattenObject(ob: any) {
  var toReturn: any = {};

  for (var i in ob) {
    if (!ob.hasOwnProperty(i)) continue;

    if (typeof ob[i] == "object" && ob[i] !== null) {
      var flatObject = flattenObject(ob[i]);
      for (var x in flatObject) {
        if (!flatObject.hasOwnProperty(x)) continue;
        toReturn[x] = flatObject[x];
      }
    } else if (Buffer.isBuffer(ob[i])) {
      toReturn[i] = ob[i].toString({ encoding: "utf8" });
    } else {
      toReturn[i] = ob[i];
    }
  }
  return toReturn;
}

export function differs(a: any, b: any) {
  return (
    Object.getOwnPropertyNames(a).find((p) => a[p] !== b[p]) ||
    Object.getOwnPropertyNames(b).find((p) => a[p] !== b[p])
  );
}

export function valuesOfEnum<T>(e: T): any[] {
  return keysOfEnum(e).map((k) => e[k]);
}

export function keysOfEnum<T>(e: T): (keyof T)[] {
  return Object.keys(e as any).filter((k) =>
    Number.isNaN(Number(k)),
  ) as unknown as (keyof T)[];
}

export function decodeRotate(rotateString?: string): number {
  const rotateValue = rotateString
    ? rotateString.match(/rotate\((\d+)\)/)
    : undefined;
  // rotation increment
  const value =
    parseInt(rotateValue && rotateValue.length ? rotateValue[1] : "0") || 0;
  return value;
}

export function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c: string) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
    }
    return "";
  });
}
export function dateOfAlbumFromName(name: string) {
  const matched = name.match(/([0-9]{4}).?([0-9]{2}).?([0-9]{2})/);
  if (matched) {
    const [y, m, d] = matched.slice(1);
    if (y && m && d) {
      return new Date(parseInt(y), parseInt(m), parseInt(d));
    }
  }
  return undefined;
}
export function compareAlbumEntry(a: AlbumEntry, b: AlbumEntry) {
  if (a.album.name !== b.album.name)
    return a.album.name < b.album.name ? -1 : 1;
  if (a.name === b.name) return 0;
  return a.name < b.name ? -1 : 1;
}

const sep = "~";
export function albumEntryFromId(id: string): AlbumEntry | null {
  const [qualifier, valid, key, name, kind, entry] = id.split(sep);
  if (valid === "entry") {
    return { album: { key, name, kind: kind as AlbumKind }, name: entry };
  }
  return null;
}

export function idFromAlbumEntry(
  entry: AlbumEntry,
  qualifier: string = "",
): string {
  return `${qualifier}${sep}entry${sep}${entry.album.key}${sep}${entry.album.name}${sep}${entry.album.kind}${sep}${entry.name}`;
}

export function hashString(b: string) {
  for (var a = 0, c = b.length; c--; )
    (a += b.charCodeAt(c)), (a += a << 10), (a ^= a >> 6);
  a += a << 3;
  a ^= a >> 11;
  return (((a + (a << 15)) & 4294967295) >>> 0).toString(16);
}

export function pathForEntryMetadata(entry: AlbumEntry) {
  return {
    path: [entry.album.name],
    filename: entry.name,
  };
}

export function prng(a: number) {
  return function () {
    var t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const readys: { [key: string]: Promise<void> } = {};
const readyResolves: { [key: string]: Function } = {};

export function setReady(readyLabel: string) {
  readyResolves[readyLabel]();
}

export function buildReadySemaphore(readyLabel: string) {
  readys[readyLabel] = new Promise((resolve) => {
    readyResolves[readyLabel] = resolve;
  });
  return readys[readyLabel];
}

export function jsonifyObject(instance: any): any {
  if (Array.isArray(instance)) {
    return (instance as Array<any>).map((v) => jsonifyObject(v));
  }
  const jsonObj: any = {};
  const proto = Object.getPrototypeOf(instance);
  const proproto = Object.getPrototypeOf(proto);

  for (let key of [
    ...Object.getOwnPropertyNames(instance),
    ...[
      ...Object.entries(Object.getOwnPropertyDescriptors(proto)),
      ...(proproto
        ? Object.entries(Object.getOwnPropertyDescriptors(proproto))
        : []),
    ]
      .filter(([_name, x]) => x.get)
      .map(([n]) => n),
  ]) {
    if (key.startsWith("_")) continue;
    else jsonObj[key] = instance[key];
    let value = jsonObj[key];
    if (value instanceof Float32Array) {
      jsonObj[key] = Array.from(value);
    } else if (typeof value === "object") {
      jsonObj[key] = jsonifyObject(value);
    }
  }
  return jsonObj;
}

export function substitute(
  template: string,
  values: { [key: string]: string },
) {
  return template.replace(/\$([A-Z0-9_]+)\$/g, (match, p1) => {
    const v = values[p1];
    if (v === undefined) {
      throw `No value for ${p1}`;
    }
    return v;
  });
}

/**
 * Returns a memoizer function that will cache the results of the data function
 * The cache is scoped to the returned memoize function (multiple memoizer functions will have different caches)
 * @returns
 */
export function memoizer() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cache: { [key: string]: any } = {};
  return function memoize<T>(
    keys: string[],
    data: () => Promise<T>,
  ): Promise<T> {
    const k = keys.join(",");
    if (cache[k]) return cache[k];
    cache[k] = data();
    return cache[k];
  };
}

export function safeHtml(s: string) {
  return s.replace(/[\u00A0-\u9999<>\&]/g, function (i) {
    return "&#" + i.charCodeAt(0) + ";";
  });
}

import {
  AlbumEntry,
  pictureExtensions,
  videoExtensions
} from "../types/types";

export async function sleep(delay: number) {
  return new Promise((resolve) => setTimeout(resolve, delay * 1000));
}

export function sortByKey<T>(array: T[], key: keyof T, reverse?: boolean) {
  const m = reverse ? -1 : 1;
  array.sort(alphaSorter(false, reverse, key as string));
}

export function alphaSorter(caseSensitive: boolean = true, reverse: boolean = false, key?: string): (a:any, b:any) => number {
  const m = reverse ? -1 : 1;
  if (caseSensitive)
    return (_a, _b) => {
      const a = removeDiacritics(`${key?_a[key]:_a}`);
      const b = removeDiacritics(`${key?_b[key]:_b}`);
      return m * (a < b ? -1 : a === b ? 0 : 1);
    };
  else
    return (_a, _b) => {
      const a = removeDiacritics(`${key?_a[key]:_a}`);
      const b = removeDiacritics(`${key?_b[key]:_b}`);
      const la = a.toLowerCase();
      const lb = b.toLowerCase();
      return m * (la < lb ? -1 : la === lb ? 0 : 1);
    };
}

export function removeDiacritics(from: string): string {
  return from.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function uuid(): string {
  return (
    new Date().getTime().toString(36) + Math.random().toString(36).slice(2)
  );
}

export function fixedEncodeURIComponent(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, function (c) {
    return '%' + c.charCodeAt(0).toString(16);
  });
}

export function cssSplitValue(v: string): { value: number, unit: string } {
  if (typeof v === 'string' && v !== "") {
    var split = v.match(/^([-.\d]+(?:\.\d+)?)(.*)$/)!;
    if (split.length > 2)
      return { 'value': parseFloat(split[1].trim()), 'unit': split[2].trim()! };
  }
  return { 'value': parseFloat(v), 'unit': "" }
}

const debounceFcts = new Map<Function | string, { f: Function, elapse: number }>();
/**
 * Make sure that the function f is called at most every <delay> milliseconds
 * @param f
 * @param delay
 */
export function debounce(f: Function, delay?: number, guid?: string, atStart?: boolean) {
  delay = delay ? delay : 1000;
  const key = guid || f;
  if (debounceFcts.has(key)) {
    debounceFcts.get(key)!.f = f;
  } else {
    debounceFcts.set(f, { elapse: Date.now() + delay, f });
    (async () => {
      if (atStart) {
        f();
      }
      await sleep(delay / 1000);
      if (!atStart) {
        f();
      }
      debounceFcts.delete(key);
    })();
  }
}

export function isMediaUrl(url: string): boolean {
  const ext = url.toLowerCase().split(".").pop()!;
  return pictureExtensions.includes(ext) || videoExtensions.includes(ext);
}

export function isPicture(entry: AlbumEntry): boolean {
  return !!pictureExtensions.find((e) => entry.name.toLowerCase().endsWith(e));
}

export function isVideo(entry: AlbumEntry): boolean {
  return !!videoExtensions.find((e) => entry.name.toLowerCase().endsWith(e));
}

export function isVideoUrl(url: string): boolean {
  return !!videoExtensions.find((e) => url.toLowerCase().endsWith(e));
}

export function range(from: number, to: number): number[] {
  const dir = from < to ? 1 : -1;
  const res = [];
  while (from != to) {
    res.push(from);
    from += dir;
  }
  res.push(from);
  return res;
}

export function rectanglesIntersect(
  a: { p1: { x: number; y: number }; p2: { x: number; y: number } },
  b: { p1: { x: number; y: number }; p2: { x: number; y: number } }
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
export type RectRange = { left: number; top: number; right: number; bottom: number };

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
export function decodeRect(
  rect: string
): RectRange {
  if (!rect) {
    throw new Error("No Rect");
  }
  const rectData =
    rect.toLowerCase().match(/rect64\(([0-9a-f]*)\)/) ||
    rect.toLowerCase().match(/([0-9a-f]*)/);
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

export function fromHex(hex: string): number[] {
  return hex.match(/.{1,2}/g)!.map((v) => parseInt(v, 16));
}
export function toHex2(v: number): string {
  return Math.ceil(v).toString(16).padStart(2, "0");
}

export function clipColor(c: number): number {
  return c < 0 ? 0 : c > 255 ? 255 : c;
}

export function encodeRect(rect: RectRange): string {
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

export function decodeOperations(
  operations: string
): { name: string; args: string[] }[] {
  const cmds = operations.split(";").filter((v) => v);
  const res: { name: string; args: string[] }[] = [];
  for (const cmd of cmds) {
    res.push(decodeOperation(cmd));
  }
  return res;
}

export function decodeOperation(
  operation: string
): {
  name: string;
  args: string[];
} {
  const [name, argsList] = operation.split("=");
  return { name, args: argsList ? argsList.split(",") : [] };
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

class Mutex {
  constructor() {
    this.current = Promise.resolve();
    this.nest = 0;
  }
  private current: Promise<void>;
  private nest: number;
  lockDate: Date = new Date();
  lock() {
    let _resolve: Function;
    this.lockDate = new Date();
    const p = new Promise<void>((resolve) => {
      _resolve = () => {
        if ((Date.now() - this.lockDate.getTime()) > 1000) {
          //debugger;
        }
        this.lockDate = new Date();
        this.nest--;
        return resolve();
      };
    });
    // Caller gets a promise that resolves when the current outstanding
    // lock resolves
    const rv = this.current.then(() => _resolve);
    // Don't allow the next request until the new promise is done
    this.current = p;
    // Return the new promise
    this.nest++;
    return rv;
  }
  locked() {
    return this.nest > 0;
  }
}
const locks: Map<string, Mutex> = new Map();

function checkForVeryLongLocks() {
  const now = new Date();
  const table = Array.from(locks.entries()).filter(([name, mutex]) => mutex.locked()).map(([name, mutex]) => ({
    name,
    duration: now.getTime() - mutex.lockDate.getTime()
  })).filter(l => l.duration > 1000);
  if (table.length > 0) {
    console.warn("These locks are taking longer than expected", JSON.stringify(table));
    console.table(table);
  }
}

function pruneLocks() {
  // Prune unused mutexes
  for (const [name, mutex] of locks.entries()) {
    if (!mutex.locked()) {
      locks.delete(name);
    }
  }
  checkForVeryLongLocks();
}

export function differs(a: any, b:any) {
  return Object.getOwnPropertyNames(a).find(p => a[p] !== b[p]) ||
  Object.getOwnPropertyNames(b).find(p => a[p] !== b[p])
}

export async function lock(label: string): Promise<Function> {
  pruneLocks();
  if (!locks.has(label)) {
    locks.set(label, new Mutex());
  }
  return locks.get(label)!.lock();
}

export function lockedLocks(): string[] {
  return Array.from(locks)
    .filter((l) => l[1].locked())
    .map((l) => l[0]);
}

export function valuesOfEnum<T>(e: T): any[] {
  return Object.values(e as any).filter(v => !isNaN(Number(v)));
}

export function keysOfEnum<T>(e: T): (keyof T)[] {
  return Object.keys(e as any) as unknown as (keyof T)[];
}

export function startLockMonitor() {
  setInterval(checkForVeryLongLocks, 10000);
}

export function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c: string) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
    return '';
  });
}
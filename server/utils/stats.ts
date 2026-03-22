import { WriteStream, createWriteStream } from "fs";
import { open } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { uuid } from "../../shared/lib/utils";
import { imagesRoot } from "./constants";

const sep = "§";
function line(bucket: string, type: string, data: string) {
  return `${new Date().toISOString()}${sep}${bucket}${sep}${type}${sep}${data}\n`;
}
const statFile = join(imagesRoot, ".mypicasa.stats");
function getStream() {
  const self = getStream as any;
  self._stream =
    self._stream ||
    createWriteStream(statFile, {
      flags: "a",
      encoding: "utf-8",
    });
  return self._stream as WriteStream;
}

const delays: { [id: string]: { name: string; start: number } } = {};
export function delayStart(name: string): string {
  const id = uuid();
  delays[id] = { name, start: new Date().getTime() };
  return id;
}

export function delayEnd(id: string) {
  const e = delays[id];
  getStream().write(line(e.name, "set", `${new Date().getTime() - e.start}`));
}

export function rate(counter: string, divider: number = 1) {
  getStream().write(line(counter, "rate", `${divider}`));
}
export function inc(counter: string) {
  getStream().write(line(counter, "delta", "1"));
}
export function dec(counter: string) {
  getStream().write(line(counter, "delta", "-1"));
}
export function set(counter: string, value: string | number) {
  getStream().write(line(counter, "set", `${value}`));
}

/** Avoid reading multi‑GB `.mypicasa.stats` on every /stats poll (management UI). */
const MAX_STATS_TAIL_BYTES = 512 * 1024;
const MAX_POINTS_PER_SERIES = 400;

async function readStatsFileTail(): Promise<string> {
  if (!existsSync(statFile)) return "";
  const fh = await open(statFile, "r");
  try {
    const size = (await fh.stat()).size;
    if (size === 0) return "";
    const readLen = Math.min(size, MAX_STATS_TAIL_BYTES);
    const buf = new Uint8Array(readLen);
    const { bytesRead } = await fh.read(buf, 0, readLen, size - readLen);
    let text = new TextDecoder().decode(buf.subarray(0, bytesRead));
    if (size > readLen) {
      const firstNl = text.indexOf("\n");
      if (firstNl !== -1) text = text.slice(firstNl + 1);
    }
    return text;
  } finally {
    await fh.close();
  }
}

function historyFromLines(lines: string[]): { [bucket: string]: { x: number; y: number }[] } {
  const res = new Map<
    string,
    { bucket: string; date: number; value: number }
  >();
  const bucketVals = new Map<string, number>();
  for (const line of lines) {
    const parts = line.split(sep);
    if (parts.length < 4) continue;
    const [dateStr, bucket, type, payload] = parts;
    const dateInSec = Math.floor(Date.parse(dateStr) / 1000);
    if (Number.isNaN(dateInSec)) continue;
    let val: number = 0;
    switch (type) {
      case "delta":
        bucketVals.set(
          bucket,
          (val = (bucketVals.get(bucket) || 0) + parseInt(payload, 10)),
        );
        break;
      case "rate": {
        const div = parseInt(payload, 10);
        if (!Number.isFinite(div) || div <= 0) break;
        const dateDiv = Math.floor(dateInSec / div);
        const rk = bucket + dateDiv;
        bucketVals.set(rk, (val = (bucketVals.get(rk) || 0) + 1));
        break;
      }
      case "set":
        bucketVals.set(bucket, (val = parseInt(payload, 10)));
        break;
      default:
        console.warn("Unknown stat type", type);
    }
    res.set(bucket + dateInSec, { bucket, date: dateInSec, value: val });
  }
  const out: { [bucket: string]: { x: number; y: number }[] } = {};
  res.forEach((v) => {
    let b = out[v.bucket];
    if (!b) b = out[v.bucket] = [];
    b.push({ x: v.date, y: v.value });
  });
  for (const k of Object.keys(out)) {
    out[k].sort((a, b) => a.x - b.x);
    if (out[k].length > MAX_POINTS_PER_SERIES) {
      out[k] = out[k].slice(-MAX_POINTS_PER_SERIES);
    }
  }
  return out;
}

export async function history(): Promise<object> {
  const text = await readStatsFileTail();
  if (!text) return {};
  const lines = text.split("\n").filter((v) => v);
  return historyFromLines(lines);
}

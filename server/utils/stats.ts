import { WriteStream, createWriteStream } from "fs";
import { readFile } from "fs/promises";
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
  self._stream = self.stream || createWriteStream(statFile, {
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

export async function history(): Promise<object> {
  let data = (await readFile(statFile, { encoding: "utf-8" }))
    .split("\n")
    .filter((v) => v);
  const res = new Map<
    string /*bucket + date*/,
    { bucket: string; date: number /* date - rounded to secs */; value: number }
  >();
  const bucketVals = new Map<string, number>();
  for (const line of data) {
    const [date, bucket, type, data] = line.split(sep);
    const dateInSec = Math.floor(Date.parse(date) / 1000);
    let val: number = 0;
    switch (type) {
      case "delta":
        bucketVals.set(
          bucket,
          (val = (bucketVals.get(bucket) || 0) + parseInt(data))
        );
        break;
      case "rate":
        const dateDiv = Math.floor(dateInSec / parseInt(data));
        bucketVals.set(
          bucket + dateDiv,
          (val = (bucketVals.get(bucket + dateDiv) || 0) + 1)
        );
        break;
      case "set":
        bucketVals.set(bucket, (val = parseInt(data)));
        break;
      default:
        console.warn("Unknown stat type", type);
    }
    res.set(bucket + dateInSec, { bucket, date: dateInSec, value: val });
  }
  // Timeseries per bucket
  const out: { [bucket: string]: { x: number; y: number }[] } = {};
  res.forEach((v, key) => {
    let b = out[v.bucket];
    if (!b) {
      b = out[v.bucket] = [];
    }
    b.push({ x: v.date, y: v.value });
  });
  return out;
}

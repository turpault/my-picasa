import { createWriteStream } from "fs";
import { readFile } from "fs/promises";

const sep="§"
function line( bucket: string, type:string, data:string) {
  return `${new Date().toISOString()}${sep}${bucket}${sep}${type}${sep}${data}\n`;
}
const stream = createWriteStream('/tmp/mypicasa.stats', {flags: 'a', encoding:'utf-8'});

export function rate(counter:string, divider: number = 1) {
  stream.write(line(counter, 'rate', `${divider}`));
}
export function inc(counter:string) {
  stream.write(line(counter, 'delta', '1'));
}
export function dec(counter:string) {
  stream.write(line(counter, 'delta', '-1'));
}
export function set(counter:string, value:string | number) {
  stream.write(line(counter, 'set', `${value}`));
}
rate('reboot', 60); // one cumulated mesure per minute

export async function history():Promise<object> {
  let data = (await readFile('/tmp/mypicasa.stats', {encoding: 'utf-8'})).split('\n').filter(v=>v);
  const res = new Map<string/*bucket + date*/, {bucket: string, date:number /* date - rounded to secs */, value: number}>();
  const bucketVals = new Map<string, number>();
  for(const line of data) {
    const [date, bucket, type, data] = line.split(sep);
    const dateInSec = Math.floor(Date.parse(date)/1000);
    let val:number = 0;
    switch(type) {
      case 'delta':
        bucketVals.set(bucket, val=((bucketVals.get(bucket)||0) + parseInt(data)));
        break;
      case 'rate':
        const dateDiv = Math.floor(dateInSec / parseInt(data));
        bucketVals.set(bucket+dateDiv, val = ((bucketVals.get(bucket+dateDiv)||0) + 1));
        break;
      case 'set':
        bucketVals.set(bucket, (val=parseInt(data)));
        break;
      default:
        console.warn('Unknown stat type', type);
      }
    res.set(bucket+dateInSec, {bucket, date: dateInSec, value: val});
  }
  // Timeseries per bucket
  const out: {[bucket: string]: {x:number, y:number}[]} = {};
  res.forEach((v, key) => {
    let b = out[v.bucket];
    if(!b) {
      b = out[v.bucket] = [];
    }
    b.push({x:v.date, y:v.value});
  });
  return out;
}

import { createWriteStream } from "fs";
import { readFile } from "fs/promises";

const sep="§"
function line( bucket: string, type:string, data:string) {
  return `${new Date().toISOString()}${sep}${bucket}${sep}${type}${sep}${data}\n`;
}
const stream = createWriteStream('/tmp/mypicasa.stats', {flags: 'a', encoding:'utf-8'});
stream.write(line('reboot', 'inc', '1'));

export function inc(counter:string) {
  stream.write(line(counter, 'delta', '1'));
}
export function dec(counter:string) {
  stream.write(line(counter, 'delta', '-1'));
}
export function set(counter:string, value:string | number) {
  stream.write(line(counter, 'set', `${value}`));
}

export async function history():Promise<object> {
  let data = (await readFile('/tmp/mypicasa.stats', {encoding: 'utf-8'})).split('\n');
  const res = new Map<string/*bucket + date*/, {bucket: string, date:number /* date - rounded to secs */, value: number}>();
  const bucketVals = new Map<string, number>();
  for(const line in data) {
    const [date, bucket, type, data] = line.split(sep);
    const dateInSec = Math.floor(new Date(date).getTime()/1000);
    if(!bucketVals.has(bucket)) {
      bucketVals.set(bucket, 0);
    }
    switch(type) {
      case 'delta':
        bucketVals.set(bucket, bucketVals.get(bucket)! + parseInt(data));
        break;
        case 'set':
          bucketVals.set(bucket, parseInt(data));
          break;
      }
    res.set(bucket+dateInSec, {bucket, date: dateInSec, value: bucketVals.get(bucket)!});
  }
  // Timeseries per bucket
  const out: {bucket: string, data:{x:number, y:number}[]}[] = [];
  Object.values(res).forEach(v => {
    let b = out[v.bucket];
    if(!b) {
      b = {bucket: v.bucket, data:[]};
      out[v.bucket] = b;
    }
    b.data.push({x:v.date, y:v.value});
  });
  return out;
}

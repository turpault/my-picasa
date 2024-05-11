import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { getRedisClient } from './redis-client';


export async function injestFiles(filesToIngest: string[]) {
  const client = await getRedisClient();
  let idx = 0;
  const timer = setInterval(() => {
    console.info(`Processed ${idx} positions`);
  }, 5000);
  for (const file of filesToIngest) {
    console.info('Processing file', file);
    const inStream = await createReadStream(file);

    var lineReader = createInterface({
      input: inStream
    });
    lineReader.on('line', async function (line) {
      const [type, k, lat, long, label] = line.split("|");
      try {
        const latF = parseFloat(lat), longF = parseFloat(long);
        if (Number.isNaN(latF) || Number.isNaN(longF))
          return;
        await client.geoadd(`locations|${type}`, longF, latF, label);
        idx++;
      } catch (e) {
        console.info(lat, long, parseFloat(lat), parseFloat(long), line);
        console.error(e);
      }
    });
    await new Promise(resolve => {
      lineReader.on('close', function () {
        console.info(`File ${file} complete - ${idx} lines processed`);
        resolve('all done, son');
      })
    });

  }
  clearInterval(timer);
}

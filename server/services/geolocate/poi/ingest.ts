import { createReadStream } from "fs";
import { createInterface } from "readline";
import { stat } from "fs/promises";
import { getProcessedFileInfo, insertPoiBatch, markFileAsProcessed } from "./poi-database";
import { imagesRoot } from "../../../utils/constants";
import { join } from "path";
import { readdir } from "fs/promises";

const CSVLocation = join(imagesRoot, ".locations");

export async function initPOIDB() {
  try {
    const files = await readdir(CSVLocation);
    for (const file of files) {
      if (file.toLowerCase().endsWith(".csv")) {
        await ingestFiles([join(CSVLocation, file)]);
      }
    }
  } catch (e) {
    console.error(e);
  }
}

async function ingestFiles(filesToIngest: string[]) {
  let idx = 0;
  const timer = setInterval(() => {
    console.info(`Processed ${idx} positions`);
  }, 5000);

  for (const file of filesToIngest) {
    // Get file modification time
    let fileMtime: string;
    try {
      const stats = await stat(file);
      fileMtime = stats.mtime.getTime().toString();
    } catch (e) {
      console.error(`Error getting file stats for ${file}:`, e);
      continue;
    }

    // Check if file has been processed and if modification time matches
    const processedRecord = getProcessedFileInfo(file);
    const isProcessed = processedRecord !== null;
    const mtimeMatches = processedRecord?.last_modified === fileMtime;

    // Only ingest if not processed or if modification time has changed
    if (!isProcessed || !mtimeMatches) {
      if (isProcessed && !mtimeMatches) {
        console.info(`File ${file} has been modified, re-processing...`);
      }
      console.info("Processing file", file);
      const inStream = createReadStream(file);

      const lineReader = createInterface({
        input: inStream,
      });

      const batchSize = 1000;
      let batch: Array<{ type: number; lat: number; lon: number; label: string }> = [];

      const flushBatch = () => {
        if (batch.length === 0) return;
        const inserted = insertPoiBatch(batch);
        idx += inserted;
        batch = [];
      };

      for await (const line of lineReader) {
        const [typeStr, k, lat, long, label] = line.split("|");
        try {
          const type = parseInt(typeStr);
          const latF = parseFloat(lat);
          const longF = parseFloat(long);

          if (Number.isNaN(latF) || Number.isNaN(longF) || Number.isNaN(type)) continue;

          batch.push({ type, lat: latF, lon: longF, label });

          if (batch.length >= batchSize) {
            flushBatch();
          }
        } catch (e) {
          console.error(`Error processing line: ${line}`, e);
        }
      }

      flushBatch(); // Flush remaining items

      // Mark file as processed with current modification time
      markFileAsProcessed(file, fileMtime);
      console.info(`File ${file} complete - ${idx} lines processed`);
    }
  }
  clearInterval(timer);
}

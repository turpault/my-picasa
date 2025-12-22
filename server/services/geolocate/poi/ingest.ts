import { createReadStream } from "fs";
import { createInterface } from "readline";
import { getPoiDb } from "./sqlite-client";
import { imagesRoot } from "../../../../utils/constants";
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
  const db = getPoiDb();
  let idx = 0;
  const timer = setInterval(() => {
    console.info(`Processed ${idx} positions`);
  }, 5000);

  const insertStmt = db.prepare(
    "INSERT INTO poi (type, lat, lon, label) VALUES (?, ?, ?, ?)"
  );
  
  const checkFileStmt = db.prepare(
    "SELECT 1 FROM processed_files WHERE filename = ?"
  );
  
  const markFileStmt = db.prepare(
    "INSERT OR REPLACE INTO processed_files (filename) VALUES (?)"
  );

  for (const file of filesToIngest) {
    const isProcessed = checkFileStmt.get(file);
    
    if (!isProcessed) {
      console.info("Processing file", file);
      const inStream = createReadStream(file);

      const lineReader = createInterface({
        input: inStream,
      });

      const batchSize = 1000;
      let batch: any[] = [];

      const flushBatch = () => {
        if (batch.length === 0) return;
        const transaction = db.transaction((items) => {
          for (const item of items) {
            insertStmt.run(item.type, item.lat, item.lon, item.label);
          }
        });
        transaction(batch);
        idx += batch.length;
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
      
      markFileStmt.run(file);
      console.info(`File ${file} complete - ${idx} lines processed`);
    }
  }
  clearInterval(timer);
}

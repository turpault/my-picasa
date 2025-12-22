import Database from "better-sqlite3";
import { join } from "path";
import { imagesRoot } from "../../../server/utils/constants";
import { info } from "console";

let dbInstance: Database.Database | null = null;

export function getPoiDb(): Database.Database {
  if (!dbInstance) {
    const dbPath = join(imagesRoot, "poi.db");
    dbInstance = new Database(dbPath);
    
    // Initialize POI table
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS poi (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type INTEGER NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        label TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_poi_type ON poi(type);
      CREATE INDEX IF NOT EXISTS idx_poi_coords ON poi(lat, lon);
    `);

    // Initialize processed files table
    dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS processed_files (
        filename TEXT PRIMARY KEY,
        processed_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    info(`POI Database initialized at ${dbPath}`);
  }
  return dbInstance;
}

export function closePoiDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}


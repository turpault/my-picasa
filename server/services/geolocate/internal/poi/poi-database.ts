import { Database } from "bun:sqlite";
import { POI_DB_PATH } from "../../../../utils/db-paths";
import { ensureDbFormatOrRemove, isDev } from "../../../../utils/ensure-db-format";
import { validateSqliteFileOrQuarantine } from "../../../../utils/sqlite-validate";
import { enqueueDb } from "../../../../utils/db-queue";
import { info } from "console";
import { GeoPOI } from "../../../../../shared/types/types";
import { POI_TYPE } from "./poi-types";

let dbInstance: Database | null = null;

/**
 * Get the POI database instance (singleton)
 */
export function getPoiDb(): Database {
  if (!dbInstance) {
    const dbPath = POI_DB_PATH;
    validateSqliteFileOrQuarantine(dbPath, "poi");
    if (isDev()) {
      ensureDbFormatOrRemove(dbPath, (db) => {
        const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='poi'").get();
        if (!row) throw new Error("POI table missing");
      });
    }
    const db = new Database(dbPath, { create: true });
    dbInstance = db;

    // Initialize POI table
    db.run(`
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
    db.run(`
      CREATE TABLE IF NOT EXISTS processed_files (
        filename TEXT PRIMARY KEY,
        last_modified TEXT NOT NULL,
        processed_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migrate: add last_modified column if it doesn't exist (for existing databases)
    try {
      const columnInfo = db.prepare(`
        SELECT name FROM pragma_table_info('processed_files') WHERE name = 'last_modified'
      `).get() as { name: string } | undefined;

      if (!columnInfo) {
        info("Migrating processed_files table: adding last_modified column");
        // First add as nullable
        db.run(`ALTER TABLE processed_files ADD COLUMN last_modified TEXT;`);
        // Set default value from processed_at for existing rows
        db.run(`UPDATE processed_files SET last_modified = processed_at WHERE last_modified IS NULL;`);
        info("Migration completed: last_modified column added");
      }
    } catch (error) {
      // If migration fails, log but continue
      info(`Migration check failed: ${error}`);
    }

    info(`POI Database initialized at ${dbPath}`);
  }
  // At this point, dbInstance is guaranteed to be non-null
  return dbInstance!;
}

/**
 * Close the POI database connection
 */
export function closePoiDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Get processed file information (last modification time)
 * Returns null if file has not been processed
 */
export async function getProcessedFileInfo(
  filename: string
): Promise<{ last_modified: string } | null> {
  return enqueueDb(() => {
    const db = getPoiDb();
    const result = db
      .prepare("SELECT last_modified FROM processed_files WHERE filename = ?")
      .get(filename) as { last_modified: string } | undefined;
    return result || null;
  });
}

/**
 * Insert a batch of POI entries
 * Returns the number of entries inserted
 */
export async function insertPoiBatch(
  items: Array<{ type: number; lat: number; lon: number; label: string }>
): Promise<number> {
  if (items.length === 0) return 0;

  return enqueueDb(() => {
    const db = getPoiDb();
    const insertStmt = db.prepare("INSERT INTO poi (type, lat, lon, label) VALUES (?, ?, ?, ?)");

    try {
      db.run("BEGIN");
      for (const item of items) {
        insertStmt.run(item.type, item.lat, item.lon, item.label);
      }
      db.run("COMMIT");
    } catch (error) {
      db.run("ROLLBACK");
      throw error;
    }
    return items.length;
  });
}

/**
 * Mark a file as processed with its modification time
 */
export async function markFileAsProcessed(
  filename: string,
  lastModified: string
): Promise<void> {
  return enqueueDb(() => {
    const db = getPoiDb();
    db.prepare("INSERT OR REPLACE INTO processed_files (filename, last_modified) VALUES (?, ?)")
      .run(filename, lastModified);
  });
}

/**
 * Get locations (points of interest) near the given latitude and longitude.
 * DB query runs in db-queue; CPU-heavy distance/loop processing runs outside to avoid blocking.
 */
export async function getLocations(
  lat: number,
  long: number,
): Promise<GeoPOI[]> {
  const types = interestingLocationTypes();
  const areas = interestingLocationAreas();
  const allCriteria = [...types, ...areas];
  const maxDistance = Math.max(...allCriteria.map(c => parseInt(c[1])));
  const latDelta = (maxDistance / 111000) * 1.5;
  const lonDelta = (maxDistance / (111000 * Math.cos(lat * (Math.PI / 180)))) * 1.5;
  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLon = long - lonDelta;
  const maxLon = long + lonDelta;
  const typeIds = allCriteria.map(c => c[0]);

  const query = `
    SELECT type, lat, lon, label
    FROM poi
    WHERE lat BETWEEN ? AND ?
      AND lon BETWEEN ? AND ?
      AND type IN (${typeIds.join(',')})
  `;

  const candidates = await enqueueDb(
    () =>
      getPoiDb()
        .prepare(query)
        .all(minLat, maxLat, minLon, maxLon) as {
        type: number;
        lat: number;
        lon: number;
        label: string;
      }[],
    "poi.getLocations"
  );

  const idsFromTypes = Object.fromEntries(
    Object.keys(POI_TYPE).map((v) => [POI_TYPE[v as keyof typeof POI_TYPE], v]),
  );

  const res: { loc: string; distance: number; category: string }[] = [];

  for (const candidate of candidates) {
    const dist = getDistanceFromLatLonInM(lat, long, candidate.lat, candidate.lon);
    const criteria = allCriteria.find(c => c[0] === candidate.type);
    if (criteria) {
      const maxDistForType = parseInt(criteria[1]);
      if (dist <= maxDistForType) {
        res.push({
          loc: candidate.label,
          category: idsFromTypes[candidate.type],
          distance: dist
        });
      }
    }
  }

  const uniqueRes: { [key: string]: typeof res[0] } = {};
  for (const r of res) {
    if (!uniqueRes[r.loc] || uniqueRes[r.loc].distance > r.distance) {
      uniqueRes[r.loc] = r;
    }
  }

  const finalRes: typeof res = [];
  for (const [typeId, maxDistStr] of allCriteria) {
    const maxDist = parseInt(maxDistStr);
    let closest: typeof res[0] | null = null;

    for (const candidate of candidates) {
      if (candidate.type === typeId) {
        const dist = getDistanceFromLatLonInM(lat, long, candidate.lat, candidate.lon);
        if (dist <= maxDist) {
          if (!closest || dist < closest.distance) {
            closest = {
              loc: candidate.label,
              category: idsFromTypes[typeId],
              distance: dist
            };
          }
        }
      }
    }

    if (closest) {
      finalRes.push(closest);
    }
  }

  finalRes.sort((a, b) => a.distance - b.distance);
  return finalRes;
}

/**
 * Calculate distance between two points using Haversine formula
 */
function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000; // Radius of the earth in m
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in m
  return d;
}

/**
 * Convert degrees to radians
 */
function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

/**
 * Get interesting location types (tourist attractions)
 */
function interestingLocationTypes() {
  const types: [number, string][] = [];
  for (const name in POI_TYPE) {
    if (name.startsWith("TOURIST")) {
      types.push([POI_TYPE[name] as any, "100"]);
    }
  }
  return types;
}

/**
 * Get interesting location areas (cities, towns, villages, hamlets)
 */
function interestingLocationAreas() {
  return [
    [POI_TYPE.POI_CITY, "3000"],
    [POI_TYPE.POI_HAMLET, "1000"],
    [POI_TYPE.POI_TOWN, "3000"],
    [POI_TYPE.POI_VILLAGE, "1000"],
  ] as [number, string][];
}


/**
 * Migration: Split exif_data, geo_poi_data, pictures from picisa_entries.db
 * into separate domain databases. Uses ATTACH for joins in main process.
 */
import { Database } from "bun:sqlite";
import debug from "debug";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { imagesRoot } from "../../../utils/constants";
import {
  EXIF_DB_PATH,
  GEO_DB_PATH,
  FACES_DB_PATH,
  SEARCH_DB_PATH,
} from "../../../utils/db-paths";
import {
  isRecoverableSqliteFilesystemError,
  removeOrphanSqliteSidecars,
  removeSqliteDatabaseArtifacts,
} from "../../../utils/sqlite-validate";

const debugLogger = debug("app:entries-db-split");
const OLD_EXIF_PATH = join(imagesRoot, "picisa_exif.db");
const OLD_GEO_PATH = join(imagesRoot, "picasa_geolocate.db");
const OLD_INDEX_PATH = join(imagesRoot, "picisa_index.db");

export function migrateToSplitDatabasesIfNeeded(mainDb: Database): boolean {
  const hasExif = mainDb.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='exif_data'"
  ).get();
  if (!hasExif) {
    return false;
  }

  if (existsSync(EXIF_DB_PATH)) {
    debugLogger("Split DBs already exist, skipping migration");
    return false;
  }

  debugLogger("Migrating to split databases...");

  createAndMigrateExifDb(mainDb);
  createAndMigrateGeoDb(mainDb);
  createAndMigrateSearchDb(mainDb);
  createFacesDb();

  dropChildTablesFromMain(mainDb);

  debugLogger("Split migration complete");
  return true;
}

/**
 * Create split DBs from old separate files (picisa_exif.db, picasa_geolocate.db, picisa_index.db).
 * Used when migrating from pre-unified layout.
 */
export function createSplitDbsFromOldFilesIfNeeded(mainDb: Database): void {
  if (existsSync(EXIF_DB_PATH)) {
    debugLogger("Split DBs already exist");
    return;
  }

  debugLogger("Creating split DBs from old files...");
  createAndMigrateExifDb(mainDb);
  createAndMigrateGeoDb(mainDb);
  createAndMigrateSearchDb(mainDb);
  createFacesDb();

  if (existsSync(OLD_EXIF_PATH)) {
    unlinkSync(OLD_EXIF_PATH);
    debugLogger("Removed old picisa_exif.db");
  }
  if (existsSync(OLD_GEO_PATH)) {
    unlinkSync(OLD_GEO_PATH);
    debugLogger("Removed old picasa_geolocate.db");
  }
  if (existsSync(OLD_INDEX_PATH)) {
    unlinkSync(OLD_INDEX_PATH);
    debugLogger("Removed old picisa_index.db");
  }
}

/**
 * Create empty split DBs for fresh install, or migrate from old files.
 */
export function ensureSplitDatabasesExist(mainDb: Database): void {
  if (existsSync(EXIF_DB_PATH)) {
    attachSplitDatabases(mainDb);
    return;
  }

  const hasExifInMain = mainDb.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='exif_data'"
  ).get();

  if (hasExifInMain) {
    migrateToSplitDatabasesIfNeeded(mainDb);
  } else {
    const hasOldExif = existsSync(OLD_EXIF_PATH);
    const hasOldGeo = existsSync(OLD_GEO_PATH);
    const hasOldIndex = existsSync(OLD_INDEX_PATH);
    if (hasOldExif || hasOldGeo || hasOldIndex) {
      createSplitDbsFromOldFiles(mainDb);
    } else {
      createEmptySplitDbs();
    }
  }
  attachSplitDatabases(mainDb);
}

function createSplitDbsFromOldFiles(mainDb: Database): void {
  createExifDbFromOldFile(mainDb);
  createGeoDbFromOldFile(mainDb);
  createSearchDbFromOldFile(mainDb);
  createFacesDb();
}

function createExifDbFromOldFile(mainDb: Database): void {
  const exifDb = new Database(EXIF_DB_PATH, { create: true });
  exifDb.run("PRAGMA journal_mode=WAL");
  exifDb.run(`
    CREATE TABLE exif_data (
      entry_id TEXT PRIMARY KEY,
      exif_data TEXT, has_exif INTEGER DEFAULT 0, processed_at TEXT,
      date_taken TEXT, make TEXT, model TEXT,
      image_width INTEGER, image_height INTEGER,
      latitude REAL, longitude REAL,
      iso INTEGER, exposure_time REAL, f_number REAL, focal_length REAL,
      person_in_image TEXT, acceleration_vector TEXT, photo_identifier TEXT,
      image_unique_id TEXT, lens_model TEXT, lens_info TEXT, focal_length_35mm INTEGER,
      gps_altitude REAL, gps_altitude_ref TEXT, gps_date_stamp TEXT,
      gps_img_direction REAL, gps_img_direction_ref TEXT, gps_timestamp TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  if (existsSync(OLD_EXIF_PATH)) {
    const oldDb = new Database(OLD_EXIF_PATH, { readonly: true });
    const rows = oldDb.prepare("SELECT album_key, entry_name, exif_data, has_exif, processed_at FROM exif_data").all() as any[];
    const insert = exifDb.prepare("INSERT INTO exif_data (entry_id, exif_data, has_exif, processed_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)");
    for (const r of rows) {
      const entry = mainDb.prepare("SELECT entry_id FROM album_entries WHERE album_key=? AND entry_name=?").get(r.album_key, r.entry_name) as { entry_id: string } | undefined;
      if (entry) insert.run(entry.entry_id, r.exif_data, r.has_exif ?? 0, r.processed_at);
    }
    oldDb.close();
    debugLogger(`Migrated ${rows.length} exif rows from old file`);
  }
  exifDb.close();
}

function createGeoDbFromOldFile(mainDb: Database): void {
  const geoDb = new Database(GEO_DB_PATH, { create: true });
  geoDb.run("PRAGMA journal_mode=WAL");
  geoDb.run(`
    CREATE TABLE geo_poi_data (
      entry_id TEXT PRIMARY KEY,
      album_key TEXT NOT NULL, entry_name TEXT NOT NULL,
      geo_poi TEXT, has_geo_poi INTEGER DEFAULT 0, processed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(album_key, entry_name)
    );
    CREATE INDEX idx_geo_album_key ON geo_poi_data(album_key);
    CREATE INDEX idx_geo_entry_name ON geo_poi_data(entry_name);
  `);
  if (existsSync(OLD_GEO_PATH)) {
    const oldDb = new Database(OLD_GEO_PATH, { readonly: true });
    const rows = oldDb.prepare("SELECT album_key, entry_name, geo_poi, has_geo_poi, processed_at FROM geo_poi_data").all() as any[];
    const insert = geoDb.prepare("INSERT INTO geo_poi_data (entry_id, album_key, entry_name, geo_poi, has_geo_poi, processed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)");
    for (const r of rows) {
      const entry = mainDb.prepare("SELECT entry_id FROM album_entries WHERE album_key=? AND entry_name=?").get(r.album_key, r.entry_name) as { entry_id: string } | undefined;
      if (entry) insert.run(entry.entry_id, r.album_key, r.entry_name, r.geo_poi, r.has_geo_poi ?? 0, r.processed_at);
    }
    oldDb.close();
    debugLogger(`Migrated ${rows.length} geo rows from old file`);
  }
  geoDb.close();
}

function createSearchDbFromOldFile(mainDb: Database): void {
  const searchDb = new Database(SEARCH_DB_PATH, { create: true });
  searchDb.run("PRAGMA journal_mode=WAL");
  searchDb.run(`
    CREATE TABLE pictures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id TEXT NOT NULL,
      album_key TEXT NOT NULL, album_name TEXT NOT NULL, entry_name TEXT NOT NULL,
      persons TEXT, star_count TEXT, geo_poi TEXT, photostar INTEGER,
      text_content TEXT, caption TEXT, entry_type TEXT, marked INTEGER DEFAULT 0,
      index_version INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(album_key, entry_name)
    );
    CREATE INDEX idx_pictures_album_key ON pictures(album_key);
    CREATE INDEX idx_pictures_entry_id ON pictures(entry_id);
    CREATE VIRTUAL TABLE pictures_fts USING fts5(
      album_name, entry_name, persons, text_content, caption,
      content='pictures', content_rowid='id'
    );
    CREATE TRIGGER pictures_fts_insert AFTER INSERT ON pictures BEGIN
      INSERT INTO pictures_fts(rowid, album_name, entry_name, persons, text_content, caption)
      VALUES (new.id, new.album_name, new.entry_name, new.persons, new.text_content, new.caption);
    END;
    CREATE TRIGGER pictures_fts_delete AFTER DELETE ON pictures BEGIN
      INSERT INTO pictures_fts(pictures_fts, rowid, album_name, entry_name, persons, text_content, caption)
      VALUES('delete', old.id, old.album_name, old.entry_name, old.persons, old.text_content, old.caption);
    END;
    CREATE TRIGGER pictures_fts_update AFTER UPDATE ON pictures BEGIN
      INSERT INTO pictures_fts(pictures_fts, rowid, album_name, entry_name, persons, text_content, caption)
      VALUES('delete', old.id, old.album_name, old.entry_name, old.persons, old.text_content, old.caption);
      INSERT INTO pictures_fts(rowid, album_name, entry_name, persons, text_content, caption)
      VALUES (new.id, new.album_name, new.entry_name, new.persons, new.text_content, new.caption);
    END;
  `);
  if (existsSync(OLD_INDEX_PATH)) {
    const oldDb = new Database(OLD_INDEX_PATH, { readonly: true });
    const rows = oldDb.prepare("SELECT album_key, album_name, entry_name, persons, star_count, geo_poi, photostar, text_content, caption, entry_type, marked FROM pictures").all() as any[];
    const insert = searchDb.prepare(`
      INSERT INTO pictures (entry_id, album_key, album_name, entry_name, persons, star_count, geo_poi, photostar, text_content, caption, entry_type, marked, index_version, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    for (const r of rows) {
      const entry = mainDb.prepare("SELECT entry_id FROM album_entries WHERE album_key=? AND entry_name=?").get(r.album_key, r.entry_name) as { entry_id: string } | undefined;
      if (entry) {
        const ae = mainDb.prepare("SELECT index_version FROM album_entries WHERE album_key=? AND entry_name=?").get(r.album_key, r.entry_name) as { index_version: number } | undefined;
        insert.run(entry.entry_id, r.album_key, r.album_name, r.entry_name, r.persons, r.star_count, r.geo_poi, r.photostar ?? 0, r.text_content, r.caption, r.entry_type ?? "unknown", r.marked ?? 0, ae?.index_version ?? 0);
      }
    }
    oldDb.close();
    debugLogger(`Migrated ${rows.length} picture rows from old file`);
  }
  searchDb.close();
}

function createEmptySplitDbsOnce(): void {
  const exifDb = new Database(EXIF_DB_PATH, { create: true });
  exifDb.run("PRAGMA journal_mode=WAL");
  exifDb.run(`
    CREATE TABLE exif_data (
      entry_id TEXT PRIMARY KEY,
      exif_data TEXT, has_exif INTEGER DEFAULT 0, processed_at TEXT,
      date_taken TEXT, make TEXT, model TEXT,
      image_width INTEGER, image_height INTEGER,
      latitude REAL, longitude REAL,
      iso INTEGER, exposure_time REAL, f_number REAL, focal_length REAL,
      person_in_image TEXT, acceleration_vector TEXT, photo_identifier TEXT,
      image_unique_id TEXT, lens_model TEXT, lens_info TEXT, focal_length_35mm INTEGER,
      gps_altitude REAL, gps_altitude_ref TEXT, gps_date_stamp TEXT,
      gps_img_direction REAL, gps_img_direction_ref TEXT, gps_timestamp TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  exifDb.close();

  const geoDb = new Database(GEO_DB_PATH, { create: true });
  geoDb.run("PRAGMA journal_mode=WAL");
  geoDb.run(`
    CREATE TABLE geo_poi_data (
      entry_id TEXT PRIMARY KEY,
      album_key TEXT NOT NULL, entry_name TEXT NOT NULL,
      geo_poi TEXT, has_geo_poi INTEGER DEFAULT 0, processed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(album_key, entry_name)
    );
    CREATE INDEX idx_geo_album_key ON geo_poi_data(album_key);
    CREATE INDEX idx_geo_entry_name ON geo_poi_data(entry_name);
  `);
  geoDb.close();

  createEmptySearchDb();
  createFacesDb();
  debugLogger("Created empty split DBs");
}

function createEmptySplitDbs(): void {
  const splitPaths = [EXIF_DB_PATH, GEO_DB_PATH, SEARCH_DB_PATH, FACES_DB_PATH];
  for (const p of splitPaths) removeOrphanSqliteSidecars(p);
  try {
    createEmptySplitDbsOnce();
  } catch (e) {
    if (!isRecoverableSqliteFilesystemError(e)) throw e;
    console.warn(
      "[picisa] Split DB create failed (I/O or corrupt file); clearing partial split DB files and retrying once.",
      e,
    );
    for (const p of splitPaths) removeSqliteDatabaseArtifacts(p);
    createEmptySplitDbsOnce();
  }
}

function createEmptySearchDb(): void {
  const searchDb = new Database(SEARCH_DB_PATH, { create: true });
  searchDb.run("PRAGMA journal_mode=WAL");
  searchDb.run(`
    CREATE TABLE pictures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id TEXT NOT NULL,
      album_key TEXT NOT NULL, album_name TEXT NOT NULL, entry_name TEXT NOT NULL,
      persons TEXT, star_count TEXT, geo_poi TEXT, photostar INTEGER,
      text_content TEXT, caption TEXT, entry_type TEXT, marked INTEGER DEFAULT 0,
      index_version INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(album_key, entry_name)
    );
    CREATE INDEX idx_pictures_album_key ON pictures(album_key);
    CREATE INDEX idx_pictures_entry_id ON pictures(entry_id);
    CREATE VIRTUAL TABLE pictures_fts USING fts5(
      album_name, entry_name, persons, text_content, caption,
      content='pictures', content_rowid='id'
    );
    CREATE TRIGGER pictures_fts_insert AFTER INSERT ON pictures BEGIN
      INSERT INTO pictures_fts(rowid, album_name, entry_name, persons, text_content, caption)
      VALUES (new.id, new.album_name, new.entry_name, new.persons, new.text_content, new.caption);
    END;
    CREATE TRIGGER pictures_fts_delete AFTER DELETE ON pictures BEGIN
      INSERT INTO pictures_fts(pictures_fts, rowid, album_name, entry_name, persons, text_content, caption)
      VALUES('delete', old.id, old.album_name, old.entry_name, old.persons, old.text_content, old.caption);
    END;
    CREATE TRIGGER pictures_fts_update AFTER UPDATE ON pictures BEGIN
      INSERT INTO pictures_fts(pictures_fts, rowid, album_name, entry_name, persons, text_content, caption)
      VALUES('delete', old.id, old.album_name, old.entry_name, old.persons, old.text_content, old.caption);
      INSERT INTO pictures_fts(rowid, album_name, entry_name, persons, text_content, caption)
      VALUES (new.id, new.album_name, new.entry_name, new.persons, new.text_content, new.caption);
    END;
  `);
  searchDb.close();
}

function createAndMigrateExifDb(mainDb: Database): void {
  const exifDb = new Database(EXIF_DB_PATH, { create: true });
  exifDb.run("PRAGMA journal_mode=WAL");

  exifDb.run(`
    CREATE TABLE exif_data (
      entry_id TEXT PRIMARY KEY,
      exif_data TEXT, has_exif INTEGER DEFAULT 0, processed_at TEXT,
      date_taken TEXT, make TEXT, model TEXT,
      image_width INTEGER, image_height INTEGER,
      latitude REAL, longitude REAL,
      iso INTEGER, exposure_time REAL, f_number REAL, focal_length REAL,
      person_in_image TEXT, acceleration_vector TEXT, photo_identifier TEXT,
      image_unique_id TEXT, lens_model TEXT, lens_info TEXT, focal_length_35mm INTEGER,
      gps_altitude REAL, gps_altitude_ref TEXT, gps_date_stamp TEXT,
      gps_img_direction REAL, gps_img_direction_ref TEXT, gps_timestamp TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const rows = mainDb.prepare("SELECT * FROM exif_data").all() as any[];
  const insert = exifDb.prepare(`
    INSERT INTO exif_data (entry_id, exif_data, has_exif, processed_at, updated_at,
      date_taken, make, model, image_width, image_height, latitude, longitude,
      iso, exposure_time, f_number, focal_length, person_in_image, acceleration_vector,
      photo_identifier, image_unique_id, lens_model, lens_info, focal_length_35mm,
      gps_altitude, gps_altitude_ref, gps_date_stamp, gps_img_direction,
      gps_img_direction_ref, gps_timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    insert.run(
      r.entry_id, r.exif_data, r.has_exif ?? 0, r.processed_at, r.updated_at,
      r.date_taken, r.make, r.model, r.image_width, r.image_height,
      r.latitude, r.longitude, r.iso, r.exposure_time, r.f_number, r.focal_length,
      r.person_in_image, r.acceleration_vector, r.photo_identifier, r.image_unique_id,
      r.lens_model, r.lens_info, r.focal_length_35mm,
      r.gps_altitude, r.gps_altitude_ref, r.gps_date_stamp, r.gps_img_direction,
      r.gps_img_direction_ref, r.gps_timestamp
    );
  }
  debugLogger(`Migrated ${rows.length} exif rows to picisa_exif.db`);
  exifDb.close();
}

function createAndMigrateGeoDb(mainDb: Database): void {
  const geoDb = new Database(GEO_DB_PATH, { create: true });
  geoDb.run("PRAGMA journal_mode=WAL");

  geoDb.run(`
    CREATE TABLE geo_poi_data (
      entry_id TEXT PRIMARY KEY,
      album_key TEXT NOT NULL, entry_name TEXT NOT NULL,
      geo_poi TEXT, has_geo_poi INTEGER DEFAULT 0, processed_at TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(album_key, entry_name)
    );
    CREATE INDEX idx_geo_album_key ON geo_poi_data(album_key);
    CREATE INDEX idx_geo_entry_name ON geo_poi_data(entry_name);
  `);

  const rows = mainDb.prepare("SELECT * FROM geo_poi_data").all() as any[];
  const insert = geoDb.prepare(`
    INSERT INTO geo_poi_data (entry_id, album_key, entry_name, geo_poi, has_geo_poi, processed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    insert.run(r.entry_id, r.album_key, r.entry_name, r.geo_poi, r.has_geo_poi ?? 0, r.processed_at, r.updated_at);
  }
  debugLogger(`Migrated ${rows.length} geo rows to picisa_geo.db`);
  geoDb.close();
}

function createAndMigrateSearchDb(mainDb: Database): void {
  const searchDb = new Database(SEARCH_DB_PATH, { create: true });
  searchDb.run("PRAGMA journal_mode=WAL");

  searchDb.run(`
    CREATE TABLE pictures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id TEXT NOT NULL,
      album_key TEXT NOT NULL, album_name TEXT NOT NULL, entry_name TEXT NOT NULL,
      persons TEXT, star_count TEXT, geo_poi TEXT, photostar INTEGER,
      text_content TEXT, caption TEXT, entry_type TEXT, marked INTEGER DEFAULT 0,
      index_version INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(album_key, entry_name)
    );
    CREATE INDEX idx_pictures_album_key ON pictures(album_key);
    CREATE INDEX idx_pictures_entry_id ON pictures(entry_id);

    CREATE VIRTUAL TABLE pictures_fts USING fts5(
      album_name, entry_name, persons, text_content, caption,
      content='pictures', content_rowid='id'
    );
    CREATE TRIGGER pictures_fts_insert AFTER INSERT ON pictures BEGIN
      INSERT INTO pictures_fts(rowid, album_name, entry_name, persons, text_content, caption)
      VALUES (new.id, new.album_name, new.entry_name, new.persons, new.text_content, new.caption);
    END;
    CREATE TRIGGER pictures_fts_delete AFTER DELETE ON pictures BEGIN
      INSERT INTO pictures_fts(pictures_fts, rowid, album_name, entry_name, persons, text_content, caption)
      VALUES('delete', old.id, old.album_name, old.entry_name, old.persons, old.text_content, old.caption);
    END;
    CREATE TRIGGER pictures_fts_update AFTER UPDATE ON pictures BEGIN
      INSERT INTO pictures_fts(pictures_fts, rowid, album_name, entry_name, persons, text_content, caption)
      VALUES('delete', old.id, old.album_name, old.entry_name, old.persons, old.text_content, old.caption);
      INSERT INTO pictures_fts(rowid, album_name, entry_name, persons, text_content, caption)
      VALUES (new.id, new.album_name, new.entry_name, new.persons, new.text_content, new.caption);
    END;
  `);

  const rows = mainDb.prepare("SELECT * FROM pictures").all() as any[];
  const insert = searchDb.prepare(`
    INSERT INTO pictures (entry_id, album_key, album_name, entry_name, persons, star_count, geo_poi, photostar, text_content, caption, entry_type, marked, index_version, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    insert.run(
      r.entry_id, r.album_key, r.album_name, r.entry_name,
      r.persons, r.star_count, r.geo_poi, r.photostar ?? 0,
      r.text_content, r.caption, r.entry_type ?? "unknown", r.marked ?? 0,
      r.index_version ?? 0, r.updated_at
    );
  }
  debugLogger(`Migrated ${rows.length} picture rows to picisa_search.db`);
  searchDb.close();
}

function createFacesDb(): void {
  const facesDb = new Database(FACES_DB_PATH, { create: true });
  facesDb.run("PRAGMA journal_mode=WAL");

  facesDb.run(`
    CREATE TABLE contacts (
      hash TEXT NOT NULL,
      album_key TEXT NOT NULL,
      id TEXT, name TEXT, email TEXT, something TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (hash, album_key)
    );
    CREATE INDEX idx_contacts_album ON contacts(album_key);

    CREATE TABLE face_rects (
      entry_id TEXT NOT NULL,
      hash TEXT NOT NULL,
      rect TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (entry_id, hash)
    );
    CREATE INDEX idx_face_rects_entry ON face_rects(entry_id);

    CREATE TABLE face_reference_scan (
      entry_id TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  debugLogger("Created picisa_faces.db with contacts, face_rects, face_reference_scan");
  facesDb.close();
}

function dropChildTablesFromMain(mainDb: Database): void {
  debugLogger("Dropping exif_data, geo_poi_data, pictures from main DB");
  mainDb.run("DROP TABLE IF EXISTS pictures_fts");
  mainDb.run("DROP TABLE IF EXISTS pictures");
  mainDb.run("DROP TABLE IF EXISTS geo_poi_data");
  mainDb.run("DROP TABLE IF EXISTS exif_data");
}

export function attachSplitDatabases(db: Database): void {
  if (!existsSync(EXIF_DB_PATH)) return;

  try {
    const escape = (p: string) => p.replace(/'/g, "''");
    db.run(`ATTACH DATABASE '${escape(EXIF_DB_PATH)}' AS exif`);
    db.run(`ATTACH DATABASE '${escape(GEO_DB_PATH)}' AS geo`);
    db.run(`ATTACH DATABASE '${escape(FACES_DB_PATH)}' AS faces`);
    db.run(`ATTACH DATABASE '${escape(SEARCH_DB_PATH)}' AS search`);
    debugLogger("Attached exif, geo, faces, search databases");
  } catch (e) {
    debugLogger("ATTACH failed (split DBs may not exist yet):", e);
  }
}

import * as Database from "better-sqlite3";
import debug from "debug";
import { join } from "path";
import { media } from "../../server/rpc/rpcFunctions/albumUtils";
import { getPicasaEntry } from "../../server/rpc/rpcFunctions/picasa-ini";
import { waitUntilIdle } from "../../server/utils/busy";
import { imagesRoot } from "../../server/utils/constants";
import { getFolderAlbums, waitUntilWalk } from "../../server/walker";
import { Queue } from "../../shared/lib/queue";
import { Album, AlbumEntry, AlbumKind } from "../../shared/types/types";

const debugLogger = debug("app:bg-indexing");

// Database version constant - increment this when schema changes
const DATABASE_VERSION = 1;

/**
 * Normalize text by removing diacritics and converting to lowercase
 */
function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD') // Decompose characters into base + combining characters
    .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
    .toLowerCase()
    .trim();
}

class PictureIndexingService {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || join(imagesRoot, "picisa_index.db");
    this.db = new Database(this.dbPath);
    this.checkAndMigrateDatabase();
  }

  /**
   * Check database version and migrate if necessary
   */
  private checkAndMigrateDatabase(): void {
    try {
      // Check if version table exists
      const versionTableExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='db_version'
      `).get();

      if (!versionTableExists) {
        // First time setup - create version table and initialize database
        debugLogger("First time database setup - creating version table");
        this.db.exec(`
          CREATE TABLE db_version (
            version INTEGER PRIMARY KEY,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `);
        this.db.exec(`INSERT INTO db_version (version) VALUES (${DATABASE_VERSION})`);
        this.initDatabase();
        debugLogger(`Database initialized with version ${DATABASE_VERSION}`);
      } else {
        // Check current version
        const currentVersion = this.db.prepare("SELECT version FROM db_version ORDER BY version DESC LIMIT 1").get() as { version: number } | undefined;
        
        if (!currentVersion || currentVersion.version < DATABASE_VERSION) {
          debugLogger(`Database version mismatch. Current: ${currentVersion?.version || 'unknown'}, Required: ${DATABASE_VERSION}`);
          this.migrateDatabase(currentVersion?.version || 0);
        } else if (currentVersion.version > DATABASE_VERSION) {
          debugLogger(`Database version ${currentVersion.version} is newer than expected ${DATABASE_VERSION}. This may cause compatibility issues.`);
        } else {
          debugLogger(`Database version ${DATABASE_VERSION} is up to date`);
        }
      }
    } catch (error) {
      debugLogger("Error checking database version:", error);
      throw error;
    }
  }

  /**
   * Migrate database to new version by dropping and recreating tables
   */
  private migrateDatabase(fromVersion: number): void {
    debugLogger(`Migrating database from version ${fromVersion} to ${DATABASE_VERSION}`);
    
    try {
      // Drop all existing tables
      this.db.exec(`
        DROP TABLE IF EXISTS pictures_fts;
        DROP TABLE IF EXISTS pictures;
        DROP INDEX IF EXISTS idx_album_key;
        DROP INDEX IF EXISTS idx_album_name;
        DROP INDEX IF EXISTS idx_entry_name;
        DROP INDEX IF EXISTS idx_persons;
      `);
      
      // Update version
      this.db.exec(`UPDATE db_version SET version = ${DATABASE_VERSION} WHERE version = ${fromVersion}`);
      
      // Recreate database schema
      this.initDatabase();
      
      debugLogger(`Database migration completed to version ${DATABASE_VERSION}`);
    } catch (error) {
      debugLogger("Error during database migration:", error);
      throw error;
    }
  }

  private initDatabase() {
    // Create pictures table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pictures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        album_key TEXT NOT NULL,
        album_name TEXT NOT NULL,
        entry_name TEXT NOT NULL,
        persons TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better query performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_album_key ON pictures(album_key);
      CREATE INDEX IF NOT EXISTS idx_album_name ON pictures(album_name);
      CREATE INDEX IF NOT EXISTS idx_entry_name ON pictures(entry_name);
      CREATE INDEX IF NOT EXISTS idx_persons ON pictures(persons);
    `);

    // Create full-text search index for metadata with normalized text
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS pictures_fts USING fts5(
        album_key,
        album_name,
        entry_name,
        persons,
        album_key_norm,
        album_name_norm,
        entry_name_norm,
        persons_norm,
        content='pictures',
        content_rowid='id'
      )
    `);

    debugLogger("Database initialized at:", this.dbPath);
  }

  /**
   * Index a single picture entry
   */
  async indexPicture(entry: AlbumEntry): Promise<void> {
    try {
      const picasaEntry = await getPicasaEntry(entry);

      // Extract persons from picasa metadata
      const persons = picasaEntry.persons || '';



      const insertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO pictures (
          album_key, album_name, entry_name,
          persons,
          updated_at
        ) VALUES (?, ?, ?, ?,  CURRENT_TIMESTAMP)
      `);

      insertStmt.run(
        entry.album.key,
        entry.album.name,
        entry.name,
        persons
      );

      // Update FTS index with normalized text
      const ftsStmt = this.db.prepare(`
        INSERT OR REPLACE INTO pictures_fts (
          rowid, album_key, album_name, entry_name, persons,
          album_key_norm, album_name_norm, entry_name_norm, persons_norm
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?,  ?)
      `);

      const lastId = this.db.prepare("SELECT last_insert_rowid() as id").get() as { id: number };
      ftsStmt.run(
        lastId.id,
        entry.album.key,
        entry.album.name,
        entry.name,
        persons,
        normalizeText(entry.album.key),
        normalizeText(entry.album.name),
        normalizeText(entry.name),
        normalizeText(persons)
      );

    } catch (error) {
      debugLogger(`Error indexing picture ${entry.name}:`, error);
      throw error;
    }
  }

  /**
   * Index all pictures in the system
   */
  async indexAllPictures(): Promise<void> {
    debugLogger("Starting full picture indexing...");

    const q = new Queue(3);
    await Promise.all([waitUntilWalk()]);
    const albums = await getFolderAlbums();

    let totalPictures = 0;
    let processedPictures = 0;


    // Index pictures in parallel with queue
    for (const album of albums) {
      let m: { entries: AlbumEntry[] };
      try {
        m = await media(album);
      } catch (e) {
        debugLogger(`Album ${album.name} is gone, skipping...`);
        continue;
      }

      for (const entry of m.entries) {
        q.add(async () => {
          await waitUntilIdle();
          try {
            await this.indexPicture(entry);
            processedPictures++;
            if (processedPictures % 100 === 0) {
              debugLogger(`Indexed ${processedPictures}/${totalPictures} pictures`);
            }
          } catch (error) {
            debugLogger(`Error indexing ${entry.name}:`, error);
          }
        });
      }
    }

    // Progress monitoring
    const progressInterval = setInterval(() => {
      if (q.total() > 0) {
        debugLogger(
          `Indexing progress: ${Math.floor((q.done() * 100) / q.total())}% (${q.done()} done)`
        );
      }
    }, 2000);

    await q.drain();
    clearInterval(progressInterval);

    debugLogger("Picture indexing completed");
  }

  /**
   * Query folders by matching strings
   */
  queryFoldersByStrings(matchingStrings: string[]): Album[] {
    if (matchingStrings.length === 0) {
      return [];
    }

    // Create search terms for FTS with normalized text
    const searchTerms = matchingStrings.map(term => `"${normalizeText(term)}"`).join(' OR ');

    const query = `
      SELECT 
        p.album_key,
        p.album_name,
        COUNT(*) as match_count
      FROM pictures p
      JOIN pictures_fts fts ON p.id = fts.rowid
      WHERE pictures_fts MATCH ?
      GROUP BY p.album_key, p.album_name
      ORDER BY match_count DESC, p.album_name ASC
    `;

    try {
      const stmt = this.db.prepare(query);
      const results = stmt.all(searchTerms) as Array<{
        album_key: string;
        album_name: string;
        match_count: number;
      }>;

      return results.map(row => ({
        key: row.album_key,
        name: row.album_name,
        kind: AlbumKind.FOLDER
      }));
    } catch (error) {
      debugLogger("Error querying folders:", error);
      return [];
    }
  }



  /**
   * Search pictures by text
   */
  searchPictures(searchTerm: string, limit?: number, albumId?: string): AlbumEntry[] {
    const query = `
      SELECT p.* FROM pictures p
      JOIN pictures_fts fts ON p.id = fts.rowid
      WHERE pictures_fts MATCH ?${albumId ? ' AND p.album_key = ?' : ''}
      ORDER BY p.date_taken DESC
      ${limit ? 'LIMIT ?' : ''}
    `;

    const stmt = this.db.prepare(query);
    const params = albumId
      ? [`"${normalizeText(searchTerm)}"`, albumId, ...(limit ? [limit] : [])]
      : [`"${normalizeText(searchTerm)}"`, ...(limit ? [limit] : [])];
    const results = stmt.all(...params) as Array<{
      entry_name: string;
      album_key: string;
      album_name: string;
    }>;

    return results.map(row => ({
      name: row.entry_name,
      album: {
        key: row.album_key,
        name: row.album_name,
        kind: AlbumKind.FOLDER,
        parent: null
      }
    }));
  }

  /**
   * Query AlbumEntry objects within a specific album by matching strings
   */
  queryAlbumEntries(albumId: string, matchingStrings: string[]): AlbumEntry[] {
    if (matchingStrings.length === 0) {
      return [];
    }

    // Create search terms for FTS with normalized text
    const searchTerms = matchingStrings.map(term => `"${normalizeText(term)}"`).join(' OR ');

    const query = `
      SELECT 
        p.entry_name,
        p.album_key,
        p.album_name
      FROM pictures p
      JOIN pictures_fts fts ON p.id = fts.rowid
      WHERE p.album_key = ? AND pictures_fts MATCH ?
      ORDER BY p.entry_name ASC
    `;

    try {
      const stmt = this.db.prepare(query);
      const results = stmt.all(albumId, searchTerms) as Array<{
        entry_name: string;
        album_key: string;
        album_name: string;
      }>;

      // Convert to AlbumEntry format
      return results.map(row => ({
        name: row.entry_name,
        album: {
          key: row.album_key,
          name: row.album_name,
          kind: AlbumKind.FOLDER,
          parent: null
        }
      }));
    } catch (error) {
      debugLogger("Error querying album entries:", error);
      return [];
    }
  }

  /**
   * Get current database version
   */
  getDatabaseVersion(): number {
    try {
      const version = this.db.prepare("SELECT version FROM db_version ORDER BY version DESC LIMIT 1").get() as { version: number } | undefined;
      return version?.version || 0;
    } catch (error) {
      debugLogger("Error getting database version:", error);
      return 0;
    }
  }

  /**
   * Get statistics about the index
   */
  getStats(): { totalPictures: number; totalFolders: number; lastUpdated: string } {
    const totalPictures = this.db.prepare("SELECT COUNT(*) as count FROM pictures").get() as { count: number };
    const totalFolders = this.db.prepare("SELECT COUNT(DISTINCT album_key) as count FROM pictures").get() as { count: number };
    const lastUpdated = this.db.prepare("SELECT MAX(updated_at) as last_updated FROM pictures").get() as { last_updated: string };

    return {
      totalPictures: totalPictures.count,
      totalFolders: totalFolders.count,
      lastUpdated: lastUpdated.last_updated || 'Never'
    };
  }

  /**
   * Clean up resources
   */
  close(): void {
    this.db.close();
  }
}

// Export singleton instance
let indexingService: PictureIndexingService | null = null;

export function getIndexingService(): PictureIndexingService {
  if (!indexingService) {
    indexingService = new PictureIndexingService();
  }
  return indexingService;
}

export async function startPictureIndexing(): Promise<void> {
  const service = getIndexingService();
  await service.indexAllPictures();
}

export async function indexPicture(entry: AlbumEntry): Promise<void> {
  const service = getIndexingService();
  await service.indexPicture(entry);
}

export function queryFoldersByStrings(matchingStrings: string[]): Album[] {
  const service = getIndexingService();
  return service.queryFoldersByStrings(matchingStrings);
}



export function searchPictures(searchTerm: string, limit?: number, albumId?: string): AlbumEntry[] {
  const service = getIndexingService();
  return service.searchPictures(searchTerm, limit, albumId);
}

export function getIndexingStats(): { totalPictures: number; totalFolders: number; lastUpdated: string } {
  const service = getIndexingService();
  return service.getStats();
}

export function queryAlbumEntries(albumId: string, matchingStrings: string[]): AlbumEntry[] {
  const service = getIndexingService();
  return service.queryAlbumEntries(albumId, matchingStrings);
}

export function getDatabaseVersion(): number {
  const service = getIndexingService();
  return service.getDatabaseVersion();
}

export function getRequiredDatabaseVersion(): number {
  return DATABASE_VERSION;
}

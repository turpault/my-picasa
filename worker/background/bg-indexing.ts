import * as Database from "better-sqlite3";
import debug from "debug";
import { join } from "path";
import { events } from "../../server/events/server-events";
import { media } from "../../server/rpc/rpcFunctions/albumUtils";
import { getPicasaEntry } from "../../server/rpc/rpcFunctions/picasa-ini";
import { waitUntilIdle } from "../../server/utils/busy";
import { imagesRoot } from "../../server/utils/constants";
import { getFolderAlbums, waitUntilWalk } from "../../server/walker";
import { Queue } from "../../shared/lib/queue";
import { Album, AlbumEntry, AlbumKind, AlbumWithData, Filters } from "../../shared/types/types";
import { isPicture, isVideo } from "../../shared/lib/utils";
import { lock } from "../../shared/lib/mutex";

const debugLogger = debug("app:bg-indexing");

// Database version constant - increment this when schema changes
const DATABASE_VERSION = 4;

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
   * Migrate database to new version
   */
  private migrateDatabase(fromVersion: number): void {
    debugLogger(`Migrating database from version ${fromVersion} to ${DATABASE_VERSION}`);

    try {
      if (fromVersion < 3) {
        // Add marked column for mark-and-sweep functionality
        debugLogger("Adding marked column for mark-and-sweep functionality");
        this.db.exec(`
          ALTER TABLE pictures ADD COLUMN marked BOOLEAN NOT NULL DEFAULT 0;
          CREATE INDEX IF NOT EXISTS idx_marked ON pictures(marked);
        `);
      }

      if (fromVersion < 4) {
        // Add additional fields for better video/photo support
        debugLogger("Adding additional fields for video/photo support");
        this.db.exec(`
          ALTER TABLE pictures ADD COLUMN file_extension TEXT;
          ALTER TABLE pictures ADD COLUMN mime_type TEXT;
          ALTER TABLE pictures ADD COLUMN file_size INTEGER;
          ALTER TABLE pictures ADD COLUMN width INTEGER;
          ALTER TABLE pictures ADD COLUMN height INTEGER;
          ALTER TABLE pictures ADD COLUMN duration REAL;
          CREATE INDEX IF NOT EXISTS idx_file_extension ON pictures(file_extension);
          CREATE INDEX IF NOT EXISTS idx_mime_type ON pictures(mime_type);
          CREATE INDEX IF NOT EXISTS idx_file_size ON pictures(file_size);
          CREATE INDEX IF NOT EXISTS idx_dimensions ON pictures(width, height);
        `);
      }

      // Update version
      this.db.exec(`UPDATE db_version SET version = ${DATABASE_VERSION} WHERE version = ${fromVersion}`);

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
        star_count TEXT,
        geo_poi TEXT,
        photostar BOOLEAN,
        text_content TEXT,
        caption TEXT,
        entry_type TEXT,
        file_extension TEXT,
        mime_type TEXT,
        file_size INTEGER,
        width INTEGER,
        height INTEGER,
        duration REAL,
        marked BOOLEAN NOT NULL DEFAULT 0,
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
      CREATE INDEX IF NOT EXISTS idx_star_count ON pictures(star_count);
      CREATE INDEX IF NOT EXISTS idx_photostar ON pictures(photostar);
      CREATE INDEX IF NOT EXISTS idx_entry_type ON pictures(entry_type);
      CREATE INDEX IF NOT EXISTS idx_file_extension ON pictures(file_extension);
      CREATE INDEX IF NOT EXISTS idx_mime_type ON pictures(mime_type);
      CREATE INDEX IF NOT EXISTS idx_file_size ON pictures(file_size);
      CREATE INDEX IF NOT EXISTS idx_dimensions ON pictures(width, height);
      CREATE INDEX IF NOT EXISTS idx_marked ON pictures(marked);
    `);

    // Create full-text search index for metadata with normalized text
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS pictures_fts USING fts5(
        album_key,
        album_name,
        entry_name,
        persons,
        text_content,
        caption,
        album_key_norm,
        album_name_norm,
        entry_name_norm,
        persons_norm,
        text_content_norm,
        caption_norm,
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

      // Extract metadata from picasa entry
      const persons = picasaEntry.persons || '';
      const starCount = picasaEntry.starCount || '';
      const geoPOI = picasaEntry.geoPOI || '';
      const photostar = picasaEntry.photostar || false;
      const textContent = picasaEntry.text || '';
      const caption = picasaEntry.caption || '';

      // Determine entry type
      let entryType = 'unknown';
      if (isPicture(entry)) {
        entryType = 'picture';
      } else if (isVideo(entry)) {
        entryType = 'video';
      }

      const insertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO pictures (
          album_key, album_name, entry_name,
          persons, star_count, geo_poi, photostar, text_content, caption, entry_type, marked,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
      `);

      insertStmt.run(
        entry.album.key,
        entry.album.name,
        entry.name,
        persons,
        starCount,
        geoPOI,
        photostar,
        textContent,
        caption,
        entryType
      );

      // Update FTS index with normalized text
      const ftsStmt = this.db.prepare(`
        INSERT OR REPLACE INTO pictures_fts (
          rowid, album_key, album_name, entry_name, persons, text_content, caption,
          album_key_norm, album_name_norm, entry_name_norm, persons_norm, text_content_norm, caption_norm
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const lastId = this.db.prepare("SELECT last_insert_rowid() as id").get() as { id: number };
      ftsStmt.run(
        lastId.id,
        entry.album.key,
        entry.album.name,
        entry.name,
        persons,
        textContent,
        caption,
        normalizeText(entry.album.key),
        normalizeText(entry.album.name),
        normalizeText(entry.name),
        normalizeText(persons),
        normalizeText(textContent),
        normalizeText(caption)
      );

    } catch (error) {
      debugLogger(`Error indexing picture ${entry.name}:`, error);
      throw error;
    }
  }

  /**
   * Clear all marks from the database (mark phase preparation)
   */
  private clearAllMarks(): void {
    debugLogger("Clearing all marks from database...");
    this.db.exec("UPDATE pictures SET marked = 0");
  }

  /**
   * Remove all unmarked records (sweep phase)
   */
  private sweepUnmarkedRecords(): number {
    debugLogger("Sweeping unmarked records...");

    // Count unmarked records before deletion
    const countStmt = this.db.prepare("SELECT COUNT(*) as count FROM pictures WHERE marked = 0");
    const count = countStmt.get() as { count: number };

    if (count.count > 0) {
      debugLogger(`Removing ${count.count} unmarked records...`);

      // Delete unmarked records
      const deleteStmt = this.db.prepare("DELETE FROM pictures WHERE marked = 0");
      deleteStmt.run();

      // Clean up FTS index (this will be handled automatically by SQLite)
      debugLogger(`Removed ${count.count} unmarked records`);
    } else {
      debugLogger("No unmarked records to remove");
    }

    return count.count;
  }

  /**
   * Index all pictures in the system with mark-and-sweep cleanup
   */
  async indexAllPictures(): Promise<void> {
    debugLogger("Starting full picture indexing with mark-and-sweep...");
    const l = await lock("indexAllPictures");

    // Phase 1: Clear all marks
    this.clearAllMarks();

    const q = new Queue(3);
    await Promise.all([waitUntilWalk()]);
    const albums = await getFolderAlbums();

    // Count total pictures first
    let totalPictures = 0;
    for (const album of albums) {
      try {
        const m = await media(album);
        totalPictures += m.entries.length;
      } catch (e) {
        debugLogger(`Album ${album.name} is gone, skipping...`);
        continue;
      }
    }

    let processedPictures = 0;
    debugLogger(`Total pictures to index: ${totalPictures}`);

    // Phase 2: Mark and index pictures in parallel with queue
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

    // Phase 3: Sweep unmarked records
    const removedCount = this.sweepUnmarkedRecords();

    debugLogger(`Picture indexing completed. Removed ${removedCount} orphaned records.`);
    l();
  }

  /**
   * Query folders by Filters object
   */
  queryFoldersByFilters(filters: Filters): AlbumWithData[] {
    // Build WHERE conditions based on filters
    const whereConditions: string[] = [];
    const params: any[] = [];

    // Text search filter
    if (filters.text && filters.text.trim().length > 0) {
      const searchTerms = filters.text.trim().split(/\s+/).filter(term => term.length > 0);
      if (searchTerms.length > 0) {
        const ftsSearchTerms = searchTerms.map(term => `"${normalizeText(term)}"`).join(' OR ');
        whereConditions.push('pictures_fts MATCH ?');
        params.push(ftsSearchTerms);
      }
    }

    // Star rating filter
    if (filters.star !== undefined && filters.star > 0) {
      whereConditions.push('p.star >= ?');
      params.push(filters.star);
    }

    // Video filter - only add condition if explicitly set to true
    if (filters.video === true) {
      whereConditions.push('p.name LIKE ?');
      params.push('%.mp4%');
    }

    // People filter (has faces) - only add condition if explicitly set to true
    if (filters.people === true) {
      whereConditions.push('p.faces IS NOT NULL AND p.faces != ?');
      params.push('');
    }

    // Specific persons filter
    if (filters.persons && filters.persons.length > 0) {
      const personConditions = filters.persons.map(() => 'p.persons LIKE ?');
      whereConditions.push(`(${personConditions.join(' OR ')})`);
      filters.persons.forEach(person => {
        params.push(`%${person}%`);
      });
    }

    // Location filter - only add condition if explicitly set to true
    if (filters.location === true) {
      whereConditions.push('(p.latitude IS NOT NULL AND p.longitude IS NOT NULL)');
    }

    // Favorite photo filter - only add condition if explicitly set to true
    if (filters.isFavoriteInIPhoto === true) {
      whereConditions.push('p.photostar = ?');
      params.push(true);
    }

    // Has faces filter - only add condition if explicitly set to true
    if (filters.hasFaces === true) {
      whereConditions.push('p.faces IS NOT NULL AND p.faces != ?');
      params.push('');
    }

    // Geo location filter - only add condition if explicitly set to true
    if (filters.hasGeoLocation === true) {
      whereConditions.push('(p.latitude IS NOT NULL AND p.longitude IS NOT NULL)');
    }

    // Star count range filters
    if (filters.minStarCount !== undefined) {
      whereConditions.push('p.star >= ?');
      params.push(filters.minStarCount);
    }

    // If no filters are applied, return all folders
    if (whereConditions.length === 0) {
      const query = `
        SELECT 
          p.album_key,
          p.album_name,
          COUNT(*) as match_count
        FROM pictures p
        GROUP BY p.album_key, p.album_name
        ORDER BY p.album_name ASC
      `;

      try {
        const stmt = this.db.prepare(query);
        const results = stmt.all() as Array<{
          album_key: string;
          album_name: string;
          match_count: number;
        }>;

        return results.map(row => ({
          key: row.album_key,
          name: row.album_name,
          kind: AlbumKind.FOLDER,
          count: row.match_count,
          shortcut: undefined
        }));
      } catch (error) {
        debugLogger("Error querying all folders:", error);
        return [];
      }
    }

    // Build the main query with filters
    let query = `
      SELECT 
        p.album_key,
        p.album_name,
        COUNT(*) as match_count
      FROM pictures p
    `;

    // Add FTS join only if text search is used
    if (filters.text && filters.text.trim().length > 0) {
      query += ` JOIN pictures_fts fts ON p.id = fts.rowid`;
    }

    query += `
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY p.album_key, p.album_name
      ORDER BY match_count DESC, p.album_name ASC
    `;

    try {
      const stmt = this.db.prepare(query);
      const results = stmt.all(...params) as Array<{
        album_key: string;
        album_name: string;
        match_count: number;
      }>;

      return results.map(row => ({
        key: row.album_key,
        name: row.album_name,
        kind: AlbumKind.FOLDER,
        count: row.match_count,
        shortcut: undefined
      }));
    } catch (error) {
      debugLogger("Error querying folders by filters:", error);
      return [];
    }
  }




  /**
   * Search pictures by Filters object
   */
  searchPicturesByFilters(filters: Filters, limit?: number, albumId?: string): AlbumEntry[] {
    // Build WHERE conditions based on filters
    const whereConditions: string[] = [];
    const params: any[] = [];

    // Add text search condition if provided
    if (filters.text && filters.text.trim().length > 0) {
      const searchTerms = filters.text.trim().split(/\s+/).filter(term => term.length > 0);
      if (searchTerms.length > 0) {
        const ftsSearchTerms = searchTerms.map(term => `"${normalizeText(term)}"`).join(' AND ');
        whereConditions.push('pictures_fts MATCH ?');
        params.push(ftsSearchTerms);
      }
    }

    // Add album filter if specified
    if (albumId) {
      whereConditions.push('p.album_key = ?');
      params.push(albumId);
    }

    // Add star count filter
    if (filters.star > 0) {
      whereConditions.push('CAST(p.star_count AS INTEGER) >= ?');
      params.push(filters.star);
    }

    // Add min/max star count filters
    if (filters.minStarCount !== undefined) {
      whereConditions.push('CAST(p.star_count AS INTEGER) >= ?');
      params.push(filters.minStarCount);
    }


    // Add video filter
    if (filters.video) {
      whereConditions.push('p.entry_type = ?');
      params.push('video');
    }

    // Add people filter
    if (filters.people) {
      whereConditions.push('p.persons IS NOT NULL AND p.persons != ""');
    }

    // Add specific persons filter
    if (filters.persons && filters.persons.length > 0) {
      const personConditions = filters.persons.map(() => 'p.persons LIKE ?');
      whereConditions.push(`(${personConditions.join(' OR ')})`);
      filters.persons.forEach(person => {
        params.push(`%${person}%`);
      });
    }

    // Add location filter
    if (filters.location) {
      whereConditions.push('p.geo_poi IS NOT NULL AND p.geo_poi != ""');
    }

    // Add favorite photo filter
    if (filters.isFavoriteInIPhoto) {
      whereConditions.push('p.photostar = ?');
      params.push(true);
    }

    // Add faces filter
    if (filters.hasFaces !== undefined) {
      // This would need to be implemented based on how faces are stored
      // For now, we'll skip this filter
    }

    // Add geo location filter
    if (filters.hasGeoLocation !== undefined) {
      if (filters.hasGeoLocation) {
        whereConditions.push('p.geo_poi IS NOT NULL AND p.geo_poi != ""');
      } else {
        whereConditions.push('(p.geo_poi IS NULL OR p.geo_poi = "")');
      }
    }

    // If no conditions, return empty array
    if (whereConditions.length === 0) {
      return [];
    }

    const query = `
      SELECT p.* FROM pictures p
      ${filters.text && filters.text.trim().length > 0 ? 'JOIN pictures_fts fts ON p.id = fts.rowid' : ''}
      WHERE ${whereConditions.join(' AND ')}
      ORDER BY p.entry_name ASC
      ${limit ? 'LIMIT ?' : ''}
    `;

    if (limit) {
      params.push(limit);
    }

    try {
      const stmt = this.db.prepare(query);
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
    } catch (error) {
      debugLogger("Error searching pictures by filters:", error);
      return [];
    }
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
   * Get all folders in the index
   */
  getAllFolders(): AlbumWithData[] {
    const query = `
      SELECT 
        p.album_key,
        p.album_name,
        COUNT(*) as match_count
      FROM pictures p
      GROUP BY p.album_key, p.album_name
      ORDER BY p.album_name ASC
    `;

    try {
      const stmt = this.db.prepare(query);
      const results = stmt.all() as Array<{
        album_key: string;
        album_name: string;
        match_count: number;
      }>;

      return results.map(row => ({
        key: row.album_key,
        name: row.album_name,
        kind: AlbumKind.FOLDER,
        count: row.match_count,
        shortcut: undefined
      }));
    } catch (error) {
      debugLogger("Error getting all folders:", error);
      return [];
    }
  }

  /**
   * Update a single entry's metadata in the database
   */
  async updateEntry(entry: AlbumEntry, metadata: any): Promise<void> {
    try {
      // Extract metadata from picasa entry
      const persons = metadata.persons || '';
      const starCount = metadata.starCount || '';
      const geoPOI = metadata.geoPOI || '';
      const photostar = metadata.photostar || false;
      const textContent = metadata.text || '';
      const caption = metadata.caption || '';

      // Determine entry type
      let entryType = 'unknown';
      if (isPicture(entry)) {
        entryType = 'picture';
      } else if (isVideo(entry)) {
        entryType = 'video';
      }

      const updateStmt = this.db.prepare(`
        UPDATE pictures SET
          persons = ?, star_count = ?, geo_poi = ?, photostar = ?, 
          text_content = ?, caption = ?, entry_type = ?, marked = 1, updated_at = CURRENT_TIMESTAMP
        WHERE album_key = ? AND entry_name = ?
      `);

      const result = updateStmt.run(
        persons, starCount, geoPOI, photostar, textContent, caption, entryType,
        entry.album.key, entry.name
      );

      if (result.changes > 0) {
        // Update FTS index
        const ftsUpdateStmt = this.db.prepare(`
          UPDATE pictures_fts SET
            persons = ?, text_content = ?, caption = ?,
            persons_norm = ?, text_content_norm = ?, caption_norm = ?
          WHERE rowid = (
            SELECT id FROM pictures WHERE album_key = ? AND entry_name = ?
          )
        `);

        ftsUpdateStmt.run(
          persons, textContent, caption,
          normalizeText(persons), normalizeText(textContent), normalizeText(caption),
          entry.album.key, entry.name
        );

        debugLogger(`Updated entry ${entry.name} in database`);
      } else {
        debugLogger(`Entry ${entry.name} not found in database, skipping update`);
      }
    } catch (error) {
      debugLogger(`Error updating entry ${entry.name}:`, error);
      throw error;
    }
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

  // Set up event listener for picasa entry updates
  setupPicasaEntryUpdateListener(service);
}

export async function indexPicture(entry: AlbumEntry): Promise<void> {
  const service = getIndexingService();
  await service.indexPicture(entry);
}

/**
 * Set up event listener for picasa entry updates
 */
function setupPicasaEntryUpdateListener(service: PictureIndexingService): void {
  debugLogger("Setting up picasa entry update listener");

  events.on("picasaEntryUpdated", async (event) => {
    try {
      const { entry, field, value } = event;

      // Only update if the field is one we care about
      const relevantFields = ['starCount', 'geoPOI', 'photostar', 'text', 'caption', 'persons'];
      if (relevantFields.includes(field)) {
        debugLogger(`Updating database for entry ${entry.name}, field: ${field}`);
        await service.updateEntry(entry, entry.metadata);
      }
    } catch (error) {
      debugLogger("Error handling picasa entry update event:", error);
    }
  });

  debugLogger("Picasa entry update listener set up successfully");
}


export function queryFoldersByFilters(filters: Filters): AlbumWithData[] {
  const service = getIndexingService();
  return service.queryFoldersByFilters(filters);
}




export function searchPicturesByFilters(filters: Filters, limit?: number, albumId?: string): AlbumEntry[] {
  const service = getIndexingService();
  return service.searchPicturesByFilters(filters, limit, albumId);
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

export function getAllFolders(): AlbumWithData[] {
  const service = getIndexingService();
  return service.getAllFolders();
}

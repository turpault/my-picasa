import Database from "better-sqlite3";
import { join } from "path";
import { AlbumEntry, AlbumKind, keyFromID, idFromKey } from "../../shared/types/types";
import { media } from "../../server/rpc/rpcFunctions/albumUtils";
import { exifData } from "../../server/rpc/rpcFunctions/exif";
import { getFolderAlbums, waitUntilWalk } from "../../server/walker";
import { Queue } from "../../shared/lib/queue";
import { waitUntilIdle } from "../../server/utils/busy";
import debug from "debug";
import { getPicasaEntry } from "../../server/rpc/rpcFunctions/picasa-ini";
import { imagesRoot } from "../../server/utils/constants";

const debugLogger = debug("app:bg-indexing");

/**
 * Generate a unique album entry ID from album key and file name
 */
function generateAlbumEntryId(albumKey: string, fileName: string): string {
  return `${albumKey}»${fileName}`;
}

/**
 * Parse album entry ID to get album key and file name
 */
function parseAlbumEntryId(albumEntryId: string): { albumKey: string; fileName: string } {
  const lastSepIndex = albumEntryId.lastIndexOf('»');
  if (lastSepIndex === -1) {
    throw new Error(`Invalid album entry ID format: ${albumEntryId}`);
  }
  return {
    albumKey: albumEntryId.substring(0, lastSepIndex),
    fileName: albumEntryId.substring(lastSepIndex + 1)
  };
}

export interface PictureIndex {
  id: number;
  album_key: string;
  album_entry_id: string;
  album_name: string;
  file_name: string;
  date_taken?: string;
  latitude?: number;
  longitude?: number;
  persons?: string;
  exif_data?: string;
  file_size?: number;
  width?: number;
  height?: number;
  created_at: string;
  updated_at: string;
}

export interface AlbumQuery {
  album_key: string;
  album_name: string;
  match_count: number;
}

export interface AlbumEntryQuery {
  album_entry_id: string;
  album_key: string;
  album_name: string;
  file_name: string;
  match_count: number;
}

class PictureIndexingService {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || join(imagesRoot, "picisa_index.db");
    this.db = new Database(this.dbPath);
    this.initDatabase();
  }

  private initDatabase() {
    // Create pictures table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pictures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_path TEXT NOT NULL,
        folder_name TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL UNIQUE,
        date_taken TEXT,
        latitude REAL,
        longitude REAL,
        persons TEXT,
        exif_data TEXT,
        file_size INTEGER,
        width INTEGER,
        height INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better query performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_folder_path ON pictures(folder_path);
      CREATE INDEX IF NOT EXISTS idx_folder_name ON pictures(folder_name);
      CREATE INDEX IF NOT EXISTS idx_file_name ON pictures(file_name);
      CREATE INDEX IF NOT EXISTS idx_date_taken ON pictures(date_taken);
      CREATE INDEX IF NOT EXISTS idx_persons ON pictures(persons);
      CREATE INDEX IF NOT EXISTS idx_file_path ON pictures(file_path);
    `);

    // Create full-text search index for metadata
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS pictures_fts USING fts5(
        folder_path,
        folder_name,
        file_name,
        persons,
        exif_data,
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
      const exif = await exifData(entry, true); // Include stats

      const filePath = `${entry.album.key}/${entry.name}`;

      // Extract persons from picasa metadata
      const persons = picasaEntry.persons || '';

      // Extract date taken
      const dateTaken = picasaEntry.dateTaken || exif.CreateDate || exif.DateTimeOriginal;

      // Extract GPS coordinates
      const latitude = picasaEntry.latitude || exif.latitude;
      const longitude = picasaEntry.longitude || exif.longitude;

      // Extract dimensions
      const width = exif.imageWidth || exif.ExifImageWidth;
      const height = exif.imageHeight || exif.ExifImageHeight;

      // Extract file size
      const fileSize = exif.size;

      const insertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO pictures (
          folder_path, folder_name, file_name, file_path,
          date_taken, latitude, longitude, persons, exif_data,
          file_size, width, height, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      insertStmt.run(
        entry.album.key,
        entry.album.name,
        entry.name,
        filePath,
        dateTaken,
        latitude,
        longitude,
        persons,
        JSON.stringify(exif),
        fileSize,
        width,
        height
      );

      // Update FTS index
      const ftsStmt = this.db.prepare(`
        INSERT OR REPLACE INTO pictures_fts (
          rowid, folder_path, folder_name, file_name, persons, exif_data
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      const lastId = this.db.prepare("SELECT last_insert_rowid() as id").get() as { id: number };
      ftsStmt.run(
        lastId.id,
        entry.album.key,
        entry.album.name,
        entry.name,
        persons,
        JSON.stringify(exif)
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

    // Count total pictures first
    for (const album of albums) {
      try {
        const m = await media(album);
        totalPictures += m.entries.length;
      } catch (e) {
        debugLogger(`Album ${album.name} is gone, skipping...`);
      }
    }

    debugLogger(`Found ${totalPictures} pictures to index`);

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
      await waitUntilIdle();
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
  queryFoldersByStrings(matchingStrings: string[]): AlbumQuery[] {
    if (matchingStrings.length === 0) {
      return [];
    }

    // Create search terms for FTS
    const searchTerms = matchingStrings.map(term => `"${term}"`).join(' OR ');

    const query = `
      SELECT 
        p.folder_path,
        p.folder_name,
        COUNT(*) as match_count
      FROM pictures p
      JOIN pictures_fts fts ON p.id = fts.rowid
      WHERE pictures_fts MATCH ?
      GROUP BY p.folder_path, p.folder_name
      ORDER BY match_count DESC, p.folder_name ASC
    `;

    try {
      const stmt = this.db.prepare(query);
      const results = stmt.all(searchTerms) as Array<{
        folder_path: string;
        folder_name: string;
        match_count: number;
      }>;

      return results.map(row => ({
        folder_path: row.folder_path,
        folder_name: row.folder_name,
        match_count: row.match_count
      }));
    } catch (error) {
      debugLogger("Error querying folders:", error);
      return [];
    }
  }



  /**
   * Search pictures by text
   */
  searchPictures(searchTerm: string, limit: number = 100): PictureIndex[] {
    const query = `
      SELECT p.* FROM pictures p
      JOIN pictures_fts fts ON p.id = fts.rowid
      WHERE pictures_fts MATCH ?
      ORDER BY p.date_taken DESC
      LIMIT ?
    `;

    const stmt = this.db.prepare(query);
    return stmt.all(`"${searchTerm}"`, limit) as PictureIndex[];
  }

  /**
   * Query AlbumEntry objects within a specific album by matching strings
   */
  queryAlbumEntries(albumId: string, matchingStrings: string[]): AlbumEntry[] {
    if (matchingStrings.length === 0) {
      return [];
    }

    // Create search terms for FTS
    const searchTerms = matchingStrings.map(term => `"${term}"`).join(' OR ');

    const query = `
      SELECT 
        p.file_name,
        p.folder_path,
        p.folder_name
      FROM pictures p
      JOIN pictures_fts fts ON p.id = fts.rowid
      WHERE p.folder_path = ? AND pictures_fts MATCH ?
      ORDER BY p.file_name ASC
    `;

    try {
      const stmt = this.db.prepare(query);
      const results = stmt.all(albumId, searchTerms) as Array<{
        file_name: string;
        folder_path: string;
        folder_name: string;
      }>;

      // Convert to AlbumEntry format
      return results.map(row => ({
        name: row.file_name,
        album: {
          key: row.folder_path,
          name: row.folder_name,
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
   * Get statistics about the index
   */
  getStats(): { totalPictures: number; totalFolders: number; lastUpdated: string } {
    const totalPictures = this.db.prepare("SELECT COUNT(*) as count FROM pictures").get() as { count: number };
    const totalFolders = this.db.prepare("SELECT COUNT(DISTINCT folder_path) as count FROM pictures").get() as { count: number };
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

export function queryFoldersByStrings(matchingStrings: string[]): AlbumQuery[] {
  const service = getIndexingService();
  return service.queryFoldersByStrings(matchingStrings);
}



export function searchPictures(searchTerm: string, limit?: number): PictureIndex[] {
  const service = getIndexingService();
  return service.searchPictures(searchTerm, limit);
}

export function getIndexingStats(): { totalPictures: number; totalFolders: number; lastUpdated: string } {
  const service = getIndexingService();
  return service.getStats();
}

export function queryAlbumEntries(albumId: string, matchingStrings: string[]): AlbumEntry[] {
  const service = getIndexingService();
  return service.queryAlbumEntries(albumId, matchingStrings);
}

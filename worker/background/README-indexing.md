# Picture Indexing Service

The Picture Indexing Service provides fast search and querying capabilities for your photo library using SQLite. It indexes pictures with their metadata, folder information, and enables efficient text-based searches.

## Features

- **Full-Text Search**: Search across folder names, file names, persons, and EXIF data
- **Folder Querying**: Find folders by matching strings with relevance scoring
- **Metadata Storage**: Stores EXIF data, GPS coordinates, persons, dates, and file information
- **Performance**: Uses SQLite with optimized indexes and FTS (Full-Text Search)
- **Background Indexing**: Automatically indexes pictures during application startup

## Database Schema

The service creates a SQLite database with the following structure:

### `pictures` Table
- `id`: Primary key
- `folder_path`: Path to the folder containing the picture
- `folder_name`: Name of the folder
- `file_name`: Name of the picture file
- `file_path`: Full path to the picture (unique)
- `date_taken`: Date when the picture was taken (ISO format)
- `latitude`: GPS latitude coordinate
- `longitude`: GPS longitude coordinate
- `persons`: Comma-separated list of persons in the picture
- `exif_data`: JSON string containing EXIF metadata
- `file_size`: File size in bytes
- `width`: Image width in pixels
- `height`: Image height in pixels
- `created_at`: When the record was created
- `updated_at`: When the record was last updated

### `pictures_fts` Table
Virtual table for full-text search across folder names, file names, persons, and EXIF data.

## API Functions

### Core Functions

#### `queryFoldersByStrings(matchingStrings: string[]): FolderQuery[]`
Returns folders that match the given search strings, ordered by relevance.

```typescript
const results = queryFoldersByStrings(["2023", "vacation"]);
// Returns folders containing both "2023" and "vacation"
```

#### `getAllFolders(): FolderQuery[]`
Returns all folders in the index with picture counts.

#### `getPicturesInFolder(folderPath: string): PictureIndex[]`
Returns all pictures in a specific folder.

#### `searchPictures(searchTerm: string, limit?: number): PictureIndex[]`
Searches pictures by text content with optional result limit.

#### `getIndexingStats(): { totalPictures: number; totalFolders: number; lastUpdated: string }`
Returns statistics about the current index.

### Background Functions

#### `startPictureIndexing(): Promise<void>`
Initiates full indexing of all pictures in the system. This is called automatically during application startup.

#### `indexPicture(entry: AlbumEntry): Promise<void>`
Indexes a single picture entry.

## RPC Endpoints

The following RPC endpoints are available to the client:

- `queryFolders(matchingStrings: string[])` - Query folders by search strings
- `getAllIndexedFolders()` - Get all folders in the index
- `getFolderPictures(folderPath: string)` - Get pictures in a folder
- `searchIndexedPictures(searchTerm: string, limit?: number)` - Search pictures
- `getIndexingStatistics()` - Get index statistics
- `indexPictureEntry(entry: AlbumEntry)` - Index a single picture

## Usage Examples

### Querying Folders

```typescript
// Find folders containing "2023" and "vacation"
const folders = await queryFolders(["2023", "vacation"]);

// Get all folders
const allFolders = await getAllIndexedFolders();

// Search for specific folders
const birthdayFolders = await queryFolders(["birthday", "party"]);
```

### Searching Pictures

```typescript
// Search pictures by text
const results = await searchIndexedPictures("sunset", 50);

// Get pictures in a specific folder
const folderPictures = await getFolderPictures("/path/to/folder");
```

### Getting Statistics

```typescript
const stats = await getIndexingStatistics();
console.log(`Indexed ${stats.totalPictures} pictures in ${stats.totalFolders} folders`);
```

## Performance Considerations

- **Indexing**: Initial indexing runs in the background with a queue of 3 concurrent operations
- **Queries**: Full-text search is optimized with SQLite FTS5
- **Database**: SQLite database is stored at `picisa_index.db` in the application directory
- **Updates**: Index is automatically updated when new pictures are added

## File Locations

- **Service Implementation**: `worker/background/bg-indexing.ts`
- **RPC Functions**: `server/rpc/rpcFunctions/indexing.ts`
- **Database**: `picisa_index.db` (created automatically)
- **Test Script**: `testing_scripts/test-indexing.ts`

## Integration

The indexing service is automatically integrated into the background services and runs during application startup. It processes all albums and pictures, extracting metadata and building the search index.

The service integrates with:
- EXIF data extraction (`bg-exif.ts`)
- Folder walking (`walker.ts`)
- Picasa metadata (`picasa-ini.ts`)
- Background task queue system

## Testing

Run the test script to verify the indexing service:

```bash
ts-node testing_scripts/test-indexing.ts
```

This will show current statistics, demonstrate folder querying, and test search functionality.

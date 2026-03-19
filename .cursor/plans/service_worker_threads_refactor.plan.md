---
name: Service Worker Threads Refactor
overview: Move faces, geolocate, favorite-exporter, and FTS into separate worker threads with configurable periodic runs, conditional startup, per-worker stats, and split databases using ATTACH for join support.
todos: []
isProject: false
---

# Service Worker Threads and CPU Reduction Plan

## Current Architecture Summary

- **All services run in the main thread**: walker, extraction (EXIF + GEO + INDEX), thumbgen, faces, favorite-exporter
- **Single database** `picisa_entries.db`: albums, album_entries, exif_data, geo_poi_data, pictures, pictures_fts
- **Global job queue** (SQLite-backed) runs EXIF, thumbnails, faces, etc. with concurrency 3
- **Stats**: Main process memory, CPU load, extraction queue; no per-service metrics

---

## Database Split (ATTACH DATABASE)

**Approach**: Split by domain into separate `.db` files. The main process uses `ATTACH DATABASE` to join them; joins use `entry_id` and `album_id` as foreign keys.

### Database Files


| File                | Domain      | Tables                 | Writer           |
| ------------------- | ----------- | ---------------------- | ---------------- |
| `picisa_entries.db` | Core        | albums, album_entries  | Walker           |
| `picisa_exif.db`    | EXIF        | exif_data              | Extraction       |
| `picisa_geo.db`     | Geolocation | geo_poi_data           | Geolocate worker |
| `picisa_faces.db`   | Faces       | contacts, face_rects   | Faces worker     |
| `picisa_search.db`  | Search/FTS  | pictures, pictures_fts | FTS worker       |


### Schema (join keys)

- **albums**: `album_id` (UUID), `key` (path)
- **album_entries**: `entry_id` (UUID), `album_id`, `album_key`, `entry_name`
- **exif_data**: `entry_id` (FK)
- **geo_poi_data**: `entry_id`, `album_key`, `entry_name` (for lookup)
- **contacts**, **face_rects**: `entry_id`, contact hash, face rectangles
- **pictures**: `entry_id`, `album_key`, `album_name`, `entry_name`

### Main Process: ATTACH and Joins

```sql
-- On startup, main process opens primary DB and attaches others
ATTACH DATABASE 'picisa_exif.db' AS exif;
ATTACH DATABASE 'picisa_geo.db' AS geo;
ATTACH DATABASE 'picisa_faces.db' AS faces;
ATTACH DATABASE 'picisa_search.db' AS search;

-- Example: join across DBs for search with geo
SELECT p.*, g.geo_poi
FROM main.album_entries ae
JOIN search.pictures p ON p.entry_id = ae.entry_id
LEFT JOIN geo.geo_poi_data g ON g.entry_id = ae.entry_id
WHERE ae.album_key = ?;
```

### Connection Model

- **Main process**: Opens `picisa_entries.db` as primary; attaches exif, geo, faces, search. All reads use `main.`, `exif.`, `geo.`, `faces.`, `search.` prefixes.
- **Workers**: Each worker opens only its own DB file (read-write):
  - Faces worker: `picisa_faces.db` only
  - Geolocate worker: `picisa_geo.db` only
  - FTS worker: `picisa_search.db` only
  - Extraction (main): writes to `picisa_exif.db` (attach or separate connection)
- **Queries needing joins**: Run in main process (which has all DBs attached). Workers do not need joins; they only read `entry_id` from main (via IPC or shared query) and write to their domain table.

### Migration Path

1. Create new schema in separate files: `picisa_exif.db`, `picisa_geo.db`, `picisa_faces.db`, `picisa_search.db`
2. Migrate data from `picisa_entries.db` into new files (one-time migration)
3. Remove exif_data, geo_poi_data, pictures, pictures_fts, and faces-related data from `picisa_entries.db`
4. Update `getEntriesDatabase()` etc. to use ATTACH
5. Update each service's database module to open the correct file

### Implementation Notes

- **Bun/Node SQLite**: `Database` constructor opens one file. Use `db.run("ATTACH DATABASE 'path' AS alias")` on the primary connection.
- **FTS triggers**: FTS in `picisa_search.db` must reference `pictures` in same DB; triggers stay in search DB.
- **Workers**: Each worker gets its own `Database` instance for its file only. No ATTACH in workers.

---

## 1. Worker Thread Isolation

Move each service into a **Node.js Worker thread**:


| Service           | Entry Point                                   | Domain Writes                 |
| ----------------- | --------------------------------------------- | ----------------------------- |
| faces             | `server/services/faces/worker.ts`             | `picisa_faces.db`             |
| geolocate         | `server/services/geolocate/worker.ts` (new)   | `picisa_geo.db`               |
| favorite-exporter | `server/services/favorite-exporter/worker.ts` | Filesystem (favorites folder) |
| fts               | `server/services/search/worker.ts` (new)      | `picisa_search.db`            |


**Pattern**: Reuse the existing worker pattern from icloud-export and faces: `workerData.serviceName`, `parentPort.postMessage` for IPC.

**Spawn from** [server/worker-manager.ts](server/worker-manager.ts): `new Worker(path, { workerData: { serviceName } })`.

**Sequential execution**: Main thread orchestrates: start faces worker → wait for ready → run → wait for done → start geolocate → …

---

## 2. Configurable Schedule (Static Config File)

Create `server/config/background-services.json`:

```json
{
  "faces": { "intervalMinutes": 1440, "enabled": true },
  "geolocate": { "intervalMinutes": 60, "enabled": true },
  "favoriteExporter": { "intervalMinutes": 30, "enabled": true },
  "fts": { "intervalMinutes": 120, "enabled": true }
}
```

- **Startup run**: Each service runs once after walker is ready (if needed).
- **Periodic run**: `setInterval` in main thread triggers next run at configured interval.

---

## 3. Conditional Startup (No New Images Since Last Run)

**Mechanism**: Persist `last_background_run_at` when all background services complete. On startup, run a lightweight check before starting workers.

**Implementation**:

1. Store `last_background_run_at` in `server/config/background-services.json` or `.picisa.last_run` under `imagesRoot`.
2. After walker completes: compare `max(album_entries.updated_at)` or `max(album.lastModified)` vs. `last_background_run_at`.
3. If no album/entry changed since last run → **skip** starting faces, geolocate, favorite-exporter, fts.
4. Cold start: if `last_background_run_at` missing, always run all services.
5. Update timestamp when the last of the four services finishes.

---

## 4. Per-Worker Memory and CPU Stats

**Reporting**: Each worker sends stats to main via `parentPort.postMessage({ type: "stats", data: { ... } })` at a configurable interval (e.g. every 5 seconds while running).

**Payload**: `{ memoryMB, cpuPercent, maxMemoryMB, avgCpuPercent }`

**Main thread**: Aggregates into `workerStats: Record<serviceName, WorkerStats>` and exposes via `/stats`.

**Stats view**: Add "Workers" tab with live memory, max memory, avg CPU, max CPU per service.

---

## 5. Database Writes and Synchronization

**Per-domain writes**:

- **faces**: Writes `picisa_faces.db` (contacts, face_rects; joins by entry_id).
- **geolocate**: Writes `picisa_geo.db` (geo_poi_data).
- **favorite-exporter**: Writes to filesystem only.
- **fts**: Writes `picisa_search.db` (pictures, pictures_fts).

With split DBs, each worker has **exclusive write access** to its own file. No cross-DB write coordination needed. Workers open their DB directly in their thread.

**Main process**: Reads from all DBs via ATTACH. Writes to `picisa_entries.db` (walker) and `picisa_exif.db` (extraction). No db-queue needed for worker DBs.

---

## 6. Extraction Worker Changes

**Refactor**:

- **Extraction** (stays in main): EXIF only. Writes to `picisa_exif.db`.
- **Geolocate worker**: Implements `processUnprocessedGeo` + `processGeoPOI`. Reads exif from main (or via IPC) / entries for entry_id; writes `picisa_geo.db`.
- **FTS worker**: Implements `processEntriesNeedingReindex` + `indexAllPictures`. Reads album_entries from main (ATTACH); writes `picisa_search.db`.

**Data flow**: EXIF extraction populates `picisa_exif.db`. Geolocate worker polls unprocessed entries (exif exists, geo missing), processes, writes `picisa_geo.db`. FTS worker polls entries needing reindex, writes `picisa_search.db`.

---

## 7. Implementation Order

1. **Database split**: Create `picisa_exif.db`, `picisa_geo.db`, `picisa_faces.db`, `picisa_search.db` schemas; migrate data; add ATTACH to main process; update getEntriesDatabase etc.
2. **Config**: Add `server/config/background-services.json` and loader.
3. **Change detection**: Implement `hasImageChangesSinceLastRun()` and `updateLastRunTimestamp()`.
4. **Geolocate worker**: Create worker; open `picisa_geo.db`; implement processUnprocessedGeo.
5. **FTS worker**: Create worker; open `picisa_search.db`; implement indexing.
6. **Faces worker**: Adapt for orchestrated runs, stats reporting; write to `picisa_faces.db` instead of .picasa.ini.
7. **Favorite-exporter worker**: Adapt for orchestrated runs, stats reporting.
8. **Extraction**: Remove GEO and INDEX logic; EXIF only, write to `picisa_exif.db`.
9. **Stats**: Add worker stats IPC, Workers tab in UI.
10. **Worker manager**: Spawn workers, sequential orchestration, conditional startup.

---

## 8. Key Files


| File                                                                                                         | Changes                                                              |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| [server/services/entries/internal/database.ts](server/services/entries/internal/database.ts)                 | ATTACH exif, geo, faces, search; remove child tables from main DB    |
| [server/services/exif/internal/database.ts](server/services/exif/internal/database.ts)                       | Open `picisa_exif.db` (or use ATTACH from main)                      |
| [server/services/geolocate/internal/database.ts](server/services/geolocate/internal/database.ts)             | Open `picisa_geo.db`                                                 |
| [server/services/faces/internal/face-database.ts](server/services/faces/internal/face-database.ts)           | New: Open `picisa_faces.db`; contacts, face_rects tables             |
| [server/services/search/internal/database.ts](server/services/search/internal/database.ts)                   | Open `picisa_search.db`                                              |
| [server/worker-manager.ts](server/worker-manager.ts)                                                         | Spawn workers, orchestration, conditional startup, stats aggregation |
| [server/config/background-services.json](server/config/background-services.json)                             | New: intervals, enabled flags                                        |
| [server/services/geolocate/worker.ts](server/services/geolocate/worker.ts)                                   | New: worker entry                                                    |
| [server/services/search/worker.ts](server/services/search/worker.ts)                                         | New: worker entry                                                    |
| [server/services/faces/worker.ts](server/services/faces/worker.ts)                                           | Adapt for orchestrated runs, stats                                   |
| [server/services/favorite-exporter/worker.ts](server/services/favorite-exporter/worker.ts)                   | Adapt for orchestrated runs, stats                                   |
| [server/services/extraction/internal/worker-thread.ts](server/services/extraction/internal/worker-thread.ts) | EXIF only; write to picisa_exif.db                                   |
| [server/start.ts](server/start.ts)                                                                           | Add `workers` to `/stats` response                                   |
| [client/stats.ts](client/stats.ts)                                                                           | Add Workers tab                                                      |


---

## 9. ATTACH DATABASE Example (Main Process)

```typescript
// server/services/entries/internal/database.ts (or a new db-attach.ts)

const ENTRIES_DB_PATH = join(imagesRoot, "picisa_entries.db");
const EXIF_DB_PATH = join(imagesRoot, "picisa_exif.db");
const GEO_DB_PATH = join(imagesRoot, "picisa_geo.db");
const FACES_DB_PATH = join(imagesRoot, "picisa_faces.db");
const SEARCH_DB_PATH = join(imagesRoot, "picisa_search.db");

function initializeAttachedDatabases(db: Database): void {
  db.run(`ATTACH DATABASE '${EXIF_DB_PATH}' AS exif`);
  db.run(`ATTACH DATABASE '${GEO_DB_PATH}' AS geo`);
  db.run(`ATTACH DATABASE '${FACES_DB_PATH}' AS faces`);
  db.run(`ATTACH DATABASE '${SEARCH_DB_PATH}' AS search`);
}

// Queries use: main.albums, main.album_entries, exif.exif_data, geo.geo_poi_data, faces.contacts, faces.face_rects, search.pictures
```

Queries that join across domains (e.g. search with geo filters) run in main process using the attached connection.
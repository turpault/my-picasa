import { join } from "path";
import { imagesRoot } from "./constants";

export const ENTRIES_DB_PATH = join(imagesRoot, "picisa_entries.db");
export const EXIF_DB_PATH = join(imagesRoot, "picisa_exif.db");
export const GEO_DB_PATH = join(imagesRoot, "picisa_geo.db");
export const FACES_DB_PATH = join(imagesRoot, "picisa_faces.db");
export const SEARCH_DB_PATH = join(imagesRoot, "picisa_search.db");
/** Faces worker job-queue SQLite (not the main in-memory queue). */
export const FACES_JOB_QUEUE_DB_PATH = join(imagesRoot, "picisa_queue_faces.db");
export const POI_DB_PATH = join(imagesRoot, "poi.db");

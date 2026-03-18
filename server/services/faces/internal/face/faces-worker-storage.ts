/**
 * Storage adapter for faces worker. Writes to picisa_faces.db instead of .picasa.ini.
 */
import type { Album, AlbumEntry, Contact } from "../../../../../shared/types/types";
import { personKeyFromName } from "../../../../../shared/types/types";
import {
  getFacesWorkerDatabase,
  upsertContact,
  upsertFaceRect,
  getEntryId,
} from "../worker-database";

export interface FacesWorkerStorage {
  addContact(album: Album, hash: string, contact: Contact): Promise<void>;
  addFaceRect(entry: AlbumEntry, hash: string, rect: string): Promise<void>;
}

let workerStorage: FacesWorkerStorage | null = null;

export function setFacesWorkerStorage(storage: FacesWorkerStorage | null): void {
  workerStorage = storage;
}

export function getFacesWorkerStorage(): FacesWorkerStorage | null {
  return workerStorage;
}

/**
 * Create the default faces worker storage that writes to picisa_faces.db.
 */
export function createFacesWorkerStorage(): FacesWorkerStorage {
  const db = getFacesWorkerDatabase();
  return {
    async addContact(_album: Album, hash: string, contact: Contact): Promise<void> {
      const albumKey = personKeyFromName(contact.name ?? "Unknown");
      upsertContact(db, hash, albumKey, contact);
    },
    async addFaceRect(entry: AlbumEntry, hash: string, rect: string): Promise<void> {
      const entryId = getEntryId(db, entry.album.key, entry.name);
      if (entryId) {
        upsertFaceRect(db, entryId, hash, rect);
      }
    },
  };
}

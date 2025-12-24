import { Album, AlbumEntry, Face, FaceList } from "../../../shared/types/types";
import { decodeFaces } from "../../../shared/lib/utils";
import { decodeReferenceId } from "../../../rpc/albumTypes/referenceFiles";
import { getAllAlbums, getAlbumEntries, getEntryMetadata } from "../../services/walker/queries";

/**
 * Faces Service Queries (Read-Only)
 * 
 * This module provides read-only query access to face/person data.
 * Queries are executed directly against the walker database and face album structures.
 */

/**
 * Get a list of all persons (face albums)
 * Returns face albums as Album objects
 */
export function getPersons(): Album[] {
  const { getFaceAlbums } = require("../../operations/faces/faces");
  return getFaceAlbums();
}

/**
 * Get faces for a given album entry
 * Returns a list of faces with their associated rectangles
 */
export function getFacesForEntry(entry: AlbumEntry): FaceList {
  const metadata = getEntryMetadata(entry);
  const facesString = metadata.faces || "";
  return decodeFaces(facesString);
}

/**
 * Get all album entries where a given person (face album) appears
 * Face albums contain entries where the entry name is a reference ID
 * that encodes the original album entry
 */
export function getEntriesForPerson(person: Album): AlbumEntry[] {
  // Get all entries from the face album
  const faceAlbumEntries = getAlbumEntries(person);
  
  // Decode each reference ID to get the original entry
  const entries: AlbumEntry[] = [];
  for (const faceEntry of faceAlbumEntries) {
    try {
      // The entry name in a face album is a reference ID
      // Decode it to get the original album entry
      const { entry } = decodeReferenceId(faceEntry.name);
      entries.push(entry);
    } catch (error) {
      // Skip invalid reference IDs
      console.warn(`Invalid reference ID in face album ${person.key}: ${faceEntry.name}`, error);
    }
  }
  
  return entries;
}


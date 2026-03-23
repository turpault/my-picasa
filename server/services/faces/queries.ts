import { createHash } from "crypto";
import { decodeFaces } from "../../../shared/lib/utils";
import { Album, AlbumEntry, AlbumWithData, Contact, FaceList, idFromKey } from "../../../shared/types/types";
import { getFaceAlbums } from "../../operations/faces/faces";
import { getAlbumEntries, getEntryMetadata } from "../../services/walker/queries";

/**
 * Faces Service Queries (Read-Only)
 * 
 * This module provides read-only query access to face/contact data.
 * Queries are executed directly against the walker database and face album structures.
 */

/**
 * Generate a unique ID for a contact based on their name
 * Uses a hash to ensure consistency across sessions
 */
function generateContactId(name: string): string {
  return createHash("sha256").update(`person:${name}`).digest("hex").substring(0, 16);
}

/**
 * Get a list of all contacts with their entry counts
 * Returns Contact objects with id, name, and count
 */
export function getContacts(): Contact[] {
  const faceAlbums = getFaceAlbums();

  return faceAlbums.map((album: AlbumWithData) => {
    // Extract contact name from the album key (format: "person»name")
    const contactName = idFromKey(album.key);
    const id = generateContactId(contactName);
    // Count entries in the face album
    const entries = getAlbumEntries(album);

    return {
      id,
      originalName: contactName,
      name: contactName,
      email: "",
      something: "",
      key: album.key,
      count: entries.length,
    };
  });
}

/**
 * Get faces for a given album entry
 * Returns a list of faces with their associated rectangles
 */
export async function getFacesForEntry(entry: AlbumEntry): Promise<FaceList> {
  const metadata = await getEntryMetadata(entry);
  const facesString = metadata.faces || "";
  return decodeFaces(facesString);
}

/**
 * Get all album entries where a given contact (face album) appears
 * Face albums contain entries where the entry name is a reference ID
 * that encodes the original album entry
 */
export function getEntriesForContact(contact: Contact): AlbumEntry[] {
  // TODO: Execute query to get entries for contact

  return [];
}

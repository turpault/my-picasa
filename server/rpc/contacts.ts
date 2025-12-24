import Debug from "debug";
import { createHash } from "crypto";
import { Album, AlbumEntry, Contact, personKeyFromName } from "../../shared/types/types";
import { events } from "../../shared/server-events";
import { getAlbumEntries, readPersons, getAllAlbums } from "../services/walker/queries";

const debug = Debug("app:persons");

/**
 * Generate a unique ID for a contact based on their name
 * Uses a hash to ensure consistency across sessions
 */
function generateContactId(name: string): string {
  return createHash("sha256").update(`person:${name}`).digest("hex").substring(0, 16);
}

/**
 * Calculate contact counts by scanning all album entries
 */
function calculateContactCounts(): Map<string, { id: string; count: number }> {
  const contactData = new Map<string, { id: string; count: number }>();
  const albums = getAllAlbums();

  for (const album of albums) {
    const entries = getAlbumEntries(album);
    for (const entry of entries) {
      const contactNames = readPersons(entry);
      for (const contactName of contactNames) {
        if (contactName) {
          const id = generateContactId(contactName);
          const existing = contactData.get(contactName);
          contactData.set(contactName, {
            id,
            count: (existing?.count || 0) + 1,
          });
        }
      }
    }
  }

  return contactData;
}

export async function buildPersonsList() {
  // Listen to album changes to emit person image list change events
  const onAlbumAddedOrUpdated = async (album: Album) => {
    const contactData = calculateContactCounts();
    const contactsList: Contact[] = Array.from(contactData.entries()).map(([name, data]) => ({
      id: data.id,
      originalName: name,
      name,
      email: "",
      something: "",
      key: personKeyFromName(name),
      count: data.count,
    }));

    // Emit event for each contact whose count may have changed
    for (const contact of contactsList) {
      events.emit("personImagesChanged", { person: contact });
    }
  };

  const onAlbumEntryAddedOrUpdated = async (entry: AlbumEntry) => {
    await onAlbumAddedOrUpdated(entry.album);
  };

  events.on("albumAdded", onAlbumAddedOrUpdated);
  events.on("albumUpdated", onAlbumAddedOrUpdated);
  events.on("albumRemoved", onAlbumAddedOrUpdated);
  events.on("albumEntryAdded", onAlbumEntryAddedOrUpdated);
  events.on("albumEntryRemoved", onAlbumEntryAddedOrUpdated);
  events.on("albumEntryUpdated", onAlbumEntryAddedOrUpdated);

  debug(`Person list built`);
}

import Debug from "debug";
import { createHash } from "crypto";

import { Album, Person } from "../../shared/types/types";
import { getAlbumEntries, readPersons, getAllAlbums } from "../services/walker/queries";
import { events } from "../../shared/server-events";

const debug = Debug("app:persons");

/**
 * Generate a unique ID for a person based on their name
 * Uses a hash to ensure consistency across sessions
 */
function generatePersonId(name: string): string {
  return createHash("sha256").update(`person:${name}`).digest("hex").substring(0, 16);
}

/**
 * Calculate person counts by scanning all album entries
 */
async function calculatePersonCounts(): Promise<Map<string, { id: string; count: number }>> {
  const personData = new Map<string, { id: string; count: number }>();
  const albums = await getAllAlbums();

  for (const album of albums) {
    const entries = await getAlbumEntries(album);
    for (const entry of entries) {
      const persons = await readPersons(entry);
      for (const personName of persons) {
        if (personName) {
          const id = generatePersonId(personName);
          const existing = personData.get(personName);
          personData.set(personName, {
            id,
            count: (existing?.count || 0) + 1,
          });
        }
      }
    }
  }

  return personData;
}

export async function buildPersonsList() {
  // Listen to album changes to emit person image list change events
  const onAlbumAddedOrUpdated = async (album: Album) => {
    const personData = await calculatePersonCounts();
    const personsList: Person[] = Array.from(personData.entries()).map(([name, data]) => ({
      id: data.id,
      name,
      count: data.count,
    }));

    // Emit event for each person whose count may have changed
    for (const person of personsList) {
      events.emit("personImagesChanged", { person });
    }
  };

  const onAlbumEntryAddedOrUpdated = async (entry: AlbumEntry) => {

    events.on("albumAdded", onAlbumAddedOrUpdated);
    events.on("albumUpdated", onAlbumAddedOrUpdated);
    events.on("albumRemoved", onAlbumAddedOrUpdated);
    events.on("albumEntryAdded", onAlbumAddedOrUpdated);
    events.on("albumEntryRemoved", onAlbumAddedOrUpdated);
    events.on("albumEntryUpdated", onAlbumAddedOrUpdated);

    debug(`Person list built`);
  }

}
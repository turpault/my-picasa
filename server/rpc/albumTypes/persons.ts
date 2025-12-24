import Debug from "debug";

import { Album } from "../../../shared/types/types";
import { getAlbumEntries, readPersons } from "../../services/walker/queries";
import { events } from "../../../shared/server-events";
const persons = new Set<string>();

const debug = Debug("app:persons");

export async function buildPersonsList() {
  const updatePersons = async (album: Album) => {
    const entries = getAlbumEntries(album);
    for (const entry of entries) {
      const newPersons = readPersons(entry);
      for (const person of newPersons) {
        persons.add(person);
      }
    }
  };
  events.on("albumAdded", updatePersons);
  events.on("albumUpdated", updatePersons);

  debug(`Person list built : ${persons.size} persons`);
}

export async function getPersons() {
  return Array.from(persons);
}

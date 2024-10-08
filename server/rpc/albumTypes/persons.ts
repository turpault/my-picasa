import Debug from "debug";

import { Album, AlbumKind } from "../../../shared/types/types";
import { albumEventEmitter, waitUntilWalk } from "../../walker";
import { readAlbumEntries, readPersons } from "../rpcFunctions/picasa-ini";
const persons = new Set<string>();

const debug = Debug("app:persons");

export async function buildPersonsList() {
  const updatePersons = async (album: Album) => {
    if (album.kind === AlbumKind.FOLDER) {
      const entries = await readAlbumEntries(album);
      for (const entry of entries) {
        const newPersons = await readPersons(entry);
        for (const person of newPersons) {
          persons.add(person);
        }
      }
    }
  };
  albumEventEmitter.on("added", updatePersons);
  albumEventEmitter.on("updated", updatePersons);

  debug(`Person list built : ${persons.size} persons`);
}

export async function getPersons() {
  await waitUntilWalk();
  return Array.from(persons);
}

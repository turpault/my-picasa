import Debug from "debug";

import {
  buildReadySemaphore,
  setReady
} from "../../../shared/lib/utils";
import { getFolderAlbums } from "../../walker";
import { media } from "../rpcFunctions/albumUtils";
import {
  readPersons
} from "../rpcFunctions/picasa-ini";
const persons:string[] = [];

const debug = Debug("app:persons");
const readyLabelKey = "person-list-ready";
const ready = buildReadySemaphore(readyLabelKey);

export async function buildPersonsList() {
  const albums = await getFolderAlbums();
  const allPersons = await Promise.all(albums.map(async (album) => {
    return (await Promise.all((await media(album)).entries.map((entry) => readPersons(entry)))).flat();
  }
  ));
  // deduplicate
  persons.push(...allPersons.flat().reduce((acc, val) => acc.includes(val) ? acc : [...acc, val], [] as string[]));
  setReady(readyLabelKey);
  debug(`Person list built : ${persons.length} persons`);
}

export async function getPersons() {
  await ready;
  return persons;
}

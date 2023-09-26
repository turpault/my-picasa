import { Queue } from "../../../shared/lib/queue";
import {
  debounce,
  fromBase64,
  sleep,
  toBase64,
} from "../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumKind,
  AlbumWithData,
  FaceData,
  keyFromID,
} from "../../../shared/types/types";
import { getFolderAlbums, waitUntilWalk } from "../../background/bg-walker";
import { entryFilePath, fileExists } from "../../utils/serverUtils";
import { media } from "../rpcFunctions/albumUtils";
import {
  readAlbumEntries,
  readAlbumIni,
  readPicasaEntry,
  updatePicasa,
  updatePicasaEntry,
} from "../rpcFunctions/picasa-ini";
import { deleteFaceImage, getFaceImage } from "../rpcFunctions/thumbnail";

/**
 * all the known face albums
 */
let faces = new Map<
  string,
  AlbumWithData & { hash: { [key: string]: string } } & { [key: string]: any }
>();

let parsedFaces = new Set<string>();
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/^[a-z]|[\s|-][a-z]/gi, (s) => {
    return s.toUpperCase();
  });
}

/**
 * Export all faces to a folder
 */
async function exportAllFaces() {
  const getFaceImageQueue = new Queue(4, { fifo: false });
  const albums = await getFaceAlbums();
  await Promise.all(
    albums.map(async (album) => {
      const entries = await media(album);
      await Promise.all(
        entries.entries.map(async (entry) =>
          getFaceImageQueue.add(() => getFaceImage(entry, true))
        )
      );
    })
  );
  await getFaceImageQueue.drain();
}

export async function keepFaceAlbumUpdated() {
  await waitUntilWalk();
  while (true) {
    await exportAllFaces();
    await sleep(3600);
  }
}

async function detectFaces(album: Album) {
  const knownFaces = await getFaceAlbums();
}

export function getFaceAlbumFromHash(
  hash: string
): { album: AlbumWithData | undefined; hash: string } {
  for (const face of faces.values()) {
    if (face.hash[hash] !== undefined) {
      return { album: face, hash };
    }
  }
  return { album: undefined, hash };
}

// Limit the parallelism for the face parsing
const faceProcessingQueue = new Queue(5);
async function processFaces(album: Album) {
  if (album.key.normalize() !== album.key) {
    debugger;
  }
  const picasaIni = await readAlbumIni(album);
  if (parsedFaces.has(album.key)) {
    return;
  }
  parsedFaces.add(album.key);
  return faceProcessingQueue.add(async () => {
    const localhashes: { [hash: string]: AlbumWithData } = {};
    if (picasaIni.Contacts2) {
      // includes a map of faces/ids
      for (const [hash, value] of Object.entries(
        picasaIni.Contacts2 as { [key: string]: string }
      )) {
        const [originalName, email, something] = value.split(";");
        const name = normalizeName(originalName);

        const key = keyFromID(name, AlbumKind.FACE);
        if (!faces.has(key)) {
          faces.set(key, {
            key,
            name,
            count: 0,
            hash: {},
            email,
            something,
            originalName,
            kind: AlbumKind.FACE,
          });
        }
        faces.get(key)!.hash[hash] = "";
        localhashes[hash] = faces.get(key)!;
      }
    }

    for (const entryName of Object.keys(picasaIni)) {
      const exists = await fileExists(
        entryFilePath({ album, name: entryName })
      );
      const iniFaces = picasaIni[entryName].faces;

      if (iniFaces) {
        // Example:faces=rect64(9bff22f6ad443ebb),d04ca592f8868c2;rect64(570c6e79670c8820),4f3f1b40e69b2537;rect64(b8512924c7ae41f2),69618ff17d8c570f
        for (const face of iniFaces.split(";")) {
          const [rect, id] = face.split(",");
          const faceAlbum = localhashes[id];
          if (faceAlbum) {
            faceAlbum.count++;
            if (album.key.normalize() !== album.key) {
              debugger;
            }
            const sectionName = toBase64(
              JSON.stringify([album.key, entryName, rect, id])
            );

            if (exists) {
              updatePicasa(
                faceAlbum,
                "originalAlbumName",
                album.name,
                sectionName
              );
              updatePicasa(
                faceAlbum,
                "originalAlbumKey",
                album.key,
                sectionName
              );
              updatePicasa(faceAlbum, "originalName", entryName, sectionName);
            } else {
              updatePicasa(faceAlbum, "originalAlbumName", null, sectionName);
              updatePicasa(faceAlbum, "originalAlbumKey", null, sectionName);
              updatePicasa(faceAlbum, "originalName", null, sectionName);
            }
          }
        }
      }
    }
  });
}

export async function eraseFace(entry: AlbumEntry) {
  if (entry.album.kind !== AlbumKind.FACE) {
    throw new Error("Not a face album");
  }
  await deleteFaceImage(entry);
  const d = await getFaceData(entry);

  const originalImageEntry = d.originalEntry;
  // entry.name is the face hash
  updatePicasa(entry.album, null, null, entry.name);

  // Update entry in original picasa.ini
  let iniFaces = (await readPicasaEntry(originalImageEntry))?.faces;
  if (iniFaces) {
    iniFaces = iniFaces
      .split(";")
      .filter((f) => !f.includes(`,${d.hash}`))
      .join(";");
    updatePicasaEntry(originalImageEntry, "faces", iniFaces);
  }
}

export function getFaceAlbums(): AlbumWithData[] {
  return Array.from(faces.values());
}

export async function getFaceData(entry: AlbumEntry): Promise<FaceData> {
  const picasaEntry = await readPicasaEntry(entry);
  const originalEntry: AlbumEntry = {
    album: {
      key: picasaEntry.originalAlbumKey!,
      name: picasaEntry.originalAlbumName!,
      kind: AlbumKind.FOLDER,
    },
    name: picasaEntry.originalName!,
  };

  const [albumKey, label, rect, hash] = JSON.parse(fromBase64(entry.name));
  return { originalEntry, label, rect, faceAlbum: entry.album, hash };
}

export async function readFaceAlbumEntries(
  album: Album
): Promise<AlbumEntry[]> {
  return await readAlbumEntries(album);
}

/**
 *
 * @returns
 */
export async function scanFaces() {
  return debounce(
    async () => {
      // Only do it once
      const albums = await getFolderAlbums();
      await Promise.all(albums.map((album) => processFaces(album)));
    },
    3600 * 1000 * 24 * 7,
    "scanFaces",
    true
  );
}

export async function getFaceAlbumsWithData(
  _filter: string = ""
): Promise<AlbumWithData[]> {
  // Create 'fake' albums with the faces
  await scanFaces();
  return getFaceAlbums();
}

/*
export async function consolidateFaces(face: string, withFace: string) {
  const faceAlbum = await getFa
  const picasa = await media()
  const faces = picasa.faces || {};
  const faces2 = picasa.faces2 || {};
  const face2 = faces2[withFace];
  if (!face2) {
    return;
  }
  for (const f of Object.keys(faces)) {
    if (faces[f] === face2) {
      faces[f] = face;
    }
  }
  faces2[face] = faces2[withFace];
  delete faces2[withFace];
  picasa.faces = faces;
  picasa.faces2 = faces2;
  writePicasa(picasa);
}*/

/*
let data = { ...(await readAlbumIni(album)) };

const faceIds: string[] = [];
for (const [id, val] of faces.entries()) {
  if (val.name.toLowerCase().includes(normalizedFilter)) {
    faceIds.push(id);
  }
}
const res: AlbumEntry[] = [];
Object.entries(data).forEach(([name, picasaEntry]) => {
  if (name.toLowerCase().includes(normalizedFilter)) {
    res.push({ album, name });
    return;
  }
  if (album.name.toLowerCase().includes(normalizedFilter)) {
    res.push({ album, name });
    return;
  }
  if (picasaEntry.faces) {
    for (const id of faceIds) {
      if (picasaEntry.faces.includes(id)) {
        res.push({ album, name });
        return;
      }
    }
  }
});
if (res.length > 0) {
}
return res;
*/

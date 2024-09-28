import {
  debounce,
  idFromAlbumEntry,
  isPicture,
  isVideo,
  removeDiacritics,
  sortByKey,
} from "../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumEntryMetaData,
  AlbumKind,
  AlbumWithData,
  GeoPOI,
  idFromKey,
} from "../../../shared/types/types";
import { getFolderAlbumData, getFolderAlbums } from "../../walker";
import {
  getFaceAlbum,
  getFaceAlbums,
  getFaceData,
  readFaceAlbumEntries,
} from "./faces";
import {
  assetsInFolderAlbum,
  queueNotification,
} from "../albumTypes/fileAndFolders";
import {
  getProjectAlbum,
  getProjectAlbums,
  getProjects,
} from "../albumTypes/projects";
import { getPicasaEntry, readAlbumIni, updatePicasaEntry } from "./picasa-ini";

export async function setRank(entry: AlbumEntry, rank: number): Promise<void> {
  const entries = (await media(entry.album)).entries;
  const entryIndex = entries.findIndex(
    (e) => idFromAlbumEntry(e, "") === idFromAlbumEntry(entry, ""),
  );
  if (entryIndex !== -1) {
    if (rank > entryIndex) rank--;
    entries.splice(entryIndex, 1);
    entries.splice(rank, 0, entry);
    await assignRanks(entries);
    notifyAlbumOrderUpdated(entry.album);
  }
}

function notifyAlbumOrderUpdated(album: Album) {
  debounce(
    () => {
      queueNotification({
        type: "albumOrderUpdated",
        album: albumWithData(album),
      });
    },
    100,
    "setRank/" + album.name,
    false,
  );
}

async function assignRanks(filesInFolder: AlbumEntry[]): Promise<void> {
  let rank = 0;
  for (const entry of filesInFolder) {
    if (isPicture(entry) || isVideo(entry)) {
      let current = (await getPicasaEntry(entry)).rank || "0";
      if (rank !== parseInt(current)) {
        updatePicasaEntry(entry, "rank", rank);
      }
      rank++;
    }
  }
}

export async function sortAlbum(album: Album, order: string): Promise<void> {
  const i = await readAlbumIni(album);
  const entries = (await media(album)).entries;

  switch (order) {
    case "reverse":
      {
        await assignRanks(entries.reverse());
        notifyAlbumOrderUpdated(album);
      }
      break;
    case "name":
      {
        const sorted = entries.sort((e1, e2) => {
          return e1.name.toLowerCase() < e2.name.toLowerCase()
            ? -1
            : e1.name.toLowerCase() > e2.name.toLowerCase()
              ? 1
              : 0;
        });
        await assignRanks(sorted);
        notifyAlbumOrderUpdated(album);
      }
      break;
    case "date":
      {
        /*
        const infos = await Promise.all(
          entries.map((file) =>
            exifDataAndStats({ album, name: file.name }).then((exif) => ({
              exif,
              entry: { album, name: file.name },
            }))
          )
        );
        */
        const sorted = entries.sort((e1, e2) => {
          if (
            i[e1.name] &&
            i[e2.name] &&
            i[e1.name].dateTaken !== undefined &&
            i[e2.name].dateTaken !== undefined
          )
            return (
              new Date(i[e1.name].dateTaken!).getTime() -
              new Date(i[e2.name].dateTaken!).getTime()
            );
          return 0;
        });

        /*const sorted = infos.sort((e1, e2) => {
          if (e1.exif.tags.DateTime && e2.exif.tags.DateTime)
            return e1.exif.tags.DateTime - e2.exif.tags.DateTime;
          if (!e1.exif.tags.DateTime && !e2.exif.tags.DateTime)
            return (
              e1.exif.stats.ctime.getTime() - e2.exif.stats.ctime.getTime()
            );
          if (!e1.exif.tags.DateTime)
            return e1.exif.stats.ctime.getTime() - e2.exif.tags.DateTime;
          return e1.exif.tags.DateTime - e2.exif.stats.ctime.getTime();
        });*/

        await assignRanks(sorted);
        notifyAlbumOrderUpdated(album);
      }
      break;
  }
}

export async function mediaCount(album: Album): Promise<{ count: number }> {
  if (album.kind === AlbumKind.FOLDER) {
    return { count: (await assetsInFolderAlbum(album)).entries.length };
  } else if (album.kind === AlbumKind.FACE) {
    const ini = await readAlbumIni(album);
    return { count: Object.keys(ini).length };
  } else throw new Error(`Unknown kind ${album.kind}`);
}

/**
 * Returns true if the entry should be included in the filtered list
 * @param entry The entry
 * @param AlbumEntryMetaData the picasa metadata for that entry
 * @param filter a lowercase diacritic-insensitive filter
 * @returns
 */
function inFilter(entry: AlbumEntry, meta: AlbumEntryMetaData, filter: string) {
  if (filter === "") return true;
  return (
    removeDiacritics(entry.name).toLowerCase().includes(filter) ||
    (meta.caption &&
      removeDiacritics(meta.caption).toLowerCase().includes(filter)) ||
    removeDiacritics(entry.album.name).toLowerCase().includes(filter) ||
    (meta.text && removeDiacritics(meta.text).toLowerCase().includes(filter)) ||
    (meta.geoPOI &&
      removeDiacritics(
        JSON.parse(meta.geoPOI)
          .map((g: GeoPOI) => g.loc)
          .join("|"),
      )
        .toLowerCase()
        .includes(filter))
  );
}

/**
 * Returns the contents of an album, sorted by its rank
 * @param album
 * @returns
 */
export async function media(
  album: Album,
  filter?: string,
): Promise<{ entries: AlbumEntry[] }> {
  if (album.kind === AlbumKind.FOLDER) {
    let [picasa, assets] = await Promise.all([
      readAlbumIni(album),
      assetsInFolderAlbum(album),
    ]);

    let entries = assets.entries.filter((e) =>
      filter ? inFilter(e, picasa[e.name], filter) : true,
    );

    await sortAssetsByRank(entries);
    await assignRanks(entries);
    return { entries };
  } else if (album.kind === AlbumKind.FACE) {
    //const ini = await readAlbumIni(album);
    //const entries = Object.keys(ini).map((name) => ({ album, name }));
    const entries = await readFaceAlbumEntries(album);
    await sortAssetsByRank(entries);
    await assignRanks(entries);
    return { entries };
  } else if (album.kind === AlbumKind.PROJECT) {
    const entries = await getProjects(album.key);
    return { entries };
  } else throw new Error(`Unknown kind ${album.kind}`);
}

async function sortAssetsByRank(entries: AlbumEntry[]) {
  await Promise.all(
    entries.map(async (entry) => {
      const meta = await getPicasaEntry(entry);
      Object.assign(entry, { rank: meta.rank });
    }),
  );

  sortByKey(entries as (AlbumEntry & { rank: any })[], ["rank"], ["numeric"]);
}

export function albumWithData(
  album: Album | string,
): AlbumWithData | undefined {
  const kind = typeof album === "string" ? idFromKey(album).kind : album.kind;
  const key = typeof album === "string" ? album : album.key;
  if (kind === AlbumKind.FOLDER) {
    return getFolderAlbumData(key);
  } else if (kind === AlbumKind.PROJECT) {
    return getProjectAlbum(key);
  } else if (kind === AlbumKind.FACE) {
    return getFaceAlbum(key);
  } else throw new Error(`Unknown kind ${kind}`);
}

export async function getAlbumMetadata(album: Album) {
  switch (album.kind) {
    case AlbumKind.FOLDER: {
      const ini = await readAlbumIni(album);
      return ini;
    }
    case AlbumKind.PROJECT:
      return {};
    case AlbumKind.FACE: {
      const ini = await readAlbumIni(album);
      await Promise.all(
        Object.keys(ini).map(async (name) => {
          const faceData = await getFaceData({ album, name });

          const originalEntry = await getPicasaEntry(faceData.originalEntry);
          if (originalEntry) {
            if (originalEntry.dateTaken)
              ini[name].dateTaken = originalEntry.dateTaken;
            if (originalEntry.star) ini[name].star = originalEntry.star;
          }
        }),
      );
      return ini;
    }
    default:
      throw new Error(`Unkown kind ${album.kind}`);
  }
}

export async function getAlbumEntryMetadata(albumEntry: AlbumEntry) {
  const albumMetadata = await getAlbumMetadata(albumEntry.album);
  return albumMetadata[albumEntry.name] as AlbumEntryMetaData;
}

export async function monitorAlbums(): Promise<{}> {
  const lastWalk = await getFolderAlbums();
  const f = getFaceAlbums();
  const p = getProjectAlbums();
  queueNotification({ type: "albums", albums: [...lastWalk, ...f, ...p] });
  return {};
}

export async function getSourceEntry(entry: AlbumEntry) {
  switch (entry.album.kind) {
    case AlbumKind.FOLDER:
      return entry;
    case AlbumKind.FACE:
      const faceData = await getFaceData(entry);
      return faceData.originalEntry;
    default:
      throw new Error(`Unkown kind ${entry.album.kind}`);
  }
}

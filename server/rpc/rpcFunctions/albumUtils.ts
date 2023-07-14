import {
  debounce,
  idFromAlbumEntry,
  isPicture,
  isVideo,
  sortByKey,
} from "../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumKind,
  AlbumWithData,
  idFromKey,
} from "../../../shared/types/types";
import {
  getFaceAlbums,
  getFaceAlbumsWithData,
  getFaceData,
  readFaceAlbumEntries,
} from "../albumTypes/faces";
import {
  getProjectAlbum,
  getProjectAlbums,
  getProjects,
} from "../albumTypes/projects";
import { exifDataAndStats } from "./exif";
import {
  getFolderAlbums,
  assetsInFolderAlbum,
  getFolderAlbumData,
  queueNotification,
  waitUntilWalk,
} from "../albumTypes/fileAndFolders";
import { readAlbumIni, readPicasaEntry, updatePicasaEntry } from "./picasaIni";

export async function setRank(entry: AlbumEntry, rank: number): Promise<void> {
  const entries = (await media(entry.album)).entries.filter(
    (e) => idFromAlbumEntry(e, "") !== idFromAlbumEntry(entry, "")
  );
  entries.splice(rank, 0, entry);
  await assignRanks(entries);
  notifyAlbumOrderUpdated(entry.album);
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
    false
  );
}

async function assignRanks(filesInFolder: AlbumEntry[]): Promise<void> {
  let rank = 0;
  for (const entry of filesInFolder) {
    if (isPicture(entry) || isVideo(entry)) {
      let current = (await readPicasaEntry(entry)).rank || "0";
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
 * Returns the contents of an album, sorted by its rank
 * @param album
 * @returns
 */
export async function media(album: Album): Promise<{ entries: AlbumEntry[] }> {
  if (album.kind === AlbumKind.FOLDER) {
    let [picasa, assets] = await Promise.all([
      readAlbumIni(album),
      assetsInFolderAlbum(album),
    ]);

    let entries = assets.entries;
    for (const entry of entries) {
      if (isPicture(entry)) {
        if (!picasa[entry.name] || !picasa[entry.name].dateTaken) {
          const exif = await exifDataAndStats(entry);
          // dates, in fallback order
          const pictureDate =
            exif.tags.DateTimeOriginal ||
            (exif.tags.CreateDate && new Date(exif.tags.CreateDate)) ||
            (exif.tags.ModifyDate && new Date(exif.tags.ModifyDate));
          if (pictureDate)
            updatePicasaEntry(entry, "dateTaken", pictureDate.toISOString());
          else if (exif.stats) {
            // Default to file creation time
            updatePicasaEntry(
              entry,
              "dateTaken",
              exif.stats.ctime.toISOString()
            );
          }
        }
      }
    }
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
      const meta = await readPicasaEntry(entry);
      Object.assign(entry, { rank: meta.rank });
    })
  );

  sortByKey(entries as (AlbumEntry & { rank: any })[], ["rank"], ["numeric"]);
}

export function albumWithData(
  album: Album | string
): AlbumWithData | undefined {
  const kind = typeof album === "string" ? idFromKey(album).kind : album.kind;
  const key = typeof album === "string" ? album : album.key;
  if (kind === AlbumKind.FOLDER) {
    return getFolderAlbumData(key);
  } else if (kind === AlbumKind.PROJECT) {
    return getProjectAlbum(key);
  } else if (kind === AlbumKind.FACE) {
    return getFaceAlbums().find((f) => f.key == key);
  } else throw new Error(`Unknown kind ${kind}`);
}

export async function readAlbumMetadata(album: Album) {
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

          const originalEntry = await readPicasaEntry(faceData.originalEntry);
          if (originalEntry) {
            if (originalEntry.dateTaken)
              ini[name].dateTaken = originalEntry.dateTaken;
            if (originalEntry.star) ini[name].star = originalEntry.star;
          }
        })
      );
      return ini;
    }
    default:
      throw new Error(`Unkown kind ${album.kind}`);
  }
}

export async function monitorAlbums(): Promise<{}> {
  const lastWalk = await getFolderAlbums();
  const f = await getFaceAlbumsWithData("");
  const p = await getProjectAlbums();
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

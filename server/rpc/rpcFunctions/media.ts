import { readdir, stat } from "fs/promises";
import { join } from "path";
import {
  debounce,
  idFromAlbumEntry,
  isPicture,
  isVideo,
} from "../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumKind,
  idFromKey,
} from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";
import { exifDataAndStats } from "./exif";
import { readAlbumIni, readPicasaEntry, updatePicasaEntry } from "./picasaIni";
import { albumWithData, queueNotification } from "./walker";
import { getProjects } from "../projects";

export async function setRank(entry: AlbumEntry, rank: number): Promise<void> {
  const entries = (await media(entry.album)).entries.filter(
    (e) => idFromAlbumEntry(e, "") !== idFromAlbumEntry(entry, "")
  );
  await sortAssetsByRank(entries, entry, rank);
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
      let current = (await readPicasaEntry(entry)).rank;
      if (current !== undefined) {
        rank = Math.max(rank + 1, parseInt(current));
      }
      updatePicasaEntry(entry, "rank", rank);
    }
  }
}

export async function sortAlbum(album: Album, order: string): Promise<void> {
  const i = await readAlbumIni(album);
  const entries = (await media(album)).entries;

  switch (order) {
    case "reverse":
      {
        await sortAssetsByRank(entries);
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

export async function assetsInFolderAlbum(
  album: Album
): Promise<{ entries: AlbumEntry[]; folders: string[] }> {
  if (album.kind !== AlbumKind.FOLDER) {
    throw new Error("Can only scan folders");
  }
  const items = await readdir(join(imagesRoot, idFromKey(album.key).id));
  const entries: AlbumEntry[] = [];
  const folders: string[] = [];

  await Promise.all(
    items
      .filter((i) => !i.startsWith("."))
      .map(async (i) => {
        const entry = { album, name: i };
        if (isPicture(entry) || isVideo(entry)) {
          entries.push(entry);
        } else {
          const s = await stat(join(imagesRoot, idFromKey(album.key).id, i));
          if (s.isDirectory()) {
            folders.push(i);
          }
        }
      })
  );

  return { entries, folders };
}

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
    const ini = await readAlbumIni(album);
    const entries = Object.keys(ini).map((name) => ({ album, name }));
    await sortAssetsByRank(entries);
    await assignRanks(entries);
    return { entries };
  } else if (album.kind === AlbumKind.PROJECT) {
    const entries = await getProjects(album.key);
    return { entries };
  } else throw new Error(`Unknown kind ${album.kind}`);
}

async function sortAssetsByRank(
  entries: AlbumEntry[],
  extra?: AlbumEntry,
  rank?: any
) {
  const e = extra ? { ...extra, rank: parseInt(rank || "0") } : undefined;
  const ranks = (
    await Promise.all(entries.map((entry) => readPicasaEntry(entry)))
  ).map((e) => e.rank);
  entries.forEach((entry, index) => {
    (entry as any).rank = parseInt(ranks[index] || "0");
  });
  if (e) entries.push(e);
  entries.sort((a: any, b: any) => {
    if (a.rank === b.rank) {
      if (a === e) return -1;
      if (b === e) return 1;
    }
    if (a.rank !== undefined && b.rank !== undefined) {
      return parseInt(a.rank!) - parseInt(b.rank!);
    }
    if (a.rank) return -1;
    if (b.rank) return 1;
    return 0;
  });
}

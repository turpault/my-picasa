import { readdir, stat } from "fs/promises";
import { join } from "path";
import { isPicture, isVideo } from "../../../shared/lib/utils";
import {
  Album,
  AlbumChangeEvent,
  AlbumEntry,
  PicasaFolderMeta,
} from "../../../shared/types/types";
import { imagesRoot } from "../../utils/constants";
import { broadcast } from "../../utils/socketList";
import { exifDataAndStats } from "./exif";
import { folder } from "./fs";
import { readPicasaIni, updatePicasaEntry } from "./picasaIni";

export async function setRank(entry: AlbumEntry, rank: Number): Promise<void> {
  const ini = await readPicasaIni(entry.album);
  const sortedAndFiltered = Object.entries(ini)
    .sort((a, b) => parseInt(a[1].rank || "0") - parseInt(b[1].rank || "0"))
    .filter((v) => v[0] != entry.name);
  let rankIndex = 0;
  for (const [name, i] of sortedAndFiltered) {
    if (rankIndex === rank) {
      rankIndex++;
    }
    updatePicasaEntry({ album: entry.album, name }, "rank", rankIndex);
    rankIndex++;
  }
  updatePicasaEntry(entry, "rank", rank);
}

async function assignRanks(
  filesInFolder: AlbumEntry[],
  ini: PicasaFolderMeta
): Promise<void> {
  let rank = 0;
  for (const entry of filesInFolder) {
    if (isPicture(entry) || isVideo(entry)) {
      if (!ini[entry.name] || ini[entry.name].rank === undefined) {
        updatePicasaEntry(entry, "rank", rank++);
      }
    }
  }
}

export async function sortAlbum(album: Album, order: string): Promise<void> {
  const i = await readPicasaIni(album);
  const entries = (await media(album, "")).entries;

  switch (order) {
    case "reverse":
      {
        entries.reverse().forEach((sortedEntry, index) => {
          updatePicasaEntry(sortedEntry, "rank", index);
        });
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
        sorted.forEach((sortedEntry, index) => {
          updatePicasaEntry(sortedEntry, "rank", index);
        });
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
          if(i[e1.name] && i[e2.name] && i[e1.name].dateTaken !== undefined && i[e2.name].dateTaken !== undefined )
            return new Date(i[e1.name].dateTaken!).getTime() -  new Date(i[e2.name].dateTaken!).getTime();
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
        sorted.forEach((sortedEntry, index) => {
          updatePicasaEntry(sortedEntry, "rank", index);
        });
      }
      break;
  }
  broadcast("albumEvent", [
    { type: "albumOrderUpdated", data: album },
  ] as AlbumChangeEvent[]);
}

export async function mediaCount(album: Album): Promise<{ count: number }> {
  return { count: (await assetsInAlbum(album)).entries.length };
}

export async function assetsInAlbum(
  album: Album
): Promise<{ entries: AlbumEntry[]; folders: string[] }> {
  const items = await readdir(join(imagesRoot, album.key));
  const entries: AlbumEntry[] = [];
  const folders: string[] = [];

  for (const i of items) {
    if (!i.startsWith(".")) {
      const entry = { album, name: i };
      if (isPicture(entry) || isVideo(entry)) {
        entries.push(entry);
      } else {
        const s = await stat(join(imagesRoot, album.key, i));
        if (s.isDirectory()) {
          folders.push(i);
        }
      }
    }
  }
  return { entries, folders };
}


export async function media(
  album: Album,
  filter: string
): Promise<{ entries: AlbumEntry[] }> {
  let [picasa, assets] = await Promise.all([
    readPicasaIni(album),
    assetsInAlbum(album),
  ]);

  let entries = assets.entries;
  if (filter) {
    entries = entries.filter(
      (asset) =>
        asset.album.name.toLowerCase().includes(filter.toLowerCase()) ||
        asset.name.toLowerCase().includes(filter.toLowerCase())
    );
  }
  for (const entry of entries) {
    if (isPicture(entry)) {
      if (!picasa[entry.name] || !picasa[entry.name].dateTaken) {
        const exif = await exifDataAndStats(entry);
        if (exif.tags.DateTimeOriginal)
          updatePicasaEntry(
            entry,
            "dateTaken",
            exif.tags.DateTimeOriginal.toISOString()
          );
        else if (exif.stats) {
          // Default to file creation time
          updatePicasaEntry(entry, "dateTaken", exif.stats.ctime.toISOString());
        }
      }
    }
  }
  await assignRanks(entries, picasa);
  await sortAssetsByRank(entries, picasa);
  return { entries };
}

async function sortAssetsByRank(
  entries: AlbumEntry[],
  picasa: PicasaFolderMeta
) {
  entries.sort((a, b) => {
    if (
      picasa[a.name] &&
      picasa[b.name] &&
      picasa[a.name].rank !== undefined &&
      picasa[b.name].rank !== undefined
    ) {
      return parseInt(picasa[a.name].rank!) - parseInt(picasa[b.name].rank!);
    }
    return 0;
  });
}

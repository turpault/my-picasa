import { mkdir, readFile, readdir, unlink } from "fs/promises";
import { extname, join } from "path";
import { lock } from "../../../shared/lib/mutex";
import { debounce, idFromAlbumEntry } from "../../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumKind,
  AlbumWithData,
  MosaicProject,
  ProjectType,
  SlideshowProject,
  ThumbnailSize,
  ThumbnailSizeVals,
  idFromKey,
  keyFromID,
} from "../../../shared/types/types";
import { generateMosaicFile, makeMosaic } from "../../projects/mosaic";
import { generateSlideshowFile } from "../../projects/slideshow";
import { projectFolder, ThumbnailSizes } from "../../utils/constants";
import {
  entryFilePath,
  fileExists,
  safeWriteFile,
} from "../../utils/serverUtils";
import { broadcast } from "../../utils/socketList";
import { addOrRefreshOrDeleteAlbum } from "../../workers";
import { queueNotification } from "./fileAndFolders";
import { thumbnailPathFromEntryAndSize } from "../rpcFunctions/thumbnail-cache";
import {
  makeThumbnailIfNeeded,
  readOrMakeThumbnail,
} from "../rpcFunctions/thumbnail";

export async function initProjects() {
  // Create project types
  await mkdir(projectFolder, { recursive: true });
}

export async function getProjectAlbums(): Promise<AlbumWithData[]> {
  return Promise.all(
    [ProjectType.MOSAIC, ProjectType.SLIDESHOW].map(async (f) => {
      return {
        name: f,
        key: keyFromID(f, AlbumKind.PROJECT),
        kind: AlbumKind.PROJECT,
        count: (await getProjects(f)).length,
      };
    }),
  );
}

export async function getProjectAlbumFromKey(
  projectKey: string,
): Promise<AlbumWithData> {
  const type = idFromKey(projectKey).id;
  return getProjectAlbumFromType(type as ProjectType);
}

export async function getProjectAlbumFromType(
  type: ProjectType,
): Promise<AlbumWithData> {
  const res = (await getProjectAlbums()).find((a) => a.name === type)!;
  if (!res) debugger;
  return res;
}

function projectIdToFileName(id: string, type: ProjectType) {
  return `${type}~${id}.json`;
}

function fileNameToProjectIdAndType(name: string) {
  const [type, id] = name.split("~");
  if (Object.values(ProjectType).includes(type as ProjectType)) {
    return { id: id.replace(/\.json$/, ""), type: type as ProjectType };
  }
  return { id: "", type: undefined as ProjectType | undefined };
}

export async function getProjects(
  projectType: ProjectType,
): Promise<AlbumEntry[]> {
  const projectIds = (await readdir(projectFolder))
    .filter((f) => extname(f).toLowerCase() === ".json")
    .filter((file) => fileNameToProjectIdAndType(file).type === projectType)
    .map((f) => fileNameToProjectIdAndType(f).id);

  return projectIds.map((id) => ({
    name: id,
    album: {
      name: projectType,
      key: keyFromID(projectType, AlbumKind.PROJECT),
      kind: AlbumKind.PROJECT,
    },
  }));
}

export async function getProject(
  entry: AlbumEntry,
): Promise<AlbumEntry | undefined> {
  const file = projectIdToFileName(entry.name, entry.album.name as ProjectType);
  const data = await readFile(join(projectFolder, file), { encoding: "utf-8" });
  const entryWithProjectData = JSON.parse(data) as AlbumEntry;
  return entryWithProjectData;
}

export async function createProject(type: ProjectType, name: string) {
  const project: AlbumEntry = {
    name,
    album: {
      name: type,
      key: keyFromID(type, AlbumKind.PROJECT),
      kind: AlbumKind.PROJECT,
    },
  };
  return project;
}

export async function eraseProject(entry: AlbumEntry): Promise<void> {
  const p = projectIdToFileName(entry.name, entry.album.name as ProjectType);
  await unlink(join(projectFolder, p));
  const album = await getProjectAlbumFromKey(entry.album.key);
  queueNotification({
    type: "albumInfoUpdated",
    album,
  });
}

export async function writeProject(
  project: AlbumEntry,
  changeType: string,
): Promise<void> {
  const p = projectIdToFileName(
    project.name,
    project.album.name as ProjectType,
  );
  const unlock = await lock(p);
  try {
    await safeWriteFile(
      join(projectFolder, p),
      JSON.stringify(project, null, 2),
    );
  } finally {
    unlock();
  }
  clearProjectThumbnails(project);
  const album = await getProjectAlbumFromKey(project.album.key);
  debounce(
    () => {
      broadcast("projectsUpdated", { project, changeType });

      queueNotification({
        type: "albumInfoUpdated",
        album,
      });
      broadcast("albumEntryAspectChanged", {
        ...project,
        metadata: {},
      });
    },
    1000,
    "writeProject/" + idFromAlbumEntry(project, ""),
    false,
  );
}
export async function buildProject(
  project: AlbumEntry,
  outAlbum: Album,
  outResolutionX: number,
  outResolutionY?: number,
): Promise<AlbumEntry> {
  const source = await getProject(project);
  if (!source) throw new Error("Project not found");
  const projectType = source.album.name as ProjectType;
  let newEntry: AlbumEntry;
  switch (projectType) {
    case ProjectType.MOSAIC:
      newEntry = await generateMosaicFile(source, outAlbum, outResolutionX);
      break;
    case ProjectType.SLIDESHOW:
      newEntry = await generateSlideshowFile(
        source,
        outAlbum,
        outResolutionX,
        outResolutionY,
      );
      break;
  }
  if (newEntry)
    await addOrRefreshOrDeleteAlbum(newEntry.album, undefined, true);
  return newEntry;
}

export async function makeProjectThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium",
): Promise<Buffer> {
  const projectData = await getProject(entry);
  if (!projectData) throw new Error("Project not found");
  const p = join(
    projectFolder,
    `${projectData.album.key}-${projectData.name}-${size}.jpg`,
  );
  const unlock = await lock(p);
  try {
    const iconFileExists = await fileExists(p);
    if (iconFileExists) {
      const iconData = await readFile(p);
      return iconData;
    }
    if (projectData.album.name === ProjectType.MOSAIC) {
      const proj = projectData as MosaicProject;
      const res = await makeMosaic(
        proj,
        ThumbnailSizes[size],
        "image/jpeg",
        "Buffer",
      );
      await safeWriteFile(p, res.data);
      return res.data as Buffer;
    } else if (projectData.album.name === ProjectType.SLIDESHOW) {
      // get first image from slideshow
      const proj = projectData as SlideshowProject;
      const first = proj.payload.pages.find((p) => p.type === "image");
      if (!first) throw new Error("No images in slideshow");
      const entry = first.entry!;
      const thumb = await readOrMakeThumbnail(entry, size);
      return thumb.data;
    }
  } catch (e) {
    console.error(`Error making project thumbnail for ${entry.name}: ${e}`);
  } finally {
    unlock();
  }
  return Buffer.from("");
}

async function clearProjectThumbnails(entry: AlbumEntry): Promise<void> {
  for (const size of ThumbnailSizeVals) {
    const p = join(
      projectFolder,
      `${entry.album.key}-${entry.name}-${size}.jpg`,
    );
    const unlock = await lock(p);
    try {
      const iconFileExists = await fileExists(p);
      if (iconFileExists) {
        await unlink(p);
      }
    } finally {
      unlock();
    }
  }
}

import { mkdirSync } from "fs";
import { readFile, readdir, unlink } from "fs/promises";
import { join, parse } from "path";
import {
  debounce,
  idFromAlbumEntry,
  lock,
  valuesOfEnum,
} from "../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumKind,
  AlbumWithData,
  MosaicProject,
  ProjectType,
  ThumbnailSize,
  ThumbnailSizeVals,
  idFromKey,
  keyFromID,
} from "../../shared/types/types";
import { ThumbnailSizes, imagesRoot } from "../utils/constants";
import { fileExists, safeWriteFile } from "../utils/serverUtils";
import { broadcast } from "../utils/socketList";
import { makeMosaic } from "./imageOperations/image-edits/mosaic";
import { queueNotification } from "./rpcFunctions/walker";

const projectFolder = join(imagesRoot, ".projects");
type ProjectFile = Album & { projects: { [id: string]: AlbumEntry } };

const allProjects: {
  [projectType: string]: ProjectFile;
} = {};

const filePathForProjectType = (projectType: ProjectType) =>
  join(projectFolder, `${projectType}.json`);

export async function initProjects() {
  // Create project types
  mkdirSync(projectFolder, { recursive: true });
  for (const projectType of valuesOfEnum(ProjectType)) {
    const filePath = filePathForProjectType(projectType);
    if (await fileExists(filePath)) continue;
    await safeWriteFile(
      filePath,
      JSON.stringify({
        name: projectType,
        key: keyFromID(projectType, AlbumKind.PROJECT),
        kind: AlbumKind.PROJECT,
        projects: {},
      })
    );
  }

  const files = await readdir(projectFolder);
  for (const file of files) {
    const { ext } = parse(file);
    if (ext === ".json") {
      const contents = JSON.parse(
        (await readFile(join(projectFolder, file))).toString("utf8")
      ) as ProjectFile;
      allProjects[contents.name] = contents;
    }
  }
}

export function getProjectAlbums(): AlbumWithData[] {
  return Object.keys(allProjects).map(getProjectAlbumFromType);
}

export function getProjectAlbum(projectKey: string): AlbumWithData {
  const type = idFromKey(projectKey).id;
  return getProjectAlbumFromType(type);
}

export function getProjectAlbumFromType(type: string): AlbumWithData {
  const projectAlbum = allProjects[type];
  return {
    name: projectAlbum.name,
    key: projectAlbum.key,
    kind: projectAlbum.kind,
    count: Object.values(projectAlbum.projects).length,
  };
}

export async function getProjects(projectKey: string): Promise<AlbumEntry[]> {
  const type = idFromKey(projectKey).id;
  return Object.values(allProjects[type].projects);
}

async function getProjectById(
  projectKey: string,
  id: string
): Promise<AlbumEntry | undefined> {
  const type = idFromKey(projectKey).id;
  return allProjects[type].projects[id];
}

export async function getProject(
  entry: AlbumEntry
): Promise<AlbumEntry | undefined> {
  return getProjectById(entry.album.key as ProjectType, entry.name);
}

export async function createProject(type: ProjectType, name: string) {
  const project: AlbumEntry = {
    name,
    album: {
      name: type,
      key: allProjects[type].key,
      kind: AlbumKind.PROJECT,
    },
  };
  return project;
}

async function commitChanges(projectType: ProjectType) {
  debounce(
    async () =>
      safeWriteFile(
        filePathForProjectType(projectType),
        JSON.stringify(allProjects[projectType])
      ),
    1000,
    "commitChanges" + projectType,
    false
  );
}

export async function deleteProject(entry: AlbumEntry): Promise<void> {
  const projectType = idFromKey(entry.album.key).id as ProjectType;
  const projects = allProjects[projectType].projects;
  if (projects[entry.name]) {
    delete projects[entry.name];
    await commitChanges(projectType);
  }
}

export async function writeProject(
  project: AlbumEntry,
  changeType: string
): Promise<void> {
  await deleteProject(project);
  const projectType = idFromKey(project.album.key).id as ProjectType;
  allProjects[projectType].projects[project.name] = project;
  commitChanges(projectType);
  clearProjectThumbnails(project);
  debounce(
    () => {
      broadcast("projectsUpdated", { project, changeType });

      queueNotification({
        type: "albumInfoUpdated",
        album: getProjectAlbum(project.album.key),
      });
      broadcast("albumEntryAspectChanged", {
        ...project,
        metadata: {},
      });
    },
    1000,
    "writeProject/" + idFromAlbumEntry(project, ""),
    false
  );
}

export async function makeProjectThumbnail(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium"
): Promise<Buffer> {
  const projectData = await getProject(entry);
  if (!projectData) throw new Error("Project not found");
  const p = join(
    projectFolder,
    `${projectData.album.key}-${projectData.name}-${size}.jpg`
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
        "Buffer"
      );
      await safeWriteFile(p, res.data);
      return res.data as Buffer;
    }
  } finally {
    unlock();
  }
  return Buffer.from("");
}

async function clearProjectThumbnails(entry: AlbumEntry): Promise<void> {
  for (const size of ThumbnailSizeVals) {
    const p = join(
      projectFolder,
      `${entry.album.key}-${entry.name}-${size}.jpg`
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

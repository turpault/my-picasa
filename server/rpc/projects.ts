import { mkdir, readFile, readdir, unlink } from "fs/promises";
import { extname, join } from "path";
import { lock } from "../../shared/lib/mutex";
import { debounce, idFromAlbumEntry } from "../../shared/lib/utils";
import { events } from "../../shared/server-events";
import {
  Album,
  AlbumEntry,
  AlbumWithData,
  MosaicProject,
  Project,
  ProjectType,
  SlideshowProject,
  ThumbnailSize,
  ThumbnailSizeVals,
  idFromKey,
  projectKeyFromType,
} from "../../shared/types/types";
import { generateMosaicFile, makeMosaic } from "../projects/mosaic";
import { generateSlideshowFile } from "../projects/slideshow";
import { ThumbnailSizes, projectFolder } from "../utils/constants";
import {
  fileExists,
  safeWriteFile
} from "../utils/serverUtils";
import {
  readOrMakeThumbnail
} from "./rpcFunctions/thumbnail";

export async function initProjects() {
  // Create project types
  await mkdir(projectFolder, { recursive: true });
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
): Promise<Project[]> {
  const projectIds = (await readdir(projectFolder))
    .filter((f) => extname(f).toLowerCase() === ".json")
    .filter((file) => fileNameToProjectIdAndType(file).type === projectType)
    .map((f) => fileNameToProjectIdAndType(f).id);

  return projectIds.map((id) => ({
    name: id,
    type: projectType,
  }));
}

export async function getProjectsCount(
  projectType: ProjectType,
): Promise<number> {
  const projects = await getProjects(projectType);
  return projects.length;
}

export async function getProject(
  project: Project,
): Promise<MosaicProject | SlideshowProject | undefined> {
  const file = projectIdToFileName(project.name, project.type);
  const data = await readFile(join(projectFolder, file), { encoding: "utf-8" });
  const parsed = JSON.parse(data) as AlbumEntry & { payload: any };

  if (project.type === ProjectType.MOSAIC) {
    return {
      name: project.name,
      type: ProjectType.MOSAIC,
      payload: parsed.payload,
    } as MosaicProject;
  } else if (project.type === ProjectType.SLIDESHOW) {
    return {
      name: project.name,
      type: ProjectType.SLIDESHOW,
      payload: parsed.payload,
    } as SlideshowProject;
  }

  return undefined;
}

export async function createProject(type: ProjectType, name: string): Promise<Project> {
  return {
    name,
    type,
  };
}

export async function eraseProject(project: Project): Promise<void> {
  const p = projectIdToFileName(project.name, project.type);
  await unlink(join(projectFolder, p));
  events.emit("projectsUpdated", { project, changeType: "deleted" });
}

export async function writeProject(
  project: MosaicProject | SlideshowProject,
  changeType: string,
): Promise<void> {
  const p = projectIdToFileName(project.name, project.type);
  const unlock = await lock(p);
  try {
    // Save as AlbumEntry format for backward compatibility with file format
    const entryFormat: AlbumEntry = {
      name: project.name,
      album: {
        name: project.type,
        key: projectKeyFromType(project.type),
      },
    };
    const dataToSave = {
      ...entryFormat,
      payload: project.payload,
    };
    await safeWriteFile(
      join(projectFolder, p),
      JSON.stringify(dataToSave, null, 2),
    );
  } finally {
    unlock();
  }
  // Clear thumbnails
  clearProjectThumbnails(project);

  debounce(
    () => {
      events.emit("projectsUpdated", { project, changeType });
    },
    1000,
    "writeProject/" + project.name,
    false,
  );
}
export async function buildProject(
  project: Project,
  outAlbum: Album,
  outResolutionX: number,
  outResolutionY?: number,
): Promise<AlbumEntry> {
  const source = await getProject(project);
  if (!source) throw new Error("Project not found");

  // Convert Project to AlbumEntry format for generate functions
  const entryFormat: AlbumEntry = {
    name: source.name,
    album: {
      name: source.type,
      key: projectKeyFromType(source.type),
    },
  };
  const sourceWithPayload = {
    ...entryFormat,
    payload: source.payload,
  } as AlbumEntry & { payload: any };

  let newEntry: AlbumEntry;
  switch (source.type) {
    case ProjectType.MOSAIC:
      newEntry = await generateMosaicFile(source as MosaicProject, outAlbum, outResolutionX);
      break;
    case ProjectType.SLIDESHOW:
      newEntry = await generateSlideshowFile(
        source as SlideshowProject,
        outAlbum,
        outResolutionX,
        outResolutionY,
      );
      break;
  }
  if (newEntry)
    events.emit("reindex", [newEntry.album]);
  return newEntry;
}

export async function makeProjectThumbnail(
  project: Project,
  size: ThumbnailSize = "th-medium",
): Promise<Buffer> {
  const projectData = await getProject(project);
  if (!projectData) throw new Error("Project not found");
  const p = join(
    projectFolder,
    `${projectKeyFromType(projectData.type)}-${projectData.name}-${size}.jpg`,
  );
  const unlock = await lock(p);
  try {
    const iconFileExists = await fileExists(p);
    if (iconFileExists) {
      const iconData = await readFile(p);
      return iconData;
    }
    if (projectData.type === ProjectType.MOSAIC) {
      const res = await makeMosaic(
        project,
        ThumbnailSizes[size],
        "image/jpeg",
        "Buffer",
      );
      await safeWriteFile(p, res.data);
      return res.data as Buffer;
    } else if (projectData.type === ProjectType.SLIDESHOW) {
      // get first image from slideshow
      const proj = projectData as SlideshowProject;
      const first = proj.payload.pages.find((p) => p.type === "image");
      if (!first) throw new Error("No images in slideshow");
      const entry = first.entry!;
      const thumb = await readOrMakeThumbnail(entry, size);
      return thumb.data;
    }
  } catch (e) {
    console.error(`Error making project thumbnail for ${project.name}: ${e}`);
  } finally {
    unlock();
  }
  return Buffer.from("");
}

async function clearProjectThumbnails(project: Project): Promise<void> {
  for (const size of ThumbnailSizeVals) {
    const p = join(
      projectFolder,
      `${projectKeyFromType(project.type)}-${project.name}-${size}.jpg`,
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

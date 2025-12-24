import { mkdir } from "fs/promises";
import { join } from "path";
import { calculateImagePositions } from "../../shared/lib/mosaic-positions";
import { namify } from "../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  ImageEncoding,
  ImageMimeType,
  MosaicProject,
  Orientation,
  Project,
} from "../../shared/types/types";
import {
  blitMultiple,
  buildContext,
  buildNewContext,
  destroyContext,
  encode,
  transform,
} from "../imageOperations/sharp-processor";
import { getProject } from "../rpc/projects";
import { imagesRoot } from "../utils/constants";
import { pathForAlbum, safeWriteFile } from "../utils/serverUtils";

export async function makeMosaic(
  project: Project,
  width: number | undefined,
  mime: ImageMimeType = "image/jpeg",
  format: ImageEncoding = "Buffer",
): Promise<{ width: number; height: number; data: Buffer | string }> {
  const projectData = await getProject(project);
  if (!projectData || projectData.type !== "Mosaic") {
    throw new Error("Invalid mosaic project");
  }
  const mosaicProject = projectData as MosaicProject;
  width = Math.floor(width || mosaicProject.payload.size);
  const height = Math.floor(
    width *
    Math.pow(
      mosaicProject.payload.format,
      mosaicProject.payload.orientation === Orientation.PAYSAGE ? -1 : 1,
    ),
  );
  const gutter =
    (mosaicProject.payload.gutter / 100) * (Orientation.PAYSAGE ? width : height);

  const targetContext = await buildNewContext(width, height);
  if (mosaicProject.payload.root) {
    const positions = calculateImagePositions(
      mosaicProject.payload.root,
      gutter,
      gutter / 2,
      gutter / 2,
      width - gutter,
      height - gutter,
    ).images;
    const blits: {
      context: string;
      position: {
        left: number;
        top: number;
      };
    }[] = [];
    for (const position of positions) {
      const sourceContext = await buildContext(position.entry);
      await transform(
        sourceContext,
        `cover=1,${Math.ceil(position.width)},${Math.ceil(position.height)}`,
      );
      blits.push({ context: sourceContext, position });
    }
    await blitMultiple(targetContext, blits);
    blits.forEach((blit) => destroyContext(blit.context));
  }

  const res = await encode(targetContext, mime, format);
  destroyContext(targetContext);
  return res;
}

export async function generateMosaicFile(
  project: MosaicProject,
  outAlbum: Album,
  width: number,
): Promise<AlbumEntry> {
  const res = await makeMosaic(project, width);

  const targetFolder = join(imagesRoot, pathForAlbum(outAlbum));
  await mkdir(targetFolder, { recursive: true });
  const targetFile =
    namify(
      `${project.name
      } ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
    ) + ".jpeg";
  await safeWriteFile(join(targetFolder, targetFile), res.data);

  return {
    name: targetFile,
    album: outAlbum,
  };
}

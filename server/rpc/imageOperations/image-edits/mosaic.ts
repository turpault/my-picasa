import { mkdir } from "fs/promises";
import { join } from "path";
import {
  Album,
  AlbumEntry,
  AlbumEntryWithMetadata,
  AlbumKind,
  Cell,
  ImageEncoding,
  ImageMimeType,
  MosaicProject,
  Orientation,
  keyFromID,
} from "../../../../shared/types/types";
import { ProjectOutputFolder, imagesRoot } from "../../../utils/constants";
import { safeWriteFile } from "../../../utils/serverUtils";
import { getProject } from "../../projects";
import {
  blit,
  blitMultiple,
  buildContext,
  buildNewContext,
  destroyContext,
  encode,
  transform,
} from "../sharp-processor";


export async function makeMosaic(
  entry: AlbumEntry,
  width: number,
  mime: ImageMimeType = "image/jpeg",
  format: ImageEncoding = "Buffer"
): Promise<{ width: number; height: number; data: Buffer | string }> {
  const project = (await getProject(entry)) as MosaicProject;
  width = Math.floor(width);
  const height = Math.floor(
    width *
    Math.pow(
      project.payload.format,
      project.payload.orientation === Orientation.PAYSAGE ? -1 : 1
    )
  );
  const gutter =
    (project.payload.gutter / 100) * (Orientation.PAYSAGE ? width : height);

  const targetContext = await buildNewContext(width, height);
  const positions = calculateImagePositions(
    project.payload.root!,
    gutter,
    gutter / 2,
    gutter / 2,
    width - gutter,
    height - gutter
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
      `cover=1,${Math.ceil(position.width)},${Math.ceil(position.height)}`
    );
    blits.push({ context: sourceContext, position });
  }
  await blitMultiple(targetContext, blits);
  blits.forEach((blit) => destroyContext(blit.context));

  const res = await encode(targetContext, mime, format);
  destroyContext(targetContext);
  return res;
}

export async function generateMosaicFile(
  entry: AlbumEntry,
  width: number = 1920
): Promise<AlbumEntry> {
  const res = await makeMosaic(entry, width);
  const targetFolder = join(imagesRoot, ProjectOutputFolder);
  await mkdir(targetFolder, { recursive: true });
  const targetFile = entry.name + ".jpg";
  await safeWriteFile(join(targetFolder, targetFile), res.data);

  const album: Album = {
    name: ProjectOutputFolder,
    key: keyFromID(ProjectOutputFolder, AlbumKind.FOLDER),
    kind: AlbumKind.FOLDER,
  };

  return {
    name: targetFile,
    album,
  };
}

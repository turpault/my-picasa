import { mkdir } from "fs/promises";
import { basename, join } from "path";
import { calculateImagePositions } from "../../shared/lib/mosaic-positions";
import { namify } from "../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumKind,
  ImageEncoding,
  ImageMimeType,
  MosaicProject,
  Orientation,
  keyFromID,
} from "../../shared/types/types";
import {
  blitMultiple,
  buildContext,
  buildNewContext,
  destroyContext,
  encode,
  transform,
} from "../imageOperations/sharp-processor";
import { getProject } from "../rpc/albumTypes/projects";
import { ProjectOutAlbumName, imagesRoot } from "../utils/constants";
import { safeWriteFile } from "../utils/serverUtils";

export async function makeMosaic(
  entry: AlbumEntry,
  width: number | undefined,
  mime: ImageMimeType = "image/jpeg",
  format: ImageEncoding = "Buffer",
): Promise<{ width: number; height: number; data: Buffer | string }> {
  const project = (await getProject(entry)) as MosaicProject;
  width = Math.floor(width || project.payload.size);
  const height = Math.floor(
    width *
      Math.pow(
        project.payload.format,
        project.payload.orientation === Orientation.PAYSAGE ? -1 : 1,
      ),
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

  const res = await encode(targetContext, mime, format);
  destroyContext(targetContext);
  return res;
}

export async function generateMosaicFile(
  entry: AlbumEntry,
  width: number,
): Promise<AlbumEntry> {
  const res = await makeMosaic(entry, width);
  const albumName = ProjectOutAlbumName();
  const targetFolder = join(imagesRoot, albumName);
  await mkdir(targetFolder, { recursive: true });
  const targetFile =
    namify(
      `${
        entry.name
      } ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
    ) + ".jpeg";
  await safeWriteFile(join(targetFolder, targetFile), res.data);

  const album: Album = {
    name: basename(albumName),
    key: keyFromID(albumName, AlbumKind.FOLDER),
    kind: AlbumKind.FOLDER,
  };

  return {
    name: targetFile,
    album,
  };
}

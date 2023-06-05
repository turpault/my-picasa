import { mkdir } from "fs/promises";
import { join } from "path";
import {
  AlbumEntry,
  AlbumEntryWithMetadata,
  Cell,
  ImageEncoding,
  ImageMimeType,
  MosaicProject,
  Orientation,
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

function calculateImagePositions(
  cell: Cell,
  gutter: number,
  left: number,
  top: number,
  width: number,
  height: number
): {
  left: number;
  top: number;
  width: number;
  height: number;
  entry: AlbumEntryWithMetadata;
}[] {
  if (cell.childs) {
    if (cell.split === "v") {
      const totalWeight = cell.childs.left.weight + cell.childs.right.weight;
      const leftCalc = calculateImagePositions(
        cell.childs.left,
        gutter,
        left,
        top,
        (cell.childs.left.weight / totalWeight) * width,
        height
      );
      const rightCalc = calculateImagePositions(
        cell.childs.right,
        gutter,
        left + (cell.childs.left.weight / totalWeight) * width,
        top,
        (cell.childs.right.weight / totalWeight) * width,
        height
      );
      return [...leftCalc, ...rightCalc];
    } else {
      const totalWeight = cell.childs.left.weight + cell.childs.right.weight;
      const topCalc = calculateImagePositions(
        cell.childs.left,
        gutter,
        left,
        top,
        width,
        (cell.childs.left.weight / totalWeight) * height
      );
      const bottomCalc = calculateImagePositions(
        cell.childs.right,
        gutter,
        left,
        top + (cell.childs.left.weight / totalWeight) * height,
        width,
        (cell.childs.right.weight / totalWeight) * height
      );
      return [...topCalc, ...bottomCalc];
    }
  } else {
    return [
      {
        left: left + gutter / 2,
        top: top + gutter / 2,
        width: width - gutter,
        height: height - gutter,
        entry: cell.image!,
      },
    ];
  }
}

export async function makeMosaic(
  entry: AlbumEntry,
  width: number,
  mime: ImageMimeType = "image/jpeg",
  format: ImageEncoding = "Buffer"
): Promise<{ width: number; height: number; data: Buffer | string }> {
  const project = (await getProject(entry)) as MosaicProject;
  const height =
    width *
    Math.pow(
      project.payload.format,
      project.payload.orientation === Orientation.PAYSAGE ? -1 : 1
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
  );
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
): Promise<void> {
  const res = await makeMosaic(entry, width);
  const targetFolder = join(imagesRoot, ProjectOutputFolder);
  await mkdir(targetFolder, { recursive: true });
  await safeWriteFile(join(targetFolder, entry.name + ".jpg"), res.data);
}

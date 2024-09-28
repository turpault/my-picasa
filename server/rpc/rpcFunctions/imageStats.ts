import { readFile } from "fs/promises";
import { join } from "path";
import { Stats } from "sharp";
import { lock } from "../../../shared/lib/mutex";
import { pathForEntryMetadata } from "../../../shared/lib/utils";
import {
  buildContextFromBuffer,
  destroyContext,
  statsOfContext,
} from "../../imageOperations/sharp-processor";
import { facesFolder } from "../../utils/constants";
import { fileExists, safeWriteFile } from "../../utils/serverUtils";
import { dec, inc } from "../../utils/stats";
import { decodeReferenceId } from "../albumTypes/referenceFiles";
import { getFaceImage } from "./thumbnail";

export function referenceStatsPath(referenceId: string) {
  const { entry: originalEntry, index } = decodeReferenceId(referenceId);
  const path = pathForEntryMetadata(originalEntry);
  return {
    path: join(facesFolder, "references", ...path.path),
    file: `${path.filename}-${index}.json`,
  };
}

export async function readOrReferenceImageStats(referenceId: string) {
  return makeReferenceImageStatsIfNeeded(referenceId);
}

async function makeReferenceImageStatsIfNeeded(
  referenceId: string,
): Promise<Stats> {
  const lockLabel = `makeReferenceImageStatsIfNeeded: ${referenceId}`;
  const release = await lock(lockLabel);
  inc("imageStats");
  try {
    const p = referenceStatsPath(referenceId);
    if (await fileExists(join(p.path, p.file))) {
      const s = await readFile(join(p.path, p.file));
      try {
        const stats = JSON.parse(s.toString());
        return stats as Stats;
      } catch (e) {
        console.error(`Error parsing stats for ${referenceId}`);
      }
    }
    const stats = await makeReferenceImageStats(referenceId);
    await safeWriteFile(join(p.path, p.file), JSON.stringify(stats));
    return stats;
  } finally {
    dec("imageStats");
    release();
  }
}

async function makeReferenceImageStats(referenceId: string): Promise<Stats> {
  const image = await getFaceImage(referenceId);
  if (image) {
    const context = await buildContextFromBuffer(image);
    const stats = await statsOfContext(context);
    await destroyContext(context);
    return stats;
  }
  return {} as Stats;
}

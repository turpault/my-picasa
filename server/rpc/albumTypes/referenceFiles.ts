import { mkdir, readFile } from "fs/promises";
import { join } from "path";
import {
  albumEntryFromId,
  pathForEntryMetadata
} from "../../../shared/lib/utils";
import { AlbumEntry, Reference } from "../../../shared/types/types";
import { facesFolder } from "../../utils/constants";
import {
  safeWriteFile
} from "../../utils/serverUtils";

export function referencePath(entry: AlbumEntry) {
  const path = pathForEntryMetadata(entry);
  return {
    path: join(facesFolder, "references", ...path.path),
    file: `${path.filename}.json`,
  };
}


export async function readReferencesFromReferenceId(
  id: string,
): Promise<Reference | undefined> {
  const { entry, index } = decodeReferenceId(id);
  const references = await readReferencesOfEntry(entry);
  return references?.[parseInt(index)];
}

export async function readReferencesOfEntry(
  entry: AlbumEntry,
): Promise<Reference[] | undefined> {
  try {
    const c = referencePath(entry);
    const path = join(c.path, c.file);
    const buf = await readFile(path, {
      encoding: "utf-8",
    });
    return JSON.parse(buf, (key, value) =>
      key === "descriptor"
        ? new Float32Array(
            value instanceof Array
              ? value
              : Object.entries(value)
                  .filter(([k]) => !isNaN(parseInt(k)))
                  .map(([k, v]) => v),
          )
        : value,
    ) as Reference[];
  } catch (e) {
    return undefined;
  }
}
export function decodeReferenceId(id: string) {
  const [mediaId, index] = id.split(":");
  const entry = albumEntryFromId(mediaId)!;
  if (!entry) throw new Error(`Invalid reference id ${id}`);
  return { entry, index };
}

export async function referencesFromId(id: string) {
  const { entry, index } = decodeReferenceId(id);
  const references = await readReferencesOfEntry(entry!);
  return references?.[parseInt(index)];
}

export async function writeReferencesOfEntry(entry: AlbumEntry, data: Reference[]) {
  const p = referencePath(entry);
  await mkdir(p.path, { recursive: true });
  await safeWriteFile(
    join(p.path, p.file),
    JSON.stringify(
      data,
      (key, value) => (key === "descriptor" ? Array.from(value) : value),
      2,
    ),
  );
}

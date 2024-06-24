import { mkdir } from "fs/promises";
import { join } from "path";
import {
  decodeFaces,
  decodeRect,
  encodeRect,
  hash,
} from "../../../shared/lib/utils";
import {
  AlbumEntry,
  AlbumKind,
  Contact,
  Face,
} from "../../../shared/types/types";
import { buildFaceImage } from "../../imageOperations/sharp-processor";
import { readAlbumIni, readContacts } from "../../rpc/rpcFunctions/picasa-ini";
import { facesFolder } from "../../utils/constants";
import { fileExists, safeWriteFile } from "../../utils/serverUtils";
import { Reference } from "./references";
import { FaceLandmarkData, IdentifiedContact } from "./types";

export function rectOfReference(feature: FaceLandmarkData) {
  const left = feature.alignedRect.box.left / feature.detection.imageWidth;
  const right = feature.alignedRect.box.right / feature.detection.imageWidth;
  const top = feature.alignedRect.box.top / feature.detection.imageHeight;
  const bottom = feature.alignedRect.box.bottom / feature.detection.imageHeight;

  const rect = encodeRect({ top, left, right, bottom });
  return rect;
}

export async function getPicasaIdentifiedReferences(
  entry: AlbumEntry,
): Promise<IdentifiedContact[]> {
  const picasaIni = await readAlbumIni(entry.album);

  const contacts = readContacts(picasaIni);
  const iniFaces = picasaIni[entry.name].faces;
  if (iniFaces) {
    const facesInEntry = decodeFaces(iniFaces);
    return facesInEntry
      .filter((face) => contacts[face.hash])
      .map((face) => ({ face, contact: contacts[face.hash] }));
  }
  return [];
}

export function isIdentifiedContactInReferences(
  identifiedContact: IdentifiedContact,
  references: Reference[],
) {
  return references.some((reference) =>
    findFaceInRect(reference.data, [identifiedContact]),
  );
}

export function findFaceInRect(
  reference: FaceLandmarkData,
  identifiedContacts: IdentifiedContact[],
) {
  const { width, height } = reference.detection.imageDims;
  const proximity = (a: IdentifiedContact, b: FaceLandmarkData) => {
    const rect = decodeRect(a.face.rect);
    // Maps if each center is within the other rect
    const centerRect = {
      x: (rect.right + rect.left) / 2,
      y: (rect.top + rect.bottom) / 2,
    };
    const centerRef = {
      x: (b.alignedRect.box.x + b.alignedRect.box.width / 2) / width,
      y: (b.alignedRect.box.y + b.alignedRect.box.height / 2) / height,
    };
    if (
      centerRef.x < rect.left ||
      centerRef.x > rect.right ||
      centerRef.y < rect.top ||
      centerRef.y > rect.bottom
    )
      return false;
    if (
      centerRect.x < b.detection.box.x / width ||
      centerRect.x > b.detection.box.right / width ||
      centerRect.y < b.detection.box.y / height ||
      centerRect.y > b.detection.box.bottom / height
    )
      return false;
    return true;
  };

  for (const identifiedContact of identifiedContacts) {
    if (proximity(identifiedContact, reference)) {
      return identifiedContact;
    }
  }
  return null;
}

export function isUsefulReference(
  reference: Reference,
  usage: "master" | "child",
) {
  if (reference.data.detection.score < (usage === "master" ? 0.9 : 0.7)) {
    return false;
  }
  const minDim = usage === "master" ? 200 : 50;
  if (
    reference.data.alignedRect.box.width < minDim ||
    reference.data.alignedRect.box.height < minDim
  ) {
    return false;
  }

  if (reference.data.angle.roll && Math.abs(reference.data.angle.roll) > 60) {
    return false;
  }
  if (reference.data.angle.yaw && Math.abs(reference.data.angle.yaw) > 60) {
    return false;
  }
  if (reference.data.angle.pitch && Math.abs(reference.data.angle.pitch) > 30) {
    return false;
  }
  return true;
}
export async function createCandidateThumbnail(
  group: string,
  strategy: string,
  reference: Reference,
  originalEntry: AlbumEntry,
  root: boolean,
) {
  const folder = join(facesFolder, `strategy-${strategy}`, group);
  await mkdir(folder, { recursive: true });
  const filePath = join(
    folder,
    (root ? "---" : "") +
      hash(reference.id) +
      "-" +
      reference.data.detection.className +
      "-" +
      reference.data.detection.classScore +
      "-" +
      reference.data.detection.score +
      ".jpg",
  );
  if (!(await fileExists(filePath))) {
    try {
      const image = await buildFaceImage(
        {
          album: { key: group, kind: AlbumKind.FACE, name: group },
          name: reference.id,
        },
        {
          label: reference.id,
          originalEntry,
          hash: group,
          rect: rectOfReference(reference.data),
        },
      );
      await safeWriteFile(filePath, image.data);
    } catch (e) {
      // ignore
    }
  }
}

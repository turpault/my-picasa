import { mkdir } from "fs/promises";
import { join } from "path";
import {
  getContactsFromAlbum,
  getPicasaEntry,
} from "../../../../rpc/rpcFunctions/picasa-ini";
import { getFaceImage } from "../../../../rpc/rpcFunctions/thumbnail";
import { facesFolder } from "../../../../utils/constants";
import { fileExists, safeWriteFile } from "../../../../utils/serverUtils";
import {
  decodeFaces,
  decodeRect,
  encodeRect,
  hash,
} from "../../../shared/lib/utils";
import {
  AlbumEntry,
  Reference,
  ReferenceData,
} from "../../../shared/types/types";
import { IdentifiedContact } from "./types";

export function rectOfReference(feature: ReferenceData) {
  const left = Math.max(
    0,
    feature.alignedRect.box.left / feature.detection.imageWidth,
  );
  const right = Math.min(
    1,
    feature.alignedRect.box.right / feature.detection.imageWidth,
  );
  const top = Math.max(
    0,
    feature.alignedRect.box.top / feature.detection.imageHeight,
  );
  const bottom = Math.min(
    1,
    feature.alignedRect.box.bottom / feature.detection.imageHeight,
  );
  if (
    feature.alignedRect.box.width <= 0 ||
    feature.alignedRect.box.height <= 0
  ) {
    debugger;
    throw new Error("Invalid reference rect");
  }

  const rect = encodeRect({ top, left, right, bottom });
  if (rect.length > 16) debugger;
  return rect;
}

export async function getPicasaIdentifiedReferences(
  entry: AlbumEntry,
): Promise<IdentifiedContact[]> {
  const contacts = await getContactsFromAlbum(entry.album);
  const entryMeta = await getPicasaEntry(entry);
  const iniFaces = entryMeta.faces;
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
  reference: ReferenceData,
  identifiedContacts: IdentifiedContact[],
) {
  const { width, height } = reference.detection.imageDims;
  const proximity = (a: IdentifiedContact, b: ReferenceData) => {
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

  const orientationAngle = usage === "master" ? 80 : 60;
  if (
    reference.data.angle.roll &&
    Math.abs(reference.data.angle.roll) > orientationAngle
  ) {
    return false;
  }
  if (
    reference.data.angle.yaw &&
    Math.abs(reference.data.angle.yaw) > orientationAngle
  ) {
    return false;
  }
  if (
    reference.data.angle.pitch &&
    Math.abs(reference.data.angle.pitch) > orientationAngle / 2
  ) {
    return false;
  }
  return true;
}

export async function createCandidateThumbnail(
  group: string,
  strategy: string,
  reference: Reference,
  root: boolean,
  explanation: string = "",
  folder: string,
) {
  await mkdir(folder, { recursive: true });
  const filePath = join(
    folder,
    ((root ? "---" : "") + hash(reference.id) + "-" + explanation).substring(
      0,
      240,
    ) + ".jpg",
  );
  if (!(await fileExists(filePath))) {
    try {
      const image = await getFaceImage(reference.id);
      await safeWriteFile(filePath, image);
    } catch (e) {
      // ignore
    }
  }
}

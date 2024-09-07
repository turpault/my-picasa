import * as faceapi from "@vladmandic/face-api";
import Debug from "debug";

import { readFile } from "fs/promises";
import { join } from "path";
import { hash, uuid } from "../../../shared/lib/utils";
import { AlbumEntry, Contact, Reference } from "../../../shared/types/types";
import { media } from "../../../server/rpc/rpcFunctions/albumUtils";
import { facesFolder } from "../../../server/utils/constants";
import { fileExists, safeWriteFile } from "../../../server/utils/serverUtils";
import { getFolderAlbums } from "../../../server/walker";
import { getRedisClient } from "../poi/redis-client";
import {
  createCandidateThumbnail,
  findFaceInRect,
  getPicasaIdentifiedReferences,
  isUsefulReference,
  rectOfReference,
} from "./face-utils";
import { addCandidateFaceRectToEntry } from "./picasa-faces";
import {
  decodeReferenceId,
  readReferencesFromReferenceId,
  readReferencesOfEntry,
} from "../../../server/rpc/albumTypes/referenceFiles";
import { FaceLandmarkData } from "./types";
const debug = Debug("app:face-db");

type Cluster = {
  id: string;
  reference: Reference;
  contact?: Contact;
  faceCount: number;
};
const clusters: Cluster[] = [];

export async function runClusterStrategy() {
  await loadClusters();
  await clearClusterReferences();
  // One run to populate the cluster references
  await groupReferencesIntoClusters(true);
  // One run to populate the groups in the cluster
  await groupReferencesIntoClusters();
  await addContactToClusters();
  await createContactsFromUnmatchedClusters();
  await saveClusters();
}

async function createContactsFromUnmatchedClusters() {
  const unmatchedClusters = clusters.filter((c) => !c.contact);
  for (const cluster of unmatchedClusters) {
    const contact: Contact = {
      key: uuid(),
      originalName: `Cluster ${cluster.id}`,
      email: "",
      something: "",
    };

    const references = await getClusterReferences(cluster);
    for (const reference of references) {
      const { entry } = decodeReferenceId(reference.id);
      addCandidateFaceRectToEntry(
        entry,
        rectOfReference(reference.data),
        contact,
        reference.id,
        "cluster",
      );
    }
  }
}
async function clearClusterReferences() {
  const client = await getRedisClient();
  await client.del(`clusters`);
  const keys = await client.keys(`clusters~*`);
  await Promise.all(keys.map((k) => client.del(k)));
}

async function addReferenceToCluster(
  cluster: Cluster,
  reference: Reference,
  originalEntry: AlbumEntry,
  root: boolean,
) {
  const client = await getRedisClient();
  await client.hset(`clusters`, reference.id, cluster.id);
  await client.hset(`clusters~${cluster.id}`, reference.id, root ? "1" : "0");

  await createCandidateThumbnail(
    cluster.id,
    "cluster",
    reference,
    originalEntry,
    root,
  );
}

async function getClusterReferences(cluster: Cluster): Promise<Reference[]> {
  const client = await getRedisClient();
  const referenceIds = await client.hkeys(`clusters~${cluster.id}`);
  return (
    await Promise.all(
      referenceIds.map(async (referenceId) => {
        const { entry, index } = decodeReferenceId(referenceId);
        const references = await readReferencesOfEntry(entry);
        return references?.[parseInt(index)]!;
      }),
    )
  ).filter((r) => r);
}
const clusterFile = "clusters.json";
type SerializedCluster = Omit<Cluster, "reference"> & { referenceId: string };
async function loadClusters() {
  const clusterFilePath = join(facesFolder, clusterFile);
  if (await fileExists(clusterFilePath)) {
    const clusterData = await readFile(clusterFilePath, "utf-8");
    const clusterDataJson = JSON.parse(clusterData);
    const clustersWithReferences = await Promise.all(
      clusterDataJson.map(async (cluster: SerializedCluster) => {
        const reference = await readReferencesFromReferenceId(
          cluster.referenceId,
        );
        if (!reference) {
          debugger;
          return null;
        }
        return {
          ...cluster,
          reference,
        };
      }),
    );

    clusters.push(...clustersWithReferences.filter((c) => c));
  }
}
async function saveClusters() {
  const clusterFilePath = join(facesFolder, clusterFile);
  const serializedClusters: SerializedCluster[] = clusters.map((c) => {
    const r = {
      ...c,
      referenceId: c.reference.id,
    } as SerializedCluster;
    delete (r as any).reference;
    return r;
  });
  await safeWriteFile(
    clusterFilePath,
    JSON.stringify(serializedClusters, null, 2),
  );
}

async function groupReferencesIntoClusters(clusterReferencesOnly = false) {
  const CLUSTER_MAX_DISTANCE = 0.5;
  const albums = await getFolderAlbums();
  for (const album of albums) {
    const medias = await media(album);
    debug(
      `populateClusters: Processing album ${album.name} - found ${clusters.length} clusters`,
    );
    for (const media of medias.entries) {
      const references = await readReferencesOfEntry(media);
      if (!references) continue;
      for (const reference of references) {
        if (!isUsefulReference(reference, "child")) {
          continue;
        }

        const foundCluster = clusters
          .map((c) => ({
            cluster: c,
            reference: c.reference,
            distance: faceapi.euclideanDistance(
              c.reference.data.descriptor,
              reference.data.descriptor,
            ),
          }))
          .filter((c) => c.distance < CLUSTER_MAX_DISTANCE)
          .sort((a, b) => a.distance - b.distance)[0];
        if (foundCluster) {
          if (!clusterReferencesOnly) {
            foundCluster.cluster.faceCount++;
            addReferenceToCluster(
              foundCluster.cluster,
              reference,
              media,
              false,
            );
          }
        } else {
          if (!isUsefulReference(reference, "master")) {
            continue;
          }

          if (!clusterReferencesOnly) {
            // we should not find new clusters at this point
            debugger;
          }
          const cluster = { id: hash(reference.id), reference, faceCount: 1 };
          clusters.push(cluster);
          addReferenceToCluster(cluster, reference, media, true);
        }
      }
    }
  }
}

async function addContactToClusters() {
  for (const cluster of clusters) {
    const { entry } = decodeReferenceId(cluster.reference.id);
    const identifiedContacts = await getPicasaIdentifiedReferences(entry);
    const identifiedContact = findFaceInRect(
      cluster.reference.data,
      identifiedContacts,
    );
    if (identifiedContact) {
      cluster.contact = identifiedContact.contact;
      const references = await getClusterReferences(cluster);
      for (const reference of references) {
        const { entry } = decodeReferenceId(reference.id);
        addCandidateFaceRectToEntry(
          entry,
          rectOfReference(reference.data),
          identifiedContact.contact,
          reference.id,
          "cluster",
        );
      }
    }
  }
}

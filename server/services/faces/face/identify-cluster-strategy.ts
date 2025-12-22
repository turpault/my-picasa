import * as faceapi from "@vladmandic/face-api";
import Debug from "debug";

import { appendFile, mkdir, readdir, readFile, rm, unlink } from "fs/promises";
import { join } from "path";
import {
  decodeReferenceId,
  readReferenceFromReferenceId,
  readReferencesOfEntry,
} from "../../../rpc/albumTypes/referenceFiles";
import { media } from "../../../rpc/rpcFunctions/albumUtils";
import { readOrReferenceImageStats } from "../../../rpc/rpcFunctions/imageStats";
import { facesFolder } from "../../../utils/constants";
import { fileExists, safeWriteFile } from "../../../utils/serverUtils";
import { getFolderAlbums } from "../../walker/worker";
import { lock } from "../../../../shared/lib/mutex";
import { filenameify, hash, uuid } from "../../../../shared/lib/utils";
import { AlbumEntry, Contact, Reference } from "../../../../shared/types/types";
import {
  createCandidateThumbnail,
  findFaceInRect,
  getPicasaIdentifiedReferences,
  isUsefulReference,
  rectOfReference,
} from "./face-utils";
import { addCandidateFaceRectToEntry } from "./picasa-faces";
const debug = Debug("app:face-db");

type Cluster = {
  id: string;
  reference: Reference;
  entry: AlbumEntry;
  contact?: Contact;
  faceCount: number;
  creationIndex: number;
};
const clusters: Cluster[] = [];

const rootClusterStrategyFolder = join(facesFolder, "strategy-cluster");
const rootClusterStrategyThumbnailsFolder = join(
  rootClusterStrategyFolder,
  "thumbnails",
);
const rootClusterStrategyClustersFolder = join(
  rootClusterStrategyFolder,
  "clusters",
);
const rootClusterStrategyClusterReferencesFolder = join(
  rootClusterStrategyFolder,
  "cluster-references",
);

export async function runClusterStrategy() {
  await Promise.all([
    mkdir(rootClusterStrategyFolder, { recursive: true }),
    mkdir(rootClusterStrategyThumbnailsFolder, { recursive: true }),
    mkdir(rootClusterStrategyClustersFolder, { recursive: true }),
    mkdir(rootClusterStrategyClusterReferencesFolder, { recursive: true }),
  ]);
  await loadClusters();
  // One run to populate the cluster references
  await groupReferencesIntoClusters(true);
  // One run to populate the groups in the cluster
  await groupReferencesIntoClusters();
  //await addContactToClusters();
  await createContactsFromUnmatchedClusters();
}

export async function assignClusterToContact(
  clusterId: string,
  contact: Contact,
) {
  const cluster = clusters.find((c) => c.id === clusterId);
  if (!cluster) return;
  const references = await getClusterReferences(cluster);
  for (const reference of references) {
    const { entry } = decodeReferenceId(reference.id);
    addCandidateFaceRectToEntry(
      entry,
      rectOfReference(reference.data),
      cluster.id,
      contact,
      reference.id,
      "cluster",
    );
  }
}

export async function getClusters() {
  const clusters: Cluster[] = [];
  const clusterFolderPath = join(rootClusterStrategyClustersFolder);
  const contents = await readdir(clusterFolderPath);
  for (const clusterFile of contents) {
    if (clusterFile.endsWith(".json")) {
      const clusterFilePath = join(clusterFolderPath, clusterFile);
      const clusterData = await readFile(clusterFilePath, "utf-8");
      const clusterDataJson = JSON.parse(clusterData) as SerializedCluster;
      const reference = await readReferenceFromReferenceId(
        clusterDataJson.referenceId,
      );
      if (reference)
        clusters.push({
          ...clusterDataJson,
          reference,
        });
    }
  }
  return clusters;
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
    cluster.contact = contact;
    saveClusterFile(cluster);
  }
  for (const cluster of clusters) {
    const references = await getClusterReferences(cluster);
    for (const reference of references) {
      const { entry } = decodeReferenceId(reference.id);
      addCandidateFaceRectToEntry(
        entry,
        rectOfReference(reference.data),
        cluster.id,
        cluster.contact!,
        reference.id,
        "cluster",
      );
    }
  }
}

async function appendReferenceToCluster(
  cluster: Cluster,
  reference: Reference,
) {
  const file = join(
    rootClusterStrategyClusterReferencesFolder,
    `referencesOf-${cluster.id}`,
  );
  await appendFile(file, reference.id + "\n");
  const file2 = join(
    rootClusterStrategyClusterReferencesFolder,
    `clusterOf-${filenameify(reference.id)}`,
  );
  await appendFile(file2, cluster.id);
}

async function isReferenceInCluster(referenceId: string) {
  const file2 = join(
    rootClusterStrategyClusterReferencesFolder,
    `clusterOf-${filenameify(referenceId)}`,
  );
  return fileExists(file2);
}

async function addReferenceToCluster(
  cluster: Cluster,
  reference: Reference,
  root: boolean,
) {
  await appendReferenceToCluster(cluster, reference);

  const explanation =
    `${filenameify(reference.id)} - Score=${reference.data.detection.score} - ` +
    `(main is ${filenameify(cluster.reference.id)}) - ` +
    `distance was ${faceapi.euclideanDistance(
      cluster.reference.data.descriptor,
      reference.data.descriptor,
    )}`;
  await createCandidateThumbnail(
    cluster.id,
    "cluster",
    reference,
    root,
    explanation,
    join(rootClusterStrategyThumbnailsFolder, cluster.id),
  );
}

async function removeCluster(cluster: Cluster) {
  debug(`Removing cluster ${cluster.id}`);
  const file = join(
    rootClusterStrategyClusterReferencesFolder,
    `referencesOf-${cluster.id}`,
  );
  if (await fileExists(file)) await unlink(file);

  const folder = join(rootClusterStrategyThumbnailsFolder, cluster.id);
  await rm(folder, { recursive: true, force: true });
  await deleteClusterFile(cluster);
}

async function getClusterReferences(cluster: Cluster): Promise<Reference[]> {
  const file = join(
    rootClusterStrategyClusterReferencesFolder,
    `referencesOf-${cluster.id}`,
  );
  const buf = await readFile(file, {
    encoding: "utf-8",
  });
  const ids = buf.split("\n").filter((id) => id);
  const promises = ids.map((id) => readReferenceFromReferenceId(id));
  const references = await Promise.all(promises);
  return references.filter((v) => v !== undefined) as Reference[];
}

const clusterFolder = "clusters";
type SerializedCluster = Omit<Cluster, "reference"> & { referenceId: string };
async function loadClusters() {
  clusters.push(...(await getClusters()));
}

async function saveClusterFile(cluster: Cluster) {
  const l = await lock(`saveClusterFile : ${cluster.id}`);
  try {
    const clusterFilePath = join(rootClusterStrategyClustersFolder, cluster.id);
    const r = {
      ...cluster,
      referenceId: cluster.reference.id,
    } as SerializedCluster;
    delete (r as any).reference;

    await safeWriteFile(clusterFilePath, JSON.stringify(r, null, 2));
  } finally {
    l();
  }
}

async function deleteClusterFile(cluster: Cluster) {
  const l = await lock(`saveClusterFile : ${cluster.id}`);
  try {
    const clusterFilePath = join(rootClusterStrategyClustersFolder, cluster.id);
    await unlink(clusterFilePath);
  } finally {
    l();
  }
}

async function pruneOrphanClusters() {
  // Remove clusters with only themselves as references
  // erase the MAX_CLUSTER_COUNT smallest clusters
  const MAX_CLUSTER_COUNT = 500;
  if (clusters.length < MAX_CLUSTER_COUNT) return;
  // Sort clusters by face count, decreasing
  clusters.sort(
    (a, b) =>
      ((a.faceCount - b.faceCount) << 16) + (a.creationIndex - b.creationIndex),
  );

  while (clusters.length > MAX_CLUSTER_COUNT) {
    if (clusters[0].faceCount > 1) break;
    const cluster = clusters.shift()!;
    await removeCluster(cluster);
  }
}
async function groupReferencesIntoClusters(clusterReferencesOnly = false) {
  const CLUSTER_MAX_DISTANCE = 0.5;
  const albums = await getFolderAlbums();
  const promises: Promise<void>[] = [];
  for (const album of albums) {
    const medias = await media(album);
    debug(
      `populateClusters: Processing album ${album.name} - found ${clusters.length} clusters`,
    );
    if (clusterReferencesOnly) await pruneOrphanClusters();
    for (const media of medias.entries) {
      const references = await readReferencesOfEntry(media);
      if (!references) continue;
      for (const reference of references) {
        if (!isUsefulReference(reference, "child")) {
          continue;
        }
        if (clusterReferencesOnly && !isUsefulReference(reference, "master")) {
          continue;
        }
        if (await isFaceBlurry(reference.id)) {
          continue;
        }
        if (await isReferenceInCluster(reference.id)) {
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
          foundCluster.cluster.faceCount++;
          if (!clusterReferencesOnly) {
            const cluster = foundCluster.cluster;
            const r = reference;
            promises.push(addReferenceToCluster(cluster, r, false));
          }
        } else if (clusterReferencesOnly) {
          const cluster: Cluster = {
            id: hash(reference.id),
            reference,
            faceCount: 1,
            entry: media,
            creationIndex: clusters.length,
          };
          await saveClusterFile(cluster);
          clusters.push(cluster);
          const r = reference;
          promises.push(addReferenceToCluster(cluster, r, true));
        }
      }
    }
  }
  await Promise.allSettled(promises);
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
      saveClusterFile(cluster);
      const references = await getClusterReferences(cluster);
      for (const reference of references) {
        const { entry } = decodeReferenceId(reference.id);
        addCandidateFaceRectToEntry(
          entry,
          rectOfReference(reference.data),
          cluster.id,
          identifiedContact.contact,
          reference.id,
          "cluster",
        );
      }
    }
  }
}

const MIN_SHARPNESS = 2;
async function isFaceBlurry(referenceId: string) {
  const stats = await readOrReferenceImageStats(referenceId);
  return stats.sharpness < MIN_SHARPNESS;
}

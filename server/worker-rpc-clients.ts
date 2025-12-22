import { isMainThread } from "worker_threads";
import { WorkerAdaptor } from "../../shared/socket/worker-adaptor";
import { getWorker } from "./worker-manager";
import { RPCAdaptorInterface } from "../../shared/rpc-transport/rpc-adaptor-interface";

// Cache of worker RPC adaptors
const workerAdaptors: Map<string, WorkerAdaptor> = new Map();

/**
 * Get or create an RPC adaptor for a worker
 */
export function getWorkerRPCAdaptor(serviceName: string): RPCAdaptorInterface | null {
  if (!isMainThread) {
    throw new Error("getWorkerRPCAdaptor can only be called from main thread");
  }

  if (workerAdaptors.has(serviceName)) {
    return workerAdaptors.get(serviceName)!;
  }

  const worker = getWorker(serviceName);
  if (!worker) {
    console.warn(`Worker ${serviceName} not found`);
    return null;
  }

  const adaptor = new WorkerAdaptor(worker);
  workerAdaptors.set(serviceName, adaptor);
  return adaptor;
}

/**
 * Worker RPC client wrapper for IndexingWorker
 */
export class IndexingWorkerClient {
  private adaptor: RPCAdaptorInterface;

  constructor() {
    const adaptor = getWorkerRPCAdaptor("indexing");
    if (!adaptor) {
      throw new Error("Indexing worker not available");
    }
    this.adaptor = adaptor;
  }

  async queryFoldersByFilters(filters: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.adaptor.emit("IndexingWorker:queryFoldersByFilters", { args: { filters } }, (err, response) => {
        if (err) reject(new Error(err));
        else resolve(response);
      });
    });
  }

  async searchPicturesByFilters(filters: any, limit?: number, albumId?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.adaptor.emit("IndexingWorker:searchPicturesByFilters", { args: { filters, limit, albumId } }, (err, response) => {
        if (err) reject(new Error(err));
        else resolve(response);
      });
    });
  }

  async queryAlbumEntries(albumId: string, matchingStrings: string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      this.adaptor.emit("IndexingWorker:queryAlbumEntries", { args: { albumId, matchingStrings } }, (err, response) => {
        if (err) reject(new Error(err));
        else resolve(response);
      });
    });
  }

  async getAlbumEntries(album: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.adaptor.emit("IndexingWorker:getAlbumEntries", { args: { album } }, (err, response) => {
        if (err) reject(new Error(err));
        else resolve(response);
      });
    });
  }

  async getAllFolders(): Promise<any> {
    return new Promise((resolve, reject) => {
      this.adaptor.emit("IndexingWorker:getAllFolders", { args: {} }, (err, response) => {
        if (err) reject(new Error(err));
        else resolve(response);
      });
    });
  }

  async reindex(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.adaptor.emit("IndexingWorker:reindex", { args: {} }, (err, response) => {
        if (err) reject(new Error(err));
        else resolve(response);
      });
    });
  }
}

// Singleton instance
let indexingWorkerClient: IndexingWorkerClient | null = null;

export function getIndexingWorkerClient(): IndexingWorkerClient {
  if (!indexingWorkerClient) {
    indexingWorkerClient = new IndexingWorkerClient();
  }
  return indexingWorkerClient;
}


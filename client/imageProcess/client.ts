import {
  encodeOperations,
  fixedEncodeURIComponent,
  idFromAlbumEntry,
  PicasaFilter,
} from "../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumEntryPicasa,
  AlbumEntryWithMetadata,
  ThumbnailSize,
} from "../../shared/types/types";
import { getService, getServicePort } from "../rpc/connect";

export async function buildContext(entry: AlbumEntry): Promise<string> {
  const c = await getService();
  const context = await c.buildContext(entry);
  return context;
}

export async function execute(
  context: string,
  operations: any[][]
): Promise<string> {
  const c = await getService();
  await c.execute(context, operations as any[][]);
  return context;
}

export async function resizeContext(context: string, size: number) {
  await execute(context, [
    ["resize", size, size, { fit: "cover", kernel: "nearest" }],
  ]);
  return context;
}

export async function resizeContextInside(context: string, size: number) {
  await execute(context, [
    ["resize", size, size, { fit: "inside", kernel: "nearest" }],
  ]);
  return context;
}

export async function commit(context: string): Promise<string> {
  const c = await getService();
  await c.commit(context);
  return context;
}

export async function setOptions(
  context: string,
  options: any
): Promise<string> {
  const c = await getService();
  await c.setOptions(context, options);
  return context;
}

export async function transform(
  context: string,
  transformation: PicasaFilter[]
): Promise<string> {
  const c = await getService();
  await c.transform(context, encodeOperations(transformation));
  return context;
}

export async function cloneContext(
  context: string,
  hint: string
): Promise<string> {
  const c = await getService();
  const newContext = await c.cloneContext(context, hint);
  return newContext;
}

export async function destroyContext(context: string): Promise<void> {
  const c = await getService();
  await c.destroyContext(context);
}

export async function encode(
  context: string,
  mime: string,
  format: string
): Promise<{ width: number; height: number; data: string | Buffer }> {
  const c = await getService();
  return await c.encode(context, mime, format);
}

export function encodeToURL(context: string, mime: string): string {
  return `/encode/${context}/${fixedEncodeURIComponent(
    mime
  )}`;
}

const busts: { [key: string]: number } = {};
export async function initCacheBuster() {
  const s = await getService();
  s.on("albumEntryAspectChanged", async (e: { payload: AlbumEntryPicasa }) => {
    const key = idFromAlbumEntry(e.payload, "");
    busts[key] = (busts[key] || 0) + 1;
  });
}

function cacheBustId(e: AlbumEntry) {
  const key = idFromAlbumEntry(e, "");
  return busts[key] || 0;
}

export function thumbnailUrl(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium",
  animated: boolean = true
): string {
  if (!entry) {
    return "";
  }
  return (
    `/thumbnail/${fixedEncodeURIComponent(
      entry.album.key
    )}/${fixedEncodeURIComponent(entry.name)}/${fixedEncodeURIComponent(
      size
    )}` + `?cacheBust=${cacheBustId(entry)}${animated ? "&animated" : ""}`
  );
}

export function albumThumbnailUrl(
  album: Album,
  size: ThumbnailSize = "th-medium",
  animated: boolean = true
): string {
  if (!album) {
    return "";
  }
  return (
    `/thumbnail/${fixedEncodeURIComponent(
      album.key
    )}/${fixedEncodeURIComponent(size)}` + `${animated ? "&animated" : ""}`
  );
}

export function assetUrl(entry: AlbumEntry): string {
  if (!entry) {
    return "";
  }
  return `http://127.0.0.1:${getServicePort()}/asset/${fixedEncodeURIComponent(
    entry.album.key
  )}/${fixedEncodeURIComponent(entry.name)}`;
}

export async function albumEntriesWithMetadata(
  a: AlbumEntry[]
): Promise<AlbumEntryWithMetadata[]> {
  const s = await getService();
  return Promise.all(
    a.map((entry) => s.imageInfo(entry) as Promise<AlbumEntryWithMetadata>)
  );
}

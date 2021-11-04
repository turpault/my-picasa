import { getService } from "../rpc/connect.js";
import { AlbumEntry, ThumbnailSize } from "../types/types.js";

export async function buildContext(fh: string): Promise<string> {
  const c = await getService();
  const context = await c.buildContext(fh);
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
  transformation: string
): Promise<string> {
  const c = await getService();
  await c.transform(context, transformation);
  return context;
}

export async function cloneContext(context: string): Promise<string> {
  const c = await getService();
  const newContext = await c.cloneContext(context);
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
): Promise<string> {
  const c = await getService();
  return await c.encode(context, mime, format);
}

export async function encodeToURL(
  context: string,
  mime: string
): Promise<string> {
  return `/encode/${context}/${encodeURIComponent(mime)}`;
}

export async function thumbnailUrl(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium"
) {
  return `/thumbnail/${encodeURIComponent(
    entry.album.key
  )}/${encodeURIComponent(entry.name)}/${encodeURIComponent(size)}`;
}

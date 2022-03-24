import { fixedEncodeURIComponent } from "../../shared/lib/utils";
import { AlbumEntry, ThumbnailSize } from "../../shared/types/types";
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
): Promise<{ width: number; height: number; data: string | Buffer }> {
  const c = await getService();
  return await c.encode(context, mime, format);
}

export function encodeToURL(context: string, mime: string): string {
  return `http://127.0.0.1:${getServicePort()}/encode/${context}/${fixedEncodeURIComponent(
    mime
  )}`;
}

export function thumbnailUrl(
  entry: AlbumEntry,
  size: ThumbnailSize = "th-medium"
): string {
  if (!entry) {
    return "";
  }
  return `http://127.0.0.1:${getServicePort()}/thumbnail/${fixedEncodeURIComponent(
    entry.album.key
  )}/${fixedEncodeURIComponent(entry.name)}/${fixedEncodeURIComponent(size)}`;
}

export function assetUrl(entry: AlbumEntry): string {
  if (!entry) {
    return "";
  }
  return `http://127.0.0.1:${getServicePort()}/asset/${fixedEncodeURIComponent(
    entry.album.key
  )}/${fixedEncodeURIComponent(entry.name)}`;
}

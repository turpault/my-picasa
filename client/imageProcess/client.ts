import { getService } from "../rpc/connect.js";
import { ThumbnailSize } from "../types/types.js";

export async function buildContext(fh: string): Promise<string> {
  const c = await getService();
  const context = await c.service.buildContext(fh);
  return context;
}

export async function execute(
  context: string,
  operations: any[][]
): Promise<string> {
  const c = await getService();
  await c.service.execute(context, operations as any[][]);
  return context;
}

export async function commit(context: string): Promise<string> {
  const c = await getService();
  await c.service.commit(context);
  return context;
}

export async function setOptions(
  context: string,
  options: any
): Promise<string> {
  const c = await getService();
  await c.service.setOptions(context, options);
  return context;
}

export async function transform(
  context: string,
  transformation: string
): Promise<string> {
  const c = await getService();
  await c.service.transform(context, transformation);
  return context;
}

export async function cloneContext(context: string): Promise<string> {
  const c = await getService();
  const newContext = await c.service.cloneContext(context);
  return newContext;
}

export async function destroyContext(context: string): Promise<void> {
  const c = await getService();
  await c.service.destroyContext(context);
}

export async function encode(
  context: string,
  mime: string,
  format: string
): Promise<string> {
  const c = await getService();
  return await c.service.encode(context, mime, format);
}

export async function encodeToURL(
  context: string,
  mime: string
): Promise<string> {
  return `/encode/${context}/${encodeURIComponent(mime)}`;
}

export async function thumbnailUrl(
  f: string,
  name: string,
  size: ThumbnailSize = "th-medium"
) {
  return `/thumbnail/${encodeURIComponent(f)}/${encodeURIComponent(
    name
  )}/${encodeURIComponent(size)}`;
}

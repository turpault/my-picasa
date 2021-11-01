import { SocketAdaptorInterface } from "../../shared/socket/socketAdaptorInterface.js";
import { connect } from "../connect/connect.js";
import { MyPicasa } from "../rpc/generated-rpc/MyPicasa.js";

let connection: Promise<{ service: MyPicasa; socket: SocketAdaptorInterface }>;
function getService(): Promise<{
  service: MyPicasa;
  socket: SocketAdaptorInterface;
}> {
  if (!connection) {
    connection = connect(5500, "127.0.0.1", false, {});
  }
  return connection;
}

export async function readPictureWithTransforms(
  fh: string,
  options: any,
  transform: string,
  extraOperations: any[]
): Promise<string> {
  const c = await getService();
  const context = await c.service.buildContext(fh);
  await c.service.setOptions(context, options);
  await c.service.transform(context, transform);
  return context;
}

export async function buildContext(fh: any): Promise<string> {
  const c = await getService();
  const context = await c.service.buildContext(fh);
  return context;
}

export async function execute(
  context: string,
  operations: string[][]
): Promise<string> {
  const c = await getService();
  await c.service.execute(context, operations as string[][]);
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

export async function encode(context: string, mime: string): Promise<string> {
  return `/encode/${context}/${mime}`;
}

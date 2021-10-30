import { File } from "./handles";

export async function getFileContents(
  fh: File,
  format: "base64" | "buffer" | "string" = "base64"
): Promise<string | ArrayBuffer> {
  const buffer = await fh.getFileContents();
  if (format === "base64") {
    return buffer.toString("base64url");
  }
  if (format === "string") {
    return buffer.toString("utf-8");
  }

  return buffer;
}

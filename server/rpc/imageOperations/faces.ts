import { join } from "path";
import { imagesRoot } from "../../utils/constants";
import { safeWriteFile } from "../../utils/serverUtils";
import { media } from "../rpcFunctions/media";
import { getFaceAlbums } from "../rpcFunctions/picasaIni";
import { buildFaceImage } from "./sharp-processor";
import { mkdir, unlink } from "fs/promises";

/**
 * Export all faces to a folder
 */
export async function exportAllFaces() {
  const albums = await getFaceAlbums();
  const targetFaceRootFolder = join(imagesRoot, ".faces");
  albums.map(async (albums) => {
    const faceFolder = join(targetFaceRootFolder, albums.name);
    await unlink(faceFolder);
    await mkdir(faceFolder, { recursive: true });
    const entries = await media(albums);
    await Promise.all(
      entries.entries.map(async (entry) => {
        const image = await buildFaceImage(entry);
        await safeWriteFile(join(faceFolder, entry.name), image.data);
      })
    );
  });
}

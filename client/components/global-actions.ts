import { getService } from "../rpc/connect";
import { question } from "./question";

// Status change events
export async function makeNewAlbum() {
  const newAlbum = await question(
    "New album name",
    "Please type the new album name"
  );
  if (newAlbum) {
    const s = await getService();
    s.makeAlbum(newAlbum);
  }
}

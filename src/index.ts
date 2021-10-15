import { make as makeAlbumList } from "./components/album-list.js";
import { make as makeInfinitePictureList } from "./components/infinite-pictures-list.js";
import { FolderMonitor } from "./folder-monitor.js";
import { $ } from "./lib/dom.js";
import { get, set } from "./lib/idb-keyval.js";

export function init() {
  $("tree")!.addEventListener("click", async () => {
    let root = await get("root");

    if (!root) {
      root = await (window as any).showDirectoryPicker();
      await root.requestPermission({ mode: "readwrite" });
      await set("root", root);
    } else {
      if ((await root.queryPermission({ mode: "readwrite" })) !== "granted") {
        await root.requestPermission({ mode: "readwrite" });
      }
    }

    const monitor = new FolderMonitor(root);

    makeAlbumList($("folders")!, monitor);
    makeInfinitePictureList($("images")!, monitor);
  });
}

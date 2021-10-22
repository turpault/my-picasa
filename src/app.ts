import { make as makeAlbumList } from "./components/album-list.js";
import { make as makeMetadata } from "./components/metadata.js";
import { make as makePhotoList } from "./components/photo-list.js";
import { FolderMonitor } from "./folder-monitor.js";
import { get, set } from "./lib/idb-keyval.js";
import { jBone as $ } from "./lib/jbone/jbone.js";
import { SelectionManager } from "./selection/selection-manager.js";

function init() {
  $("#tree").on("click", async () => {
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

    const selectEmitter = makeAlbumList($("#folders")[0], monitor);
    makePhotoList($("#images")[0], monitor, selectEmitter);

    makeMetadata(
      $("#metadatasidebar")[0],
      SelectionManager.get().events,
      monitor
    );
  });
}

window.addEventListener("load", () => {
  init();
});

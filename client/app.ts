import { $ } from "../client/lib/dom.js";
import { make as makeAlbumList } from "./components/album-list.js";
import { make as makeMetadata } from "./components/metadata.js";
import { make as makePhotoList } from "./components/photo-list.js";
import { FolderMonitor } from "./folder-monitor.js";
import { buildEmitter } from "../shared/lib/event.js";
import { SelectionManager } from "./selection/selection-manager.js";
import { AlbumListEvent } from "./types/types.js";

function init() {
  /*
    let root = await get("root");

    if (!root) {
            root = await (window as any).showDirectoryPicker();
      await root.requestPermission({ mode: "readwrite" });
      await set("root", root);
    } else {
      if ((await root.queryPermission({ mode: "readwrite" })) !== "granted") {
        await root.requestPermission({ mode: "readwrite" });
      }
    }*/
  const monitor = new FolderMonitor();
  const emitter = buildEmitter<AlbumListEvent>();

  makeAlbumList($("#folders").get(), monitor, emitter);
  makePhotoList($("#images").get(), monitor, emitter);

  makeMetadata(
    $("#metadatasidebar").get()!,
    SelectionManager.get().events,
    monitor
  );
}

window.addEventListener("load", () => {
  init();
});

import { $, _$ } from "../client/lib/dom.js";
import { buildEmitter } from "../shared/lib/event.js";
import { makeAlbumList } from "./components/album-list.js";
import { makeEditorPage } from "./components/editor-page.js";
import { makeHotkeys } from "./components/hotkey.js";
import { makeJobList } from "./components/joblist.js";
import { makeMetadata } from "./components/metadata.js";
import { makeButtons } from "./components/photo-list-buttons.js";
import { makePhotoList } from "./components/photo-list.js";
import { makeTab, makeTabs, selectTab } from "./components/tabs.js";
import { makeThumbnailManager } from "./components/thumbnail.js";
import { FolderMonitor } from "./folder-monitor.js";
import { SelectionManager } from "./selection/selection-manager.js";
import { AlbumListEvent } from "./types/types.js";

function init() {
  const monitor = new FolderMonitor();
  const emitter = buildEmitter<AlbumListEvent>();

  makeJobList($(".jobs").get());
  makeAlbumList($(".browser").get(), monitor, emitter);
  makePhotoList($(".images").get(), monitor, emitter);
  makeThumbnailManager();
  makeButtons($(".buttons").get());

  makeMetadata(
    $(".metadatasidebar").get()!,
    SelectionManager.get().events,
    monitor
  );

  makeTabs(emitter);
  makeHotkeys(emitter);
  //makeContextMenu();

  emitter.on("open", async ({ album, name }) => {
    const win = $(await makeEditorPage(album, name));
    const tab = $(
      `<a class="w3-button tab-button">${name}<span class="remove-tab">&times;</span></a>`
    );
    makeTab(win, tab);
  });
}

window.addEventListener("load", () => {
  init();
});

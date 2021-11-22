import { $ } from "../client/lib/dom.js";
import { buildEmitter } from "../shared/lib/event.js";
import { makeAlbumList } from "./components/album-list.js";
import { makeEditorPage } from "./components/editor-page.js";
import { makeGallery } from "./components/gallery.js";
import { makeHotkeys } from "./components/hotkey.js";
import { makeJobList } from "./components/joblist.js";
import { makeMetadata } from "./components/metadata.js";
import { makeButtons } from "./components/photo-list-buttons.js";
import { makePhotoList } from "./components/photo-list.js";
import { makeTab, makeTabs } from "./components/tabs.js";
import { makeThumbnailManager } from "./components/thumbnail.js";
import { FolderMonitor } from "./folder-monitor.js";
import { makeSettings } from "./lib/settings.js";
import { setServicePort } from "./rpc/connect.js";
import { SelectionManager } from "./selection/selection-manager.js";
import { AlbumListEvent } from "./types/types.js";

async function init(port: number) {
  setServicePort(port);
  const monitor = new FolderMonitor();
  const emitter = buildEmitter<AlbumListEvent>();

  await makeSettings();
  await makeJobList($(".jobs").get());
  await makeAlbumList($(".browser").get(), monitor, emitter);
  await makePhotoList($(".images").get(), monitor, emitter);
  await makeThumbnailManager();

  await makeMetadata(
    $(".metadatasidebar").get()!,
    SelectionManager.get().events,
    monitor
  );

  makeTabs(emitter);
  makeHotkeys(emitter);
  //makeContextMenu();
  await makeButtons($(".buttons").get());

  emitter.on("show", async ({ start }) => {
    const win = $(await makeGallery(start, emitter));
    const tab = $(
      `<a class="w3-button tab-button">${start.album.name}<span class="remove-tab">&times;</span></a>`
    );
    makeTab(win, tab);
  });

  emitter.on("open", async ({ album, name }) => {
    const win = $(await makeEditorPage(album, name, emitter));
    const tab = $(
      `<a class="w3-button tab-button">${name}<span class="remove-tab">&times;</span></a>`
    );
    makeTab(win, tab);
  });

  monitor.ready();
}

window.addEventListener("load", () => {
  const port = parseInt(location.hash.substr(1) || "5500");
  init(port);
});

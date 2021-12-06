import { $ } from "../client/lib/dom";
import { buildEmitter } from "../shared/lib/event";
import { makeAlbumList } from "./components/album-list";
import { makeCompositorPage } from "./components/compositor";
import { makeEditorPage } from "./components/editor-page";
import { makeGallery } from "./components/gallery";
import { makeHotkeys } from "./components/hotkey";
import { makeJobList } from "./components/joblist";
import { makeMetadata } from "./components/metadata";
import { makeButtons } from "./components/photo-list-buttons";
import { makePhotoList } from "./components/photo-list";
import { makeTab, makeTabs } from "./components/tabs";
import { makeThumbnailManager } from "./components/thumbnail";
import { FolderMonitor } from "./folder-monitor";
import { makeSettings } from "./lib/settings";
import { setServicePort } from "./rpc/connect";
import { SelectionManager } from "./selection/selection-manager";
import { AlbumListEvent } from "./types/types";

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
  await makeButtons($(".buttons").get(), emitter);

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

  emitter.on("composite", async () => {
    const tab = $(
      `<a class="w3-button tab-button">Composition<span class="remove-tab">&times;</span></a>`
    );
    const win = $(await makeCompositorPage(emitter));
    makeTab(win, tab);
  });

  monitor.ready();
}

window.addEventListener("load", () => {
  const port = parseInt(location.hash.substr(1) || "5500");
  init(port);
});

import { $ } from "../client/lib/dom";
import { buildEmitter } from "../shared/lib/event";
import { makeBrowser } from "./components/browser";
import { makeCompositorPage } from "./components/compositor";
import { makeEditorPage } from "./components/editor-page";
import { makeGallery } from "./components/gallery";
import { makeHotkeys } from "./components/hotkey";
import { makeJobList } from "./components/joblist";
import { makeMetadata } from "./components/metadata";
import { initClientSentry } from "./components/sentry";
import { makeTab, makeTabs, selectTab } from "./components/tabs";
import { makeThumbnailManager } from "./components/thumbnail";
import { makeSettings } from "./lib/settings";
import { setServicePort } from "./rpc/connect";
import { SelectionManager } from "./selection/selection-manager";
import { AlbumEntry } from "./types/types";
import { AppEvent } from "./uiTypes";


async function init(port: number) {

  initClientSentry();
  setServicePort(port);
  const emitter = buildEmitter<AppEvent>();

  await makeSettings();
  await makeJobList($(".jobs").get());
  await makeThumbnailManager();

  await makeMetadata(
    $(".metadatasidebar"),
    SelectionManager.get().events
  );

  makeTabs(emitter);
  makeHotkeys(emitter);

  //makeContextMenu();

  emitter.on("show", async ({ initialList, initialIndex }) => {
    const { win, tab } = await makeGallery(initialIndex, initialList, emitter);
    makeTab(win, tab, tool);
  });

  emitter.on("edit", async ({ initialList, initialIndex }) => {
    const { win, tab, tool } = await makeEditorPage(
      initialIndex,
      initialList,
      emitter
    );
    makeTab(win, tab, tool);
  });

  emitter.on("composite", async ({
    initialList,
    initialIndex,
  }) => {
    const { win, tab } = await makeCompositorPage(emitter, initialList as AlbumEntry[]);
    makeTab(win, tab, tool);
  });

  const { win, tab, tool } = await makeBrowser(emitter);
  makeTab(win, tab, tool);

  selectTab(win);
}

window.addEventListener("load", () => {
  const port = parseInt(location.hash.slice(1) || "5500");
  init(port);
});

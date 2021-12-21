import { $ } from "../client/lib/dom";
import { buildEmitter } from "../shared/lib/event";
import { makeBrowser } from "./components/browser";
import { makeCompositorPage } from "./components/compositor";
import { makeEditorPage } from "./components/editor-page";
import { makeGallery } from "./components/gallery";
import { makeHotkeys } from "./components/hotkey";
import { makeJobList } from "./components/joblist";
import { makeMetadata } from "./components/metadata";
import { makeTab, makeTabs, selectTab } from "./components/tabs";
import { makeThumbnailManager } from "./components/thumbnail";
import { makeSettings } from "./lib/settings";
import { setServicePort } from "./rpc/connect";
import { SelectionManager } from "./selection/selection-manager";
import { AppEvent } from "./uiTypes";

async function init(port: number) {
  setServicePort(port);
  const emitter = buildEmitter<AppEvent>();

  await makeSettings();
  await makeJobList($(".jobs").get());
  await makeThumbnailManager();

  await makeMetadata(
    $(".metadatasidebar").get()!,
    SelectionManager.get().events
  );

  makeTabs(emitter);
  makeHotkeys(emitter);

  //makeContextMenu();

  emitter.on("show", async ({ initialList, initialIndex }) => {
    const { win, tab } = await makeGallery(initialIndex, initialList, emitter);
    makeTab(win, tab);
  });

  emitter.on("edit", async ({ initialList, initialIndex }) => {
    const { win, tab } = await makeEditorPage(
      initialIndex,
      initialList,
      emitter
    );
    makeTab(win, tab);
  });

  emitter.on("composite", async () => {
    const { win, tab } = await makeCompositorPage(emitter);
    makeTab(win, tab);
  });

  const { win, tab } = await makeBrowser(emitter);
  makeTab(win, tab);

  selectTab(win);
}

window.addEventListener("load", () => {
  const port = parseInt(location.hash.slice(1) || "5500");
  init(port);
});

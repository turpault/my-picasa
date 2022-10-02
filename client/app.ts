import { $ } from "../client/lib/dom";
import { buildEmitter } from "../shared/lib/event";
import { AlbumIndexedDataSource } from "./album-data-source";
import { makeBrowser } from "./components/browser";
import { makeCompositorPage } from "./components/compositor";
import { makeEditorPage } from "./components/editor-page";
import { consoleOverload } from "./components/error-utils";
import { makeGallery } from "./components/gallery";
import { makeHotkeys } from "./components/hotkey";
import { makeJobList } from "./components/joblist";
import { makeMetadata } from "./components/metadata";
import { initClientSentry } from "./components/sentry";
import { makeTab, makeTabs, selectTab } from "./components/tabs";
import { makeThumbnailManager } from "./components/thumbnail";
import { makeSettings } from "./lib/settings";
import { getService, setServicePort } from "./rpc/connect";
import { SelectionManager } from "./selection/selection-manager";
import { AlbumEntry } from "./types/types";
import { AppEvent } from "./uiTypes";

async function init(port: number) {
  initClientSentry();
  setServicePort(port);
  const emitter = buildEmitter<AppEvent>();
  const s = await getService();
  await consoleOverload();
  const dataSource = new AlbumIndexedDataSource();

  let ready = 0;

  emitter.on("ready", (event) => {
    if (event.state) {
      ready--;
      if (ready === 0) {
        console.info("Application is ready");
        s.ready();
      }
    } else {
      ready++;
    }

    console.info("Ready event", ready);
  });
  emitter.emit("ready", { state: false });

  await makeSettings();
  await makeJobList($(".jobs").get());
  await makeThumbnailManager();

  await makeMetadata($(".metadatasidebar"), SelectionManager.get().events);

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

  emitter.on("composite", async ({ initialList, initialIndex }) => {
    const { win, tab } = await makeCompositorPage(
      emitter,
      initialList as AlbumEntry[]
    );
    makeTab(win, tab, tool);
  });

  const { win, tab, tool } = await makeBrowser(emitter, dataSource);
  makeTab(win, tab, tool);

  selectTab(win);
  await dataSource.init();

  emitter.emit("ready", { state: true });
}

window.addEventListener("load", () => {
  const port = parseInt(
    location.hash.slice(1) || location.port.toString() || "5500"
  );
  init(port);
});

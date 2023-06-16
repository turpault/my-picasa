import { $ } from "../client/lib/dom";
import { buildEmitter } from "../shared/lib/event";
import { fromBase64, idFromAlbumEntry, toBase64 } from "../shared/lib/utils";
import { AlbumEntry, AlbumKind, ProjectType } from "../shared/types/types";
import { AlbumIndexedDataSource } from "./album-data-source";
import { makeBrowser } from "./components/browser";
import { makeButtons } from "./components/browser-photo-list-buttons";
import { makeEditorPage } from "./components/editor-page";
import { makeErrorPage } from "./components/error";
import { consoleOverload } from "./components/error-utils";
import { makeGallery } from "./components/gallery";
import { makeHotkeys } from "./components/hotkey";
import { makeJobList } from "./components/joblist";
import { makeMosaicPage, newMosaicProject } from "./components/mosaic";
import { question } from "./components/question";
import { initClientSentry } from "./components/sentry";
import { t } from "./components/strings";
import { makeTab, makeTabs, selectTab } from "./components/tabs";
import {
  albumEntriesWithMetadata,
  initCacheBuster,
} from "./imageProcess/client";
import { makeSettings } from "./lib/settings";
import { getService, setServicePort } from "./rpc/connect";
import { SelectionManager } from "./selection/selection-manager";
import { AppEvent } from "./uiTypes";
async function init(port: number) {
  initClientSentry();
  setServicePort(port);
  initCacheBuster();
  const emitter = buildEmitter<AppEvent>(false);
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

  $(".tabs-container").append(makeTabs(emitter));
  $(".buttons-container").append(makeButtons(emitter));

  makeHotkeys(emitter);

  //makeContextMenu();
  async function newGalleryPage(params: {
    initialList: AlbumEntry[];
    initialIndex: number;
  }) {
    const { win, tab, selectionManager } = await makeGallery(
      params.initialIndex,
      params.initialList,
      emitter
    );
    makeTab(win, tab, { kind: "Gallery", selectionManager });
  }
  async function newEditorPage(params: {
    initialList: AlbumEntry[];
    initialIndex: number;
  }) {
    const entry = params.initialList[params.initialIndex];
    if (entry.album.kind === AlbumKind.PROJECT) {
      if (entry.album.name == ProjectType.MOSAIC) {
        const { win, tab, selectionManager } = await makeMosaicPage(
          emitter,
          entry
        );
        makeTab(win, tab, { kind: "Mosaic", selectionManager });
      }
    } else {
      const { win, tab, selectionManager } = await makeEditorPage(
        params.initialIndex,
        params.initialList,
        emitter
      );
      makeTab(win, tab, { kind: "Editor", selectionManager });
    }
  }
  async function newMosaicPage(params: { initialList: AlbumEntry[] }) {
    const images = await albumEntriesWithMetadata(params.initialList);
    const name = await question(
      t("Mosaic Name"),
      t("New mosaic " + new Date())
    );
    if (name) {
      const projectId = await newMosaicProject(name, images);
      const { win, tab, selectionManager } = await makeMosaicPage(
        emitter,
        projectId
      );
      makeTab(win, tab, { kind: "Mosaic", selectionManager });
    }
  }
  async function newBrowserPage() {
    const { win, tab, selectionManager } = await makeBrowser(
      emitter,
      dataSource
    );
    makeTab(win, tab, { kind: "Browser", selectionManager });
    makeButtons(emitter);

    selectTab(win);
    await dataSource.init();
  }

  const searchParams = new URLSearchParams(location.search || "");

  let showInNewWindow = false;

  if (searchParams.has("window")) {
    showInNewWindow = true;
  }

  async function openFromUrl(fct: Function) {
    const params = searchParams.get("params");
    if (!params) {
      newBrowserPage();
      return;
    }
    const initialListStr = fromBase64(params);
    try {
      fct(...JSON.parse(initialListStr));
    } catch (e: any) {
      console.error(e);
      const { win, tab } = await makeErrorPage(e);
      makeTab(win, tab, {
        kind: "Browser",
        selectionManager: new SelectionManager<AlbumEntry>(
          [],
          idFromAlbumEntry
        ),
      });
    }
  }
  const page = searchParams.get("page");
  if (page === "editor") {
    openFromUrl(newEditorPage);
  } else if (page === "mosaic") {
    openFromUrl(newMosaicPage);
  } else if (page === "gallery") {
    openFromUrl(newGalleryPage);
  } else {
    // Default is browser
    newBrowserPage();
  }

  if (showInNewWindow) {
    const newWindow = (page: string) => (...args: any[]) => {
      const arg = toBase64(JSON.stringify(args));
      const url = new URL(location.href);
      const searchParams = new URLSearchParams(location.search);
      searchParams.delete("page");
      searchParams.delete("params");
      searchParams.append("page", page);
      searchParams.append("params", arg);
      url.search = searchParams.toString();
      window.open(url.toString());
    };
    const actions = {
      show: newWindow("gallery"),
      edit: newWindow("editor"),
      mosaic: newWindow("mosaic"),
    };
    for (const [key, action] of Object.entries(actions)) {
      emitter.on(key as any, action);
    }
  } else {
    emitter.on("show", newGalleryPage);
    emitter.on("edit", newEditorPage);
    emitter.on("mosaic", newMosaicPage);
  }

  emitter.emit("ready", { state: true });
}

window.addEventListener("load", () => {
  const searchParams = new URLSearchParams(location.search);
  const port = parseInt(searchParams.get("port") || location.port || "5500");
  init(port);
});

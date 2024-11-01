import { $ } from "../client/lib/dom";
import { buildEmitter } from "../shared/lib/event";
import { fromBase64, idFromAlbumEntry, toBase64 } from "../shared/lib/utils";
import { AlbumEntry, AlbumKind, ProjectType } from "../shared/types/types";
import { AlbumIndexedDataSource } from "./album-data-source";
import { makeButtons } from "./components/bottom-selection-buttons";
import { makeBrowser } from "./components/browser";
import { makeBugWidget } from "./components/bug-widget";
import { registerButton } from "./components/controls/button";
import { registerCarousel } from "./components/controls/carousel";
import { registerInput } from "./components/controls/input";
import { registerMultiButton } from "./components/controls/multibutton";
import { registerSelect } from "./components/controls/select";
import { registerSlider } from "./components/controls/slider";
import { makeEditorHeader } from "./components/editor-header";
import { makeEditorPage } from "./components/editor-page";
import { makeErrorPage } from "./components/error";
import { consoleOverload } from "./components/error-utils";
import { makeGallery } from "./components/gallery";
import { makeHotkeys } from "./components/hotkey";
import { makeJobList } from "./components/joblist";
import { makeMetadataViewer } from "./components/metadata-viewer";
import { makeMosaicPage, newMosaicProject } from "./components/mosaic";
import { question } from "./components/question";
import { initClientSentry } from "./components/sentry";
import { makeSlideshowPage, newSlideshowProject } from "./components/slideshow";
import { t } from "./components/strings";
import { makeTab, makeTabs, selectTab } from "./components/tabs";
import {
  albumEntriesWithMetadata,
  initCacheBuster,
} from "./imageProcess/client";
import { makeSettings } from "./lib/settings";
import { State } from "./lib/state";
import { getService, setServicePort } from "./rpc/connect";
import { SelectionManager } from "./selection/selection-manager";
import { AppEvent, ApplicationSharedStateDef } from "./uiTypes";
async function init(port: number) {
  initClientSentry();
  setServicePort(port);
  initCacheBuster();

  // Register web components
  registerButton();
  registerMultiButton();
  registerSlider();
  registerSelect();
  registerInput();
  registerCarousel();

  const emitter = buildEmitter<AppEvent>(false);
  const s = await getService();
  await consoleOverload();
  const dataSource = new AlbumIndexedDataSource();

  let ready = 0;
  const state = new State<ApplicationSharedStateDef>();

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

  $(".tabs-container").append(makeTabs(emitter, state));

  await makeBugWidget($("#action-new-bug"));
  const metaViewer = makeMetadataViewer(state);
  const buttons = makeButtons(emitter, state);
  $(document.body).append(metaViewer).append(buttons);

  makeHotkeys(emitter);

  async function newGalleryPage(params: {
    initialList: AlbumEntry[];
    initialIndex: number;
  }) {
    const { win, tab, selectionManager } = await makeGallery(
      params.initialIndex,
      params.initialList,
      emitter,
      state,
    );
    makeTab(win, tab, { kind: "Gallery", selectionManager });
  }

  async function newMosaicPage(params: { initialList: AlbumEntry[] }) {
    const images = await albumEntriesWithMetadata(params.initialList);
    const name = await question(
      t("Mosaic Name"),
      t("New mosaic") + " " + new Date(),
    );
    if (name) {
      const projectId = await newMosaicProject(name, images);
      const { win, tab, selectionManager } = await makeMosaicPage(
        emitter,
        projectId,
        state,
      );
      makeTab(win, tab, { kind: "Mosaic", selectionManager });
    }
  }
  async function newSlideshowPage(params: { initialList: AlbumEntry[] }) {
    const images = await albumEntriesWithMetadata(params.initialList);
    let name = await question(
      t("Slideshow Name"),
      t("Slideshow") + " " + new Date().toLocaleDateString(),
    );
    if (!name) {
      // generate a name
      name = t("Slideshow") + " " + new Date().toLocaleDateString();
    }
    const projectId = await newSlideshowProject(name, images);
    const { win, tab, selectionManager } = await makeSlideshowPage(
      emitter,
      projectId,
      state,
    );

    makeTab(win, tab, { kind: "Slideshow", selectionManager });
  }
  async function newBrowserPage() {
    const { win, tab, selectionManager } = await makeBrowser(
      emitter,
      dataSource,
      state,
    );
    makeTab(win, tab, { kind: "Browser", selectionManager });

    selectTab(win);
    await dataSource.init();
  }
  newBrowserPage();

  async function edit(params: { entry: AlbumEntry }) {
    const entry = params.entry;
    if (entry.album.kind === AlbumKind.PROJECT) {
      const project = (await s.getProject(entry)) as AlbumEntry;
      const type = project.album.name as ProjectType;
      if (type === ProjectType.MOSAIC) {
        const { win, tab, selectionManager } = await makeMosaicPage(
          emitter,
          entry,
          state,
        );
        makeTab(win, tab, { kind: "Mosaic", selectionManager });
      } else if (type === ProjectType.SLIDESHOW) {
        const { win, tab, selectionManager } = await makeSlideshowPage(
          emitter,
          entry,
          state,
        );
        makeTab(win, tab, { kind: "Slideshow", selectionManager });
      }
    } else if (entry.album.kind === AlbumKind.FOLDER) {
      const { win, tab, selectionManager } = await makeEditorPage(
        emitter,
        entry,
        state,
      );
      makeTab(win, tab, { kind: "Editor", selectionManager });
    }
  }

  emitter.on("edit", edit);
  emitter.on("gallery", newGalleryPage);
  emitter.on("mosaic", newMosaicPage);
  emitter.on("slideshow", newSlideshowPage);

  emitter.emit("ready", { state: true });
}

window.addEventListener("load", () => {
  const searchParams = new URLSearchParams(location.search);
  const port = parseInt(searchParams.get("port") || location.port || "5500");
  init(port);
});

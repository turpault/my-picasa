import { $ } from "../client/lib/dom";
import { buildEmitter } from "../shared/lib/event";
import { isPicture } from "../shared/lib/utils";
import { AlbumEntry, ProjectType } from "../shared/types/types";
import { makeButtons } from "./components/bottom-selection-buttons";
import { makeBrowser } from "./components/browser";
import { makeBugWidget } from "./components/bug-widget";
import { makeFeatureFlagsModal } from "./components/feature-flags-modal";
import { registerButton } from "./components/controls/button";
import { registerCarousel } from "./components/controls/carousel";
import { registerInput } from "./components/controls/input";
import { registerMultiButton } from "./components/controls/multibutton";
import { registerSelect } from "./components/controls/select";
import { registerSlider } from "./components/controls/slider";
import { makeEditorPage } from "./components/editor-page";
import { consoleOverload } from "./components/error-utils";
import { makeGallery } from "./components/gallery";
import { makeHotkeys } from "./components/hotkey";
import { makeJobList } from "./components/joblist";
import { makeMetadataViewer } from "./components/metadata-viewer";
import { makeMosaicPage, newMosaicProject } from "./components/mosaic";
import { message, question } from "./components/question";
import { initClientSentry } from "./components/sentry";
import { makeSlideshowPage, newSlideshowProject } from "./components/slideshow";
import { t } from "./components/strings";
import { makeTab, makeTabs, selectTab } from "./components/tabs";
import { initCacheBuster } from "./imageProcess/client";
import { makeSettings } from "./lib/settings";
import { State } from "./lib/state";
import { getService, setServicePort } from "./rpc/connect";
import { featureFlagService } from "./lib/feature-flags";
import { AppEvent, ApplicationSharedStateDef } from "./uiTypes";
import { events } from "../shared/server-events";
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

  // Initialize feature flag service
  featureFlagService.setClient(s);

  await consoleOverload();

  let ready = 0;
  const state = new State<ApplicationSharedStateDef>();
  events.on("undoChanged", (event) => {
    state.setValue("undo", event.undoSteps);
  });
  state.setValue("undo", await s.undoList());
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
  const featureFlagsModal = makeFeatureFlagsModal();
  $(document.body).append(featureFlagsModal);

  // Wire up feature flags button
  $("#action-feature-flags").on("click", () => {
    featureFlagsModal.show();
  });

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
    const list = params.initialList.filter((e) => isPicture(e));
    if (list.length < 2) {
      await message(t("Mosaic needs at least 2 images"));
      return;
    }
    const MAX_MOSAIC_IMAGES = 1000;
    if (list.length > MAX_MOSAIC_IMAGES) {
      await message(t("Mosaic can have at $1 images", MAX_MOSAIC_IMAGES));
      return;
    }
    const placeholder = t("Please enter a name");
    let name = await question(t("Mosaic Name"), placeholder);
    if (!name) return;
    const project = await newMosaicProject(name, list);
    const { win, tab, selectionManager } = await makeMosaicPage(
      emitter,
      project,
      state,
    );
    makeTab(win, tab, { kind: "Mosaic", selectionManager });
  }
  async function newSlideshowPage(params: { initialList: AlbumEntry[] }) {
    const list = params.initialList.filter((e) => isPicture(e));
    if (list.length < 1) {
      await message(t("Slideshow needs at least one image"));
      return;
    }

    const placeholder = t("Please enter a name");
    let name = await question(t("Slideshow Name"), placeholder);
    if (!placeholder) return;
    const projectId = await newSlideshowProject(name, list);
    const { win, tab, selectionManager } = await makeSlideshowPage(
      emitter,
      projectId,
      state,
    );

    makeTab(win, tab, { kind: "Slideshow", selectionManager });
  }
  async function newBrowserPage() {
    // Initialize all caches before creating browser
    const { getAlbumCache } = await import("./lib/caches/album-cache");
    const { getShortcutCache } = await import("./lib/caches/shortcut-cache");
    const { getContactCache } = await import("./lib/caches/contact-cache");
    const { getProjectCache } = await import("./lib/caches/project-cache");

    await Promise.all([
      getAlbumCache().init(),
      getShortcutCache().init(),
      getContactCache().init(),
      getProjectCache().init(),
    ]);

    const { win, tab, selectionManager } = await makeBrowser(
      emitter,
      state,
    );
    makeTab(win, tab, { kind: "Browser", selectionManager });

    selectTab(tab);
    return tab;
  }
  const browserTab = await newBrowserPage();

  async function edit(params: { entry: AlbumEntry }) {
    const entry = params.entry;
    // Albums are now only folders - project handling removed
    {
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
  emitter.on("returnToBrowser", () => selectTab(browserTab, true));

  emitter.emit("ready", { state: true });
}

window.addEventListener("load", () => {
  const searchParams = new URLSearchParams(location.search);
  const port = parseInt(searchParams.get("port") || location.port || "5500");
  init(port);
});

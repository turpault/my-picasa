import {
  AlbumEntry,
  AlbumEntryPicasa,
  JOBNAMES,
} from "../../shared/types/types";
import { setupAutocolor } from "../features/autocolor";
import { setupBW } from "../features/bw";
import { setupContrast } from "../features/contrast";
import { setupFlip } from "../features/flip";
import { setupMirror } from "../features/mirror";
import { setupSepia } from "../features/sepia";
import { $ } from "../lib/dom";
import { toggleStar } from "../lib/handles";
import { getService } from "../rpc/connect";
import { SelectionManager } from "../selection/selection-manager";
import { AppEventSource, ApplicationState } from "../uiTypes";
import { ImageController } from "./image-controller";
import { t } from "./strings";
import { makeTools } from "./tools";

import {
  PicasaFilter,
  compareAlbumEntry,
  idFromAlbumEntry,
} from "../../shared/lib/utils";
import { setupBlur } from "../features/blur";
import { setupBrightness } from "../features/brightness";
import { setupConvolutions } from "../features/convolutions";
import { setupCrop } from "../features/crop";
import { setupFill } from "../features/fill";
import { setupFilters } from "../features/filter";
import { setupHeatmap } from "../features/heatmap";
import { setupPolaroid } from "../features/polaroid";
import { setupSharpen } from "../features/sharpen";
import { setupSolarize } from "../features/solarize";
import { setupTilt } from "../features/tilt";
import { getAlbumContents } from "../folder-utils";
import { buildEmitter } from "../../shared/lib/event";
import { State } from "../lib/state";
import { makeEditorHeader } from "./editor-header";
import { makeHistogram } from "./histogram";
import { makeGenericTab, makeTab, TabEvent } from "./tabs";
import { ToolEditor } from "./tool-editor";

const editHTML = `
<div class="fill editor-page">
  <div class="fill tools">
    <div class="tools-tab-bar">
      <picasa-multi-button inverse class="tools-tab-bar-buttons" selected="0" items="url:resources/images/wrench.svg|url:resources/images/contrast.svg|url:resources/images/brush.svg|url:resources/images/green-brush.svg|url:resources/images/blue-brush.svg"></picasa-button>
    </div>
    <div class="tools-tab-contents">
      <div page="1" class="tools-tab-page tools-tab-page-wrench"></div>
      <div page="2" class="tools-tab-page tools-tab-page-contrast"></div>
      <div page="3" class="tools-tab-page tools-tab-page-brush"></div>
      <div page="4" class="tools-tab-page tools-tab-page-green-brush"></div>
      <div page="5" class="tools-tab-page tools-tab-page-blue-brush"></div>
      <div class="tools-bar-undo-redo">
        <picasa-button class="tools-bar-undo tools-bar-undo-redo-button"></picasa-button>
        <picasa-button class="tools-bar-redo tools-bar-undo-redo-button"></picasa-button>
      </div>
    </div>
    <div class="editor-controls"></div>
    <div class="histogram">
      ${t("Histogram data and informations about the camera")}
      <div class="histogram-camera-model"></div>
    </div>
  </div>

  <div class="image-container">
    <div    
      style="display: none"
      class="busy-spinner w3-display-container fill"
    >
      <img src="resources/images/thinking.gif" class="w3-display-middle" />
    </div>
    <video autoplay muted loop controls class="edited-video">
    </video>
    <img class="fill-with-aspect edited-image"></img>
    <div class="star big-star"></div>
  </div>
</div>`;

const lastOperationStack = "lastOperationStack";
const lastUndoneStack = "lastUndoneStack";

export async function makeEditorPage(
  appEvents: AppEventSource,
  entry: AlbumEntry,
  state: ApplicationState,
) {
  const editor = $(editHTML);
  editor.hide();
  const tabEvent = buildEmitter<TabEvent>();
  const editorControls = $(".editor-controls", editor);

  const image = $(".edited-image", editor);
  const video = $<HTMLVideoElement>(".edited-video", editor);
  const imageContainer = $(".image-container", editor);
  const pages = editor.all(".tools-tab-page");
  const [wrench, contrast, brush, greenBrush, blueBrush] = pages;
  //const tool = $(toolsHTML);
  //const metadata = $(".metadata", editor);
  const histogram = $(".histogram", editor);
  //const identify = $(".identify", editor);
  //const album = $(".album-contents", editor);

  // get album (filtered) of edited enty
  const contents = await getAlbumContents(entry.album, true);
  const editorSelectionManager = new SelectionManager<AlbumEntry>(
    [entry],
    idFromAlbumEntry,
  );

  const stripSelectionManager = new SelectionManager<AlbumEntry>(
    contents.entries,
    idFromAlbumEntry,
  );
  const editorHeader = makeEditorHeader(appEvents, stripSelectionManager);

  editor.append(editorHeader);

  function updateEditorSize() {
    const metaVisible = state.getValue("activeMetaPage") !== undefined;
    $(".image-container", editor).css({
      right: metaVisible ? "300px" : 0,
    });
  }

  const refreshTab = () => {
    pages.forEach((page, index) =>
      page.show(index === parseInt(tabBar.attr("selected"))),
    );
  };
  const tabBar = $(".tools-tab-bar-buttons", editor);
  refreshTab();

  const imageController = new ImageController(
    image,
    video,
    editorSelectionManager,
  );
  const toolRegistrar = makeTools(
    editor,
    { wrench, contrast, brush, greenBrush, blueBrush },
    imageController,
  );
  const toolEditor = new ToolEditor(false, editorControls, imageContainer);

  // Add all the activable features
  setupCrop(imageContainer, imageController, toolRegistrar, toolEditor);
  setupTilt(imageContainer, imageController, toolRegistrar, toolEditor);
  setupBrightness(imageController, toolRegistrar, toolEditor);
  setupAutocolor(imageController, toolRegistrar, toolEditor);
  setupBW(imageController, toolRegistrar, toolEditor);
  setupContrast(imageController, toolRegistrar, toolEditor);
  setupHeatmap(imageController, toolRegistrar, toolEditor);
  setupSolarize(imageController, toolRegistrar, toolEditor);
  setupFill(imageController, toolRegistrar, toolEditor);
  setupSepia(imageController, toolRegistrar, toolEditor);
  setupPolaroid(imageController, toolRegistrar, toolEditor);
  setupFlip(imageController, toolRegistrar, toolEditor);
  setupMirror(imageController, toolRegistrar, toolEditor);
  setupBlur(imageController, toolRegistrar, toolEditor);
  setupSharpen(imageController, toolRegistrar, toolEditor);
  setupFilters(imageController, toolRegistrar, toolEditor);
  setupConvolutions(imageController, toolRegistrar, toolEditor);
  //const refreshMetadataFct = makeMetadata(metadata);
  //makeIdentify(identify, imageController);
  const refreshHistogramFct = makeHistogram(histogram);

  const s = await getService();
  const undoBtn = $(".tools-bar-undo", editor);
  const redoBtn = $(".tools-bar-redo", editor);
  const localState = new State();

  const updateStarCount = async (entry: AlbumEntry) => {
    const s = await getService();
    const metadata = entry ? await s.getAlbumEntryMetadata(entry) : {};
    $(".star", imageContainer).css({
      display: metadata.star ? "" : "none",
      width: `${parseInt(metadata.starCount || "1") * 40}px`,
    });
  };
  function updateLastOperation(lastOperation: PicasaFilter[] | undefined) {
    const op = lastOperation?.[0];
    undoBtn.addRemoveClass("disabled", !op);
    if (op) {
      undoBtn.show();
      const tool = toolRegistrar.tool(op.name);
      const toolName = tool ? tool.displayName : op.name;
      undoBtn.text(`${t("Undo")} ${toolName}`);
    } else {
      undoBtn.hide();
      undoBtn.text(`${t("Undo")}`);
    }
  }

  function updateLastUndone(lastUndone: PicasaFilter[] | undefined) {
    const op = lastUndone?.[0];
    redoBtn.addRemoveClass("disabled", !op);
    if (op) {
      const tool = toolRegistrar.tool(op.name);
      const toolName = tool ? tool.displayName : op.name;
      redoBtn.text(`${t("Redo")} ${toolName}`);
      redoBtn.show();
    } else {
      redoBtn.hide();
    }
  }

  editor.show();
  imageController.show();

  const off = [
    state.events.on("activeMetaPage", updateEditorSize),
    imageController.events.on("idle", () => {
      $(".busy-spinner", editor).css("display", "none");
    }),
    imageController.events.on("busy", () => {
      $(".busy-spinner", editor).css("display", "block");
    }),
    imageController.events.on("visible", async ({ info, entry }) => {
      //refreshMetadataFct(entry, [entry], info);
    }),
    tabBar.onWithOff("click", refreshTab),
    imageController.events.on("beforeupdate", async ({}) => {
      localState.setValue(
        lastOperationStack,
        imageController.operations().slice().reverse(),
      );
    }),
    imageController.events.on("updated", async ({}) => {
      refreshHistogramFct(await imageController.getLiveThumbnailContext());
    }),
    localState.events.on(lastOperationStack, updateLastOperation),
    localState.events.on(lastUndoneStack, updateLastUndone),
    undoBtn.onWithOff("click", () => {
      const lastOperation = [
        ...(localState.getValue(lastOperationStack) as PicasaFilter[]),
      ];
      const op = lastOperation.shift();
      if (op) {
        imageController.deleteOperation(op.name);
        const lastUndone = localState.getValue(
          lastUndoneStack,
        ) as PicasaFilter[];
        localState.setValue(lastUndoneStack, [op, ...lastUndone]);
        localState.setValue(lastOperationStack, lastOperation);
      }
    }),
    redoBtn.onWithOff("click", () => {
      const lastUndone = [
        ...(localState.getValue(lastUndoneStack) as PicasaFilter[]),
      ];
      const op = lastUndone.shift();
      if (op) {
        const lastOperation = localState.getValue(
          lastOperationStack,
        ) as PicasaFilter[];
        localState.setValue(lastUndoneStack, lastUndone);
        localState.setValue(lastOperationStack, [op, ...lastOperation]);
        imageController.addOperation(op);
      }
    }),

    editorSelectionManager.events.on("activeChanged", async (event) => {
      updateStarCount(event.key);
    }),
    stripSelectionManager.events.on("activeChanged", (e) => {
      editorSelectionManager.clear();
      editorSelectionManager.select(e.key);
    }),
    appEvents.on("keyDown", ({ code, win, ctrl, key, preventDefault }) => {
      if (state.getValue("activeTab").win !== editor) return false;
      switch (code) {
        case "Space":
          preventDefault();
          toggleStar([editorSelectionManager.active()]);
          return true;
        case "ArrowLeft":
          preventDefault();
          stripSelectionManager.setActivePrevious();
          return true;
        case "ArrowRight":
          preventDefault();
          stripSelectionManager.setActiveNext();
          return true;
        case "Escape":
          preventDefault();
          appEvents.emit("returnToBrowser");
          return true;
      }
      if (ctrl) {
        preventDefault();
        getService().then(async (s) => {
          const shortcuts = await s.getShortcuts();
          if (shortcuts[key]) {
            const target = shortcuts[key];
            s.createJob(JOBNAMES.EXPORT, {
              source: editorSelectionManager.selected(),
              destination: target,
            });
          }
        });
        return true;
      }

      return false;
    }),
    s.on(
      "albumEntryAspectChanged",
      async (e: { payload: AlbumEntryPicasa }) => {
        if (!editorSelectionManager.active()) {
          return;
        }
        if (
          compareAlbumEntry(e.payload, editorSelectionManager.active()) === 0
        ) {
          updateStarCount(e.payload);
        }
      },
    ),
    appEvents.on("tabDeleted", ({ win }) => {
      if (win.is(editor)) {
        off.forEach((o) => o());
      }
    }),
    editorSelectionManager.events.on("activeChanged", (e) => {
      if (e?.key) tabEvent.emit("rename", { name: e.key.name });
    }),
  ];

  /*const z = $(".zoom-ctrl", tool);
  z.on("input", () => {
    imageController.zoom(z.val() / 10);
  });
  imageController.events.on("zoom", (zoom) => {
    z.val(zoom.scale * 10);
  });
  */
  const tab = makeGenericTab(tabEvent);
  updateEditorSize();
  localState.setValue(lastOperationStack, []);
  localState.setValue(lastUndoneStack, []);
  stripSelectionManager.setActive(entry);
  return {
    win: editor,
    tab,
    selectionManager: editorSelectionManager,
  };
}

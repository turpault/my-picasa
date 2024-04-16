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
import { AlbumEntrySelectionManager } from "../selection/selection-manager";
import { AppEventSource } from "../uiTypes";
import { ImageController } from "./image-controller";
import { t } from "./strings";
import { makeTools } from "./tools";

import { PicasaFilter, compareAlbumEntry } from "../../shared/lib/utils";
import { setupCrop } from "../features/crop";
import { State } from "../lib/state";
import { makeEditorHeader } from "./editor-header";
import { makeHistogram } from "./histogram";
import { ApplicationState } from "./selection-meta";
import { ToolEditor } from "./tool-editor";
import { setupTilt } from "../features/tilt";
import { setupBlur } from "../features/blur";
import { setupBrightness } from "../features/brightness";
import { setupFill } from "../features/fill";
import { setupPolaroid } from "../features/polaroid";
import { setupSharpen } from "../features/sharpen";
import { setupFilters } from "../features/filter";

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

export async function makeEditorPage(
  appEvents: AppEventSource,
  selectionManager: AlbumEntrySelectionManager,
  state: ApplicationState
) {
  const editor = $(editHTML);
  editor.hide();
  const editorControls = $(".editor-controls", editor);

  const image = $(".edited-image", editor);
  const video = $(".edited-video", editor);
  const imageContainer = $(".image-container", editor);
  const pages = editor.all(".tools-tab-page");
  const [wrench, contrast, brush, greenBrush, blueBrush] = pages;
  //const tool = $(toolsHTML);
  //const metadata = $(".metadata", editor);
  const histogram = $(".histogram", editor);
  //const identify = $(".identify", editor);
  //const album = $(".album-contents", editor);

  const editorSelectionManager = selectionManager.clone();
  editorSelectionManager.events.on("activeChanged", (event) => {
    selectionManager.select(event.key);
    selectionManager.setActive(event.key);
  });

  const editorHeader = makeEditorHeader(appEvents, editorSelectionManager);

  editor.append(editorHeader);

  function updateEditorSize() {
    const metaVisible = state.getValue("META_PAGE") !== undefined;
    $(".image-container", editor).css({
      right: metaVisible ? "300px" : 0,
    });
  }

  state.events.on("META_PAGE", updateEditorSize);
  updateEditorSize();

  //album.append(tool);

  const refreshTab = () => {
    pages.forEach((page, index) =>
      page.show(index === parseInt(tabBar.attr("selected")))
    );
  };
  const tabBar = $(".tools-tab-bar-buttons", editor).on("click", refreshTab);
  refreshTab();

  const imageController = new ImageController(
    image,
    video,
    editorSelectionManager
  );
  const toolRegistrar = makeTools(
    editor,
    { wrench, contrast, brush, greenBrush, blueBrush },
    imageController
  );
  const toolEditor = new ToolEditor(false, editorControls, imageContainer);

  // Add all the activable features
  setupCrop(imageContainer, imageController, toolRegistrar, toolEditor);
  setupTilt(imageContainer, imageController, toolRegistrar, toolEditor);
  setupBrightness(imageController, toolRegistrar, toolEditor);
  setupAutocolor(imageController, toolRegistrar, toolEditor);
  setupBW(imageController, toolRegistrar, toolEditor);
  setupContrast(imageController, toolRegistrar, toolEditor);
  setupFill(imageController, toolRegistrar, toolEditor);
  setupSepia(imageController, toolRegistrar, toolEditor);
  setupPolaroid(imageController, toolRegistrar, toolEditor);
  setupFlip(imageController, toolRegistrar, toolEditor);
  setupMirror(imageController, toolRegistrar, toolEditor);
  setupBlur(imageController, toolRegistrar, toolEditor);
  setupSharpen(imageController, toolRegistrar, toolEditor);
  setupFilters(imageController, toolRegistrar, toolEditor);
  //const refreshMetadataFct = makeMetadata(metadata);
  //makeIdentify(identify, imageController);
  const refreshHistogramFct = makeHistogram(histogram);

  const s = await getService();
  const undoBtn = $(".tools-bar-undo", editor);
  const redoBtn = $(".tools-bar-redo", editor);
  const localState = new State();
  localState.setValue("lastUndone", undefined);
  localState.setValue("lastOperation", undefined);

  const updateStarCount = async (entry: AlbumEntry) => {
    const s = await getService();
    const metadata = entry ? await s.getAlbumEntryMetadata(entry) : {};
    $(".star", imageContainer).css({
      display: metadata.star ? "" : "none",
      width: `${parseInt(metadata.starCount || "1") * 40}px`,
    });
  };
  let editing = false;

  const off = [
    imageController.events.on("idle", () => {
      $(".busy-spinner", editor).css("display", "none");
    }),
    imageController.events.on("busy", () => {
      $(".busy-spinner", editor).css("display", "block");
    }),
    imageController.events.on("visible", async ({ info, entry }) => {
      //refreshMetadataFct(entry, [entry], info);
    }),

    imageController.events.on("updated", async ({}) => {
      refreshHistogramFct(await imageController.getLiveThumbnailContext());
      const operations = [...imageController.operations()];
      const lastOperation = operations.pop();
      redoBtn.hide();
      localState.setValue("lastOperation", lastOperation);
    }),
    localState.events.on(
      "lastOperation",
      (lastOperation: PicasaFilter | undefined) => {
        undoBtn.addRemoveClass("disabled", !lastOperation);
        if (lastOperation) {
          const tool = toolRegistrar.tool(lastOperation.name);
          const toolName = tool ? tool.displayName : lastOperation.name;
          undoBtn.text(`${t("Undo")} ${toolName}`);
        } else {
          undoBtn.text(`${t("Undo")}`);
        }
      }
    ),
    localState.events.on(
      "lastUndone",
      (lastUndone: PicasaFilter | undefined) => {
        redoBtn.addRemoveClass("disabled", !lastUndone);
        if (lastUndone) {
          const tool = toolRegistrar.tool(lastUndone.name);
          const toolName = tool ? tool.displayName : lastUndone.name;
          redoBtn.text(`${t("Redo")} ${toolName}`);
          redoBtn.show();
        } else {
          redoBtn.hide();
        }
      }
    ),
    undoBtn.on("click", () => {
      const lastOperation = localState.getValue("lastOperation");
      if (lastOperation) {
        imageController.deleteOperation(lastOperation.name);
        localState.setValue("lastUndone", lastOperation);
      }
    }),
    redoBtn.on("click", () => {
      const lastUndone = localState.getValue("lastUndone") as PicasaFilter;
      if (lastUndone) {
        imageController.addOperation(lastUndone);
        localState.setValue("lastUndone", undefined);
      }
    }),

    editorSelectionManager.events.on("activeChanged", async (event) => {
      updateStarCount(event.key);
    }),
    appEvents.on("edit", async (event) => {
      if (event.active) {
        editing = true;
        state.setValue("META_SINGLE_SELECTION_MODE", true);

        if (selectionManager.selected().length === 1) {
          // Create a new selection manager with the current album
          const active = selectionManager.active();
          const album = active.album;
          s.media(album).then((e: { entries: AlbumEntry[] }) => {
            editorSelectionManager.setSelection(e.entries, active);
          });
        } else {
          editorSelectionManager.setSelection(
            selectionManager.selected(),
            selectionManager.active()
          );
        }
        editor.show();
        imageController.show();
      } else {
        editing = false;
        editor.hide();
        imageController.hide();
        state.setValue("META_SINGLE_SELECTION_MODE", false);
      }
    }),
    appEvents.on("keyDown", ({ code, win, ctrl, key, preventDefault }) => {
      if (editing) {
        switch (code) {
          case "Space":
            preventDefault();
            toggleStar([selectionManager.active()]);
            return true;
          case "ArrowLeft":
            preventDefault();
            editorSelectionManager.setActivePrevious();
            return true;
          case "ArrowRight":
            preventDefault();
            editorSelectionManager.setActiveNext();
            return true;
          case "Escape":
            preventDefault();
            appEvents.emit("edit", {
              active: false,
            });
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
      }
      return false;
    }),

    s.on(
      "albumEntryAspectChanged",
      async (e: { payload: AlbumEntryPicasa }) => {
        if(!editorSelectionManager.active()) {
          return;
        }
        if (
          compareAlbumEntry(e.payload, editorSelectionManager.active()) === 0
        ) {
          updateStarCount(e.payload);
        }
      }
    ),
  ];
  /*const z = $(".zoom-ctrl", tool);
  z.on("input", () => {
    imageController.zoom(z.val() / 10);
  });
  imageController.events.on("zoom", (zoom) => {
    z.val(zoom.scale * 10);
  });
  */
  return editor;
}

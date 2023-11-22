import {
  AlbumEntry,
  AlbumEntryPicasa,
  JOBNAMES,
} from "../../shared/types/types";
import { setupAutocolor } from "../features/autocolor";
import { setupBlur } from "../features/blur";
import { setupBrightness } from "../features/brightness";
import { setupBW } from "../features/bw";
import { setupContrast } from "../features/contrast";
import { setupCrop } from "../features/crop";
import { setupFill } from "../features/fill";
import { setupFilters } from "../features/filter";
import { setupFlip } from "../features/flip";
import { setupMirror } from "../features/mirror";
import { setupPolaroid } from "../features/polaroid";
import { setupRotate } from "../features/rotate";
import { setupSepia } from "../features/sepia";
import { setupSharpen } from "../features/sharpen";
import { setupTilt } from "../features/tilt";
import { $ } from "../lib/dom";
import { toggleStar } from "../lib/handles";
import { getService } from "../rpc/connect";
import { AlbumEntrySelectionManager } from "../selection/selection-manager";
import { AppEventSource } from "../uiTypes";
import { ImageController } from "./image-controller";
import { makeImageStrip } from "./image-strip";
import { makeMetadata } from "./metadata";
import { t } from "./strings";
import { deleteTabWin } from "./tabs";
import { GENERAL_TOOL_TAB, makeTools } from "./tools";

import { compareAlbumEntry } from "../../shared/lib/utils";
import { makeEditorHeader } from "./editor-header";
import { makeHistogram } from "./histogram";
import { makeIdentify } from "./identify";

const editHTML = `
<div class="fill editor-page">
  <div class="fill tools">
    <div class="tools-tab-bar">
      <picasa-multi-button class="tools-tab-bar-buttons" items="url:resources/images/wrench.svg|url:resources/images/contrast.svg|url:resources/images/brush.svg|url:resources/images/green-brush.svg|url:resources/images/blue-brush.svg"></picasa-button>
    </div>
    <div class="tools-tab-contents">
      <div page="1" class="tools-tab-page tools-tab-page-wrench"></div>
      <div page="2" class="tools-tab-page tools-tab-page-contrast"></div>
      <div page="3" class="tools-tab-page tools-tab-page-brush"></div>
      <div page="4" class="tools-tab-page tools-tab-page-green-brush"></div>
      <div page="5" class="tools-tab-page tools-tab-page-blue-brush"></div>
    </div>
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
  selectionManager: AlbumEntrySelectionManager
) {
  const editor = $(editHTML);
  editor.hide();

  const image = $(".edited-image", editor);
  const video = $(".edited-video", editor);
  const imageContainer = $(".image-container", editor);
  const [wrench, contrast, brush, greenBrush, blueBrush] = editor.all(
    ".tools-tab-page"
  );
  //const tool = $(toolsHTML);
  //const metadata = $(".metadata", editor);
  const histogram = $(".histogram", editor);
  //const identify = $(".identify", editor);
  //const album = $(".album-contents", editor);
  const editorHeader = makeEditorHeader(selectionManager);
  editor.append(editorHeader);
  //album.append(tool);

  const imageController = new ImageController(image, video, selectionManager);
  const toolRegistrar = makeTools(
    { editor, wrench, contrast, brush, greenBrush, blueBrush },
    imageController
  );
  // Add all the activable features
  setupCrop(imageContainer, imageController, toolRegistrar);
  setupTilt(imageContainer, imageController, toolRegistrar);
  setupBrightness(imageController, toolRegistrar);
  setupAutocolor(imageController, toolRegistrar);
  setupBW(imageController, toolRegistrar);
  setupContrast(imageController, toolRegistrar);
  setupFill(imageController, toolRegistrar);
  setupSepia(imageController, toolRegistrar);
  setupPolaroid(imageController, toolRegistrar);
  setupRotate(imageController, toolRegistrar);
  setupFlip(imageController, toolRegistrar);
  setupMirror(imageController, toolRegistrar);
  setupBlur(imageController, toolRegistrar);
  setupSharpen(imageController, toolRegistrar);
  setupFilters(imageController, toolRegistrar);

  toolRegistrar.selectPage(GENERAL_TOOL_TAB);
  //const refreshMetadataFct = makeMetadata(metadata);
  //makeIdentify(identify, imageController);
  const refreshHistogramFct = makeHistogram(histogram);

  const s = await getService();

  const updateStarCount = async (entry: AlbumEntry) => {
    const s = await getService();
    const metadata = await s.getAlbumEntryMetadata(entry);
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

    imageController.events.on("updated", async ({ liveContext }) => {
      refreshHistogramFct(liveContext);
    }),

    selectionManager.events.on("activeChanged", async (event) => {
      updateStarCount(event.key);
    }),
    appEvents.on("edit", (event) => {
      if (event.active) {
        editing = true;
        editor.show();
        imageController.show();
      } else {
        editing = false;
        editor.hide();
        imageController.hide();
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
            selectionManager.setActivePrevious();
            return true;
          case "ArrowRight":
            preventDefault();
            selectionManager.setActiveNext();
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
                source: selectionManager.selected(),
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
        if (compareAlbumEntry(e.payload, selectionManager.active()) === 0) {
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

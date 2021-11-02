import { ImageController } from "./components/image-controller.js";
import { make } from "./components/image-strip.js";
import { make as makeTools } from "./components/tools.js";
import { setupAutocolor } from "./features/autocolor.js";
import { setupBrightness } from "./features/brightness.js";
import { setupCrop } from "./features/crop.js";
import { setupFlip } from "./features/flip.js";
import { setupMirror } from "./features/mirror.js";
import { setupPolaroid } from "./features/polaroid.js";
import { setupRotate } from "./features/rotate.js";
import { setupSepia } from "./features/sepia.js";
import { subFolder } from "./folder-monitor.js";
import { getFolderInfoFromHandle } from "./folder-utils.js";
import { $ } from "./lib/dom.js";
import { ImagePanZoomController } from "./lib/panzoom.js";
import { ActiveImageManager } from "./selection/active-manager.js";
import { FolderInfo } from "../shared/types/types.js";

let root: any;
async function init() {
  /*
  if (!root) {
    root = await get("root");
  }

  $("#request-permissions").on("click", async () => {
    $("#permission").css("display", "none");
    await root.requestPermission({ mode: "readwrite" });
    init();
  });
  if ((await root.queryPermission({ mode: "readwrite" })) !== "granted") {
    $("#permission").css("display", "block");
  }
  */

  const image = $("#edited-image").get()!;

  const hash = decodeURIComponent(location.hash).replace("#", "");

  const { folder, name } = await subFolder(hash);

  const zoomController = new ImagePanZoomController(image as HTMLImageElement);
  const imageController = new ImageController(
    image as HTMLImageElement,
    zoomController
  );
  const toolRegistrar = makeTools($("#tools").get()!, imageController);
  // Add all the activable features
  setupCrop(zoomController, imageController, toolRegistrar);
  setupBrightness(imageController, toolRegistrar);
  setupSepia(imageController, toolRegistrar);
  setupAutocolor(imageController, toolRegistrar);
  setupPolaroid(imageController, toolRegistrar);
  setupRotate(imageController, toolRegistrar);
  setupFlip(imageController, toolRegistrar);
  setupMirror(imageController, toolRegistrar);

  const f: FolderInfo = await getFolderInfoFromHandle(folder);
  const activeManager = new ActiveImageManager(f.pictures, name);
  make($("#image-strip").get()!, f, activeManager);
  hotkeySetup();

  imageController.init(folder, name);

  activeManager.event.on("changed", (event: { name: string }) => {
    imageController.display(event.name);
  });
  imageController.events.on("idle", () => {
    $("#busy-spinner").css("display", "none");
  });
  imageController.events.on("busy", () => {
    $("#busy-spinner").css("display", "block");
  });
}

window.addEventListener("load", () => {
  init();
});

function hotkeySetup() {
  document.onkeyup = function (e) {
    // alert(e.key);
  };
}

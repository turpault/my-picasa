import { ImageController } from "./components/image-controller.js";
import { make } from "./components/image-strip.js";
import { make as makeTools, ToolRegistrar } from "./components/tools.js";
import { setupCrop } from "./features/crop.js";
import { setupPolaroid } from "./features/polaroid.js";
import { setupSepia } from "./features/sepia.js";
import { subFolder } from "./folder-monitor.js";
import { getFolderInfoFromHandle } from "./folder-utils.js";
import { get } from "./lib/idb-keyval.js";
import { jBone as $ } from "./lib/jbone/jbone.js";
import { ImagePanZoomController } from "./lib/panzoom.js";
import { ActiveImageManager } from "./selection/active-manager.js";
import { Folder, FolderInfo } from "./types/types.js";

let root: any;
async function init() {
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
  const canvas = $("#edited-image")[0];

  const hash = decodeURIComponent(location.hash).replace("#", "");

  const { folder, name } = await subFolder(root, hash);

  const zoomController = new ImagePanZoomController(canvas);
  const imageController = new ImageController(canvas, zoomController);
  const toolRegistrar = makeTools($("#tools")[0], imageController);
  // Add all the activable features
  setupCrop(zoomController, imageController, toolRegistrar);
  setupSepia(imageController, toolRegistrar);
  setupPolaroid(imageController, toolRegistrar);

  const f: FolderInfo = await getFolderInfoFromHandle(folder);
  const activeManager = new ActiveImageManager(Object.keys(f.pixels), name);
  make($("#image-strip")[0], f, activeManager);
  hotkeySetup();

  imageController.init(folder, name);

  activeManager.event.on("changed", (event: { name: string }) => {
    imageController.display(event.name);
  });
}

window.addEventListener("load", () => {
  init();
});

function hotkeySetup() {
  document.onkeyup = function (e) {
    alert(e.key);
  };
}

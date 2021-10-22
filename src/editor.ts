import { ImageController } from "./components/image-controller.js";
import { make as makeTools } from "./components/tools.js";
import { subFolder } from "./folder-monitor.js";
import { get } from "./lib/idb-keyval.js";
import { jBone as $ } from "./lib/jbone/jbone.js";

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

  const imageController = new ImageController(canvas, folder, name);
  makeTools($("#tools")[0], imageController);

  $("#btn-sepia").on("click", async () => {
    imageController.addSepia();
  });
}

window.addEventListener("load", () => {
  init();
});

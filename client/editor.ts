import { makeEditorPage } from "./components/editor-page.js";
import { __ } from "./lib/dom.js";
import { albumEntryFromId } from "./lib/utils.js";

async function init() {
  const hash = decodeURIComponent(location.hash).replace("#", "");
  const { album, name } = albumEntryFromId(hash);

  const editor = await makeEditorPage(album, name);
  __("body").append(editor);
}

window.addEventListener("load", () => {
  init();
});

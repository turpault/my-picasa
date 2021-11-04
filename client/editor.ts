import { makeEditorPage } from "./components/editor-page.js";
import { $ } from "./lib/dom.js";
import { albumEntryFromId } from "./lib/utils.js";

async function init() {
  const hash = decodeURIComponent(location.hash).replace("#", "");
  const { album, name } = albumEntryFromId(hash);

  const editor = await makeEditorPage(album, name);
  $("body").append(editor);
}

window.addEventListener("load", () => {
  init();
});

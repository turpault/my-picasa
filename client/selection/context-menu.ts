import { question } from "../components/question";
import { __ } from "../lib/dom";
import { getService } from "../rpc/connect";
import { Album } from "../types/types";
import { SelectionManager } from "./selection-manager";

export function makeDropDown() {
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const menu = __(`<div class="context-menu">
    </div>`);
    if (SelectionManager.get().selected().length) {
      menu.append(
        __(
          `<div>Move ${
            SelectionManager.get().selected().length
          } photos in a new Album...`
        ).on("click", moveSelectionInNewAlbum)
      );
      menu.append(
        __(
          `<div>Duplicate ${SelectionManager.get().selected().length} photos`
        ).on("click", duplicateSelection)
      );
      menu.append(
        __(`<div>Delete ${SelectionManager.get().selected().length} photos`).on(
          "click",
          deleteSelection
        )
      );
    }
    menu.append(__(`<div>Select album`).on("click", selectAlbum));
    menu.append(__(`<div>Open in Finder`).on("click", openInFinder));
    menu.css({
      top: `${e.clientX}px`,
      left: `${e.clientY}px`,
    });
    __(document.body).append(menu);
  });
}

async function moveSelectionInNewAlbum() {
  const newAlbum = await question(
    "New album name",
    "Please type the new album name"
  );
  if (newAlbum) {
    const s = await getService();
    const a: Album = await s.makeAlbum(newAlbum);
    s.createJob("move", {
      source: SelectionManager.get().selected(),
      destination: a.key,
    });
    SelectionManager.get().clear();
  }
}

async function duplicateSelection() {
  const s = await getService();
  s.createJob("duplicate", {
    source: SelectionManager.get().selected(),
  });
}

async function deleteSelection() {}

async function selectAlbum() {}
async function openInFinder() {}

import { question } from "../components/question";
import { $ } from "../lib/dom";
import { getService } from "../rpc/connect";
import { Album, JOBNAMES } from "../../shared/types/types";
import { SelectionManager } from "./selection-manager";

export function makeDropDownContextMenu(selectionManager:SelectionManager) {
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const menu = $(`<div class="context-menu">
    </div>`);
    if (selectionManager.selected().length) {
      menu.append(
        $(
          `<div>Move ${
            selectionManager.selected().length
          } photos in a new Album...`
        ).on("click", ()=>moveSelectionInNewAlbum(selectionManager))
      );
      menu.append(
        $(
          `<div>Duplicate ${selectionManager.selected().length} photos`
        ).on("click", ()=>duplicateSelection(selectionManager))
      );
      menu.append(
        $(`<div>Delete ${selectionManager.selected().length} photos`).on(
          "click",
          deleteSelection
        )
      );
    }
    menu.append($(`<div>Select album`).on("click", selectAlbum));
    menu.append($(`<div>Open in Finder`).on("click", openInFinder));
    menu.css({
      top: `${e.clientX}px`,
      left: `${e.clientY}px`,
    });
    $(document.body).append(menu);
  });
}

async function moveSelectionInNewAlbum(selectionManager:SelectionManager) {
  const newAlbum = await question(
    "New album name",
    "Please type the new album name"
  );
  if (newAlbum) {
    const s = await getService();
    const a: Album = await s.makeAlbum(newAlbum);
    s.createJob(JOBNAMES.MOVE, {
      source: selectionManager.selected(),
      destination: a,
    });
    selectionManager.clear();
  }
}

async function duplicateSelection(selectionManager:SelectionManager) {
  const s = await getService();
  s.createJob(JOBNAMES.DUPLICATE, {
    source: selectionManager.selected(),
  });
}

async function deleteSelection() {}

async function selectAlbum() {}
async function openInFinder() {}

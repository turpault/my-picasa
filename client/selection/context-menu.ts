import { question } from "../components/question";
import { $ } from "../lib/dom";
import { getService } from "../rpc/connect";
import { Album, JOBNAMES } from "../../shared/types/types";
import { SelectionManager } from "./selection-manager";

export function makeDropDown() {
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const menu = $(`<div class="context-menu">
    </div>`);
    if (SelectionManager.get().selected().length) {
      menu.append(
        $(
          `<div>Move ${
            SelectionManager.get().selected().length
          } photos in a new Album...`
        ).on("click", moveSelectionInNewAlbum)
      );
      menu.append(
        $(
          `<div>Duplicate ${SelectionManager.get().selected().length} photos`
        ).on("click", duplicateSelection)
      );
      menu.append(
        $(`<div>Delete ${SelectionManager.get().selected().length} photos`).on(
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

async function moveSelectionInNewAlbum() {
  const newAlbum = await question(
    "New album name",
    "Please type the new album name"
  );
  if (newAlbum) {
    const s = await getService();
    const a: Album = await s.makeAlbum(newAlbum);
    s.createJob(JOBNAMES.MOVE, {
      source: SelectionManager.get().selected(),
      destination: a.key,
    });
    SelectionManager.get().clear();
  }
}

async function duplicateSelection() {
  const s = await getService();
  s.createJob(JOBNAMES.DUPLICATE, {
    source: SelectionManager.get().selected(),
  });
}

async function deleteSelection() {}

async function selectAlbum() {}
async function openInFinder() {}

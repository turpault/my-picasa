import { SelectionManager } from "../selection/selection-manager.js";
import { Folder } from "../../shared/types/types.js";
import { thumbnailUrl } from "../imageProcess/client.js";
import { $ } from "../lib/dom.js";

export function makeThumbnail(): HTMLElement {
  const e = $(document.createElement("span") as HTMLImageElement);
  e.addClass("thumbnail w3-button w3-ripple");
  e.attr("draggable", "true");
  e.on("dragstart", thumbnailDragged);
  e.on("click", thumbnailClicked);
  e.on("dblclick", thumbnailDblClicked);
  return e.get();
}

function thumbnailDragged(e: any /* BoneEvent*/) {
  SelectionManager.get().select(e.target.id);
  e.dataTransfer.effectAllowed = "move";
  e.preventDefault();
}

function thumbnailClicked(e: any /* BoneEvent*/) {
  // Update selected status
  if (!e.shiftKey) {
    SelectionManager.get().clear();
  }
  SelectionManager.get().select(e.target.id);
}

function thumbnailDblClicked(e: any /* BoneEvent*/) {
  window.open(`edit.html#${e.target.id}`, "_blank");
}

SelectionManager.get().events.on("added", ({ key }) => {
  $("#" + key).addClass("selected");
});
SelectionManager.get().events.on("removed", ({ key }) => {
  $("#" + key).removeClass("selected");
});

export function thumbnailData(
  e: HTMLElement,
  f: Folder,
  name: string,
  id: string
) {
  e.id = id;
  e.style.backgroundImage = 'url("resources/images/loading250.gif")';
  thumbnailUrl(f.handle.path(), name).then((img) => {
    if (e.id === id) {
      e.style.backgroundImage = `url("${img}")`;
    }
  });
  return e;
}

export function emptyPlaceHolder(domElement: HTMLElement) {
  makeNThumbnails(domElement, 1);
  const first = domElement.childNodes[0] as HTMLImageElement;
  first.src = "resources/images/loading250.gif";
}

export function makeNThumbnails(domElement: HTMLElement, count: number) {
  while (domElement.children.length < count) {
    domElement.appendChild(makeThumbnail());
  }
  for (let i = 0; i < domElement.children.length; i++) {
    (domElement.children[i] as HTMLImageElement).style.display =
      i < count ? "" : "none";
  }
}

import { thumbnail } from "../folder-utils.js";
import { jBone as $ } from "../lib/jbone/jbone.js";
import { SelectionManager } from "../selection/selection-manager.js";
import { Folder } from "../types/types.js";

export function makeThumbnail(): HTMLElement {
  const e = $(document.createElement("span") as HTMLImageElement);
  e.addClass("thumbnail w3-button w3-ripple");
  e.attr("draggable", "true");
  e.on("ondragstart", thumbnailDragged);
  e.on("click", thumbnailClicked);
  e.on("dblclick", thumbnailDblClicked);
  return e[0];
}

function thumbnailDragged(e: any /* BoneEvent*/) {
  e.originalEvent.dataTransfer.effectAllowed = "copyMove";
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
  $(document.getElementById(key)).addClass("selected");
});
SelectionManager.get().events.on("removed", ({ key }) => {
  $(document.getElementById(key)).removeClass("selected");
});

export function thumbnailData(
  e: HTMLElement,
  f: Folder,
  name: string,
  id: string
) {
  e.id = id;
  e.style.backgroundImage = "url(resources/images/loading250.gif";
  thumbnail(f, name).then((img) => {
    if (e.id === id) {
      e.style.backgroundImage = `url(${img})`;
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

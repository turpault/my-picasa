import { makeNThumbnails } from "./components/thumbnail.js";
import { Folder } from "./types/types.js";

export function folder(f: Folder): HTMLElement {
  const e = document.createElement("li");
  e.innerText = f.name;
  e.id = "folder:" + f.key;

  return e;
}
export function folderByElement(
  e: HTMLElement,
  folders: Folder[]
): { index: number; folder: Folder } | undefined {
  const k = e.id.split(":").slice(1).join(":");
  for (let f = 0; f < folders.length; f++) {
    if (folders[f].key == k) {
      return {
        index: f,
        folder: folders[f],
      };
    }
  }
  return undefined;
}

export function picture(): HTMLImageElement {
  const e = document.createElement("img") as HTMLImageElement;
  e.className = "thumbnail";
  return e;
}

export function loadMore(domElement: HTMLElement) {
  makeNThumbnails(domElement, 1);
  const first = domElement.childNodes[0] as HTMLImageElement;
  first.src = "resources/images/loading250.gif";
}

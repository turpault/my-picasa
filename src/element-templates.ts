import { Folder } from "./folder-monitor.js";

export function folder(f: Folder): HTMLElement {
  const e = document.createElement("li");
  e.innerText = f.name;
  e.id = "folder:" + f.key;

  return e;
}
export function folderByElement(
  e: HTMLElement,
  folders: Folder[]
): Folder | undefined {
  const k = e.id.split(":").slice(1).join(":");
  return folders.find((f) => (f.key = k));
}

export function picture(): HTMLImageElement {
  const e = document.createElement("img") as HTMLImageElement;
  e.className = "thumbnail";
  return e;
}

export function emptyPlaceHolder(domElement: HTMLElement) {
  makeNThumbnails(domElement, 1);
  const first = domElement.childNodes[0] as HTMLImageElement;
  first.src = "resources/images/loading250.gif";
}

export function makeNThumbnails(domElement: HTMLElement, count: number) {
  while (domElement.children.length < count) {
    domElement.appendChild(picture());
  }
  for (let i = 0; i < domElement.children.length; i++) {
    (domElement.children[i] as HTMLImageElement).style.display =
      i < count ? "" : "none";
  }
}

export function loadMore(domElement: HTMLElement) {
  makeNThumbnails(domElement, 1);
  const first = domElement.childNodes[0] as HTMLImageElement;
  first.src = "resources/images/loading250.gif";
}

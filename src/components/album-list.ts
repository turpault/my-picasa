import { folder, folderByElement } from "../element-templates.js";
import { Folder, FolderMonitor } from "../folder-monitor.js";

export function make(folders: HTMLElement, monitor: FolderMonitor) {
  monitor.events.on("added", (event: { folder: Folder; index: number }) => {
    const before =
      event.index < folders.childNodes.length
        ? folders.childNodes.item(event.index + 1)
        : undefined;
    const node = folder(event.folder);
    if (before) {
      folders.insertBefore(node, before);
    } else {
      folders.appendChild(node);
    }
  });
  folders.addEventListener("click", function (ev: MouseEvent) {
    const folder = folderByElement(
      ev.target as HTMLElement,
      monitor.folders.array
    );
  });
}

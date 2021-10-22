import { folder, folderByElement } from "../element-templates.js";
import { FolderMonitor } from "../folder-monitor.js";
import { buildEmitter } from "../lib/event.js";
import { jBone as $ } from "../lib/jbone/jbone.js";
import {
  AlbumListEvent,
  AlbumListEventSource,
  Folder,
} from "../types/types.js";

export function make(
  folders: HTMLElement,
  monitor: FolderMonitor
): AlbumListEventSource {
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
  const emitter = buildEmitter<AlbumListEvent>();
  const e = $(folders);
  e.on("click", function (ev: MouseEvent) {
    const clicked = folderByElement(
      ev.target as HTMLElement,
      monitor.folders.array
    )!;
    emitter.emit("selected", clicked);
  });
  e.on("dragover", (e: any) => {
    e.preventDefault();
  });
  e.on("drop", (e: any) => {
    debugger;
  });
  return emitter;
}

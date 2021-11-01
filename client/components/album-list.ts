import { folder, folderByElement } from "../element-templates.js";
import { FolderMonitor } from "../folder-monitor.js";
import { buildEmitter } from "../../shared/lib/event.js";
import { jBone as $ } from "../lib/jbone/jbone.js";
import { SelectionManager } from "../selection/selection-manager.js";
import {
  AlbumListEvent,
  AlbumListEventSource,
  Folder,
} from "../../shared/types/types.js";

export function make(
  folders: HTMLElement,
  monitor: FolderMonitor
): AlbumListEventSource {
  monitor.events.on("updated", (event: { folders: Folder[] }) => {
    const e = $(folders);
    e.empty();
    for (const aFolder of event.folders) {
      const node = folder(aFolder);
      folders.appendChild(node);
    }
  });
  const emitter = buildEmitter<AlbumListEvent>();
  const e = $(folders);
  e.on("click", function (ev: MouseEvent) {
    const clicked = folderByElement(ev.target as HTMLElement, monitor.folders)!;
    emitter.emit("selected", clicked);
  });
  e.on("dragover", (ev: any) => {
    ev.preventDefault();
  });
  e.on("dragenter", (ev: any) => {
    $(ev.target).addClass("drop-area");
    ev.preventDefault();
  });
  e.on("dragleave", (ev: any) => {
    $(ev.target).removeClass("drop-area");
    ev.preventDefault();
  });
  e.on("drop", (ev: any) => {
    const selection = SelectionManager.get().selected();
    const targetFolder = folderByElement(
      ev.target as HTMLElement,
      monitor.folders
    )!;
    fetch("/job", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        command: "move",
        source: selection,
        destination: targetFolder.folder.key,
      }),
    })
      .then((job) => job.json())
      .then((job) => {
        alert("Started " + job.id);
      });

    debugger;
  });
  return emitter;
}

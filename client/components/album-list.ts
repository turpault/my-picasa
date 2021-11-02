import { AlbumListEventSource, Folder } from "../../shared/types/types.js";
import {
  elementByFolder,
  folder,
  folderByElement,
} from "../element-templates.js";
import { FolderMonitor } from "../folder-monitor.js";
import { $ } from "../lib/dom.js";
import { getService } from "../rpc/connect.js";
import { SelectionManager } from "../selection/selection-manager.js";

export function make(
  folders: HTMLElement,
  monitor: FolderMonitor,
  emitter: AlbumListEventSource
) {
  let lastHighlight: any;
  emitter.on("scrolled", ({ folder: f }) => {
    if (lastHighlight) {
      lastHighlight.removeClass("highlight");
    }
    lastHighlight = $(elementByFolder(f));
    lastHighlight.addClass("highlight");
  });
  monitor.events.on("updated", (event: { folders: Folder[] }) => {
    const e = $(folders);
    e.empty();
    for (const aFolder of event.folders) {
      const node = folder(aFolder);
      folders.appendChild(node);
    }
  });
  const e = $(folders);
  e.on("click", function (ev): any {
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
  e.on("drop", async (ev: any) => {
    const selection = SelectionManager.get().selected();
    const targetFolder = folderByElement(
      ev.target as HTMLElement,
      monitor.folders
    )!;
    const s = await getService();
    const jobId = await s.service.createJob("move", {
      source: selection,
      destination: targetFolder.folder.key,
    });
    alert("Started " + jobId);
  });
}

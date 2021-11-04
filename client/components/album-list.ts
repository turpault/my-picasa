import { AlbumListEventSource, Album } from "../../shared/types/types.js";
import {
  elementByAlbum,
  folder,
  albumByElement,
} from "../element-templates.js";
import { FolderMonitor } from "../folder-monitor.js";
import { $ } from "../lib/dom.js";
import { albumFromId } from "../../shared/lib/utils.js";
import { getService } from "../rpc/connect.js";
import { SelectionManager } from "../selection/selection-manager.js";

export function makeAlbumList(
  folders: HTMLElement,
  monitor: FolderMonitor,
  emitter: AlbumListEventSource
) {
  let lastHighlight: any;
  emitter.on("scrolled", ({ album }) => {
    if (lastHighlight) {
      lastHighlight.removeClass("highlight");
    }
    lastHighlight = $(elementByAlbum(album));
    lastHighlight.addClass("highlight");
    lastHighlight.get().scrollIntoViewIfNeeded(false);
  });
  monitor.events.on("updated", (event: { folders: Album[] }) => {
    const e = $(folders);
    e.empty();
    for (const aFolder of event.folders) {
      const node = folder(aFolder);
      folders.appendChild(node);
    }
  });
  const e = $(folders);
  e.on("click", function (ev): any {
    const album = albumByElement(ev.target as HTMLElement)!;
    emitter.emit("selected", { album });
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
    const album = albumByElement(ev.target as HTMLElement)!;
    const s = await getService();
    const sels = selection
      .map(albumFromId)
      .map(({ key, name }) => key + "/" + name);

    const jobId = await s.createJob("move", {
      source: sels,
      destination: album.key,
    });
    alert("Started " + jobId);
  });
}

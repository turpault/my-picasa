import { Album, AlbumListEventSource } from "../../shared/types/types.js";
import {
  albumByElement,
  elementByAlbum,
  folder,
} from "../element-templates.js";
import { FolderMonitor } from "../folder-monitor.js";
import { __ } from "../lib/dom.js";
import { getService } from "../rpc/connect.js";
import { SelectionManager } from "../selection/selection-manager.js";

export function makeAlbumList(
  container: HTMLElement,
  monitor: FolderMonitor,
  events: AlbumListEventSource
) {
  let lastHighlight: any;
  const folders = __(".folders", container);
  events.on("scrolled", ({ album }) => {
    if (lastHighlight) {
      lastHighlight.removeClass("highlight-list");
    }
    lastHighlight = __(elementByAlbum(album));
    lastHighlight.addClass("highlight-list");
    lastHighlight.get().scrollIntoViewIfNeeded(false);
  });
  monitor.events.on("updated", (event: { folders: Album[] }) => {
    folders.empty();
    for (const aFolder of event.folders) {
      const node = folder(aFolder);
      folders.append(node);
    }
  });
  folders.on("click", function (ev): any {
    const album = albumByElement(ev.target as HTMLElement)!;
    events.emit("selected", { album });
  });
  folders.on("dragover", (ev: any) => {
    ev.preventDefault();
  });
  folders.on("dragenter", (ev: any) => {
    __(ev.target).addClass("drop-area");
    ev.preventDefault();
  });
  folders.on("dragleave", (ev: any) => {
    __(ev.target).removeClass("drop-area");
    ev.preventDefault();
  });
  folders.on("drop", async (ev: any) => {
    const selection = SelectionManager.get().selected();
    const album = albumByElement(ev.target as HTMLElement)!;
    const s = await getService();
    const sels = selection.map(({ album, name }) => album.key + "/" + name);

    const jobId = await s.createJob("move", {
      source: sels,
      destination: album.key,
    });
  });
  let processKeys = false;
  events.on("tabChanged", ({ win }) => {
    processKeys = win.get() === container;
  });
  events.on("keyDown", ({ code, tab }) => {
    switch (code) {
      case "Space":
      default:
    }
  });
}

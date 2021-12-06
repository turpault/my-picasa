import { Album, AlbumListEventSource } from "../../shared/types/types";
import { folder } from "../element-templates";
import { FolderMonitor } from "../folder-monitor";
import { $ } from "../lib/dom";
import {
  albumFromElement,
  elementFromAlbum,
  setIdForAlbum,
} from "../../shared/lib/utils";
import { getService } from "../rpc/connect";
import { SelectionManager } from "../selection/selection-manager";

const elementPrefix = "albumlist:";

export async function makeAlbumList(
  container: HTMLElement,
  monitor: FolderMonitor,
  events: AlbumListEventSource
) {
  let lastHighlight: any;
  const folders = $(".folders", container);
  events.on("scrolled", ({ album }) => {
    if (lastHighlight && lastHighlight.is()) {
      lastHighlight.removeClass("highlight-list");
    }
    lastHighlight = $(elementFromAlbum(album, elementPrefix)!);
    if (lastHighlight.is()) {
      lastHighlight.addClass("highlight-list");
      lastHighlight.get().scrollIntoViewIfNeeded(false);
    }
  });
  let firstInit = true;
  monitor.events.on("updated", (event: { folders: Album[] }) => {
    folders.empty();
    for (const aFolder of event.folders) {
      const node = folder(aFolder);
      setIdForAlbum(node, aFolder, elementPrefix);
      folders.append(node);
    }
    if (firstInit) {
      firstInit = false;
      events.emit("selected", { album: event.folders[0] });
    }
  });
  folders.on("click", function (ev): any {
    const album = albumFromElement(ev.target as HTMLElement, elementPrefix)!;
    events.emit("selected", { album });
  });
  folders.on("dragover", (ev: any) => {
    ev.preventDefault();
  });
  folders.on("dragenter", (ev: any) => {
    $(ev.target).addClass("drop-area");
    ev.preventDefault();
  });
  folders.on("dragleave", (ev: any) => {
    $(ev.target).removeClass("drop-area");
    ev.preventDefault();
  });
  folders.on("drop", async (ev: any) => {
    const selection = SelectionManager.get().selected();
    const album = albumFromElement(ev.target as HTMLElement, elementPrefix)!;
    const s = await getService();

    s.createJob("move", {
      source: selection,
      destination: album,
    });
    SelectionManager.get().clear();
  });
  let processKeys = false;
  events.on("tabChanged", ({ win }) => {
    processKeys = win.get() === container;
  });
  events.on("keyDown", ({ code, win }) => {
    switch (code) {
      case "Space":
      default:
    }
  });
  // Status change events
  const filter = $("#filterAlbum").on("input", () => {
    // Hide albums not matching the filter
    const expr = filter.val();
    for (const elem of folders.get().children) {
      $(elem as HTMLElement).css(
        "display",
        expr === "" ||
          albumFromElement(elem as HTMLElement, elementPrefix)!.name.includes(
            expr
          )
          ? "block"
          : "none"
      );
    }
  });

  const s = await getService();
  s.on("albumChanged", async (e: { payload: Album[] }) => {
    let refresh = false;
    for (const album of e.payload) {
      if (!elementFromAlbum(album, elementPrefix)) {
        refresh = true;
      }
    }
    if (refresh) {
      monitor.walk();
    }
  });
}

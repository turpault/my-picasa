import { uuid } from "../../shared/lib/utils";
import { Album, JOBNAMES, Node } from "../../shared/types/types";
import { AlbumIndexedDataSource } from "../album-data-source";
import {
  $,
  _$,
  albumFromElement,
  elementFromAlbum,
  setIdForAlbum,
} from "../lib/dom";
import { getService } from "../rpc/connect";
import { AlbumEntrySelectionManager } from "../selection/selection-manager";
import { AppEventSource } from "../uiTypes";

const elementPrefix = "albumlist:";
const html = `<div class="w3-theme fill folder-pane">
<div class="folders"></div>
</div>
`;

export async function makeAlbumList(
  appEvents: AppEventSource,
  albumDataSource: AlbumIndexedDataSource,
  selectionManager: AlbumEntrySelectionManager
) {
  const container = $(html);

  let lastHighlight: any;
  let filter = "";
  const folders = $(".folders", container);
  const events = albumDataSource.emitter;
  let lastSelectedAlbum: Album | undefined;
  const id = uuid();

  function setElementNodeId(node: Node, elem: _$) {
    elem.id(`${node.name}|${id}`);
  }
  function getElementFromNode(node: Node) {
    return $(`#${node.name}|${id}`);
  }

  function renderNode(node: Node, indent: number = 0) {
    const e = $(
      `
      <div class="folder-row ${node.collapsed ? "folder-collapsed" : ""}">
        <div class="browser-list-head browser-list-head-${indent}">${
        node.name
      }</div>
        <div class="browser-list-albums"></div>
      </div>`
    );
    setElementNodeId(node, e);
    $(".browser-list-head", e).attachData({ node });
    $(e).attachData({ indent });
    const container = $(".browser-list-albums", e);
    for (const album of node.albums) {
      const label = `${
        album.shortcut
          ? String.fromCharCode(0x245f + parseInt(album.shortcut)) + " "
          : ""
      }${album.name}`;
      const renderedAlbum = $(
        `
        <div class="browser-list-text">
        <span class="browser-list-count"/>${album.count}</span>
        <div class="browser-list-label">${label}</div>
        </div>`
      );
      setIdForAlbum(renderedAlbum, album, elementPrefix);
      container.append(renderedAlbum);
    }
    if (node.childs.length > 0) renderNodes(node.childs, e, indent + 1);
    return e;
  }

  function renderNodes(nodes: Node[], folders: _$, indent: number = 0): _$ {
    for (const node of nodes) {
      const item = renderNode(node, indent);
      folders.append(item);
    }
    return folders;
  }
  addListeners(container);

  container.attachData({
    events: [
      events.on("scrolled", ({ album }) => {
        lastSelectedAlbum = album;
        if (lastHighlight && lastHighlight.exists()) {
          lastHighlight.removeClass("highlight-list");
        }
        lastHighlight = elementFromAlbum(album, elementPrefix);
        if (lastHighlight.exists()) {
          lastHighlight.addClass("highlight-list");
          lastHighlight.get().scrollIntoViewIfNeeded(false);
        }
      }),
      events.on("filterChanged", (event) => {
        filter = event.filter;
        albumDataSource.setFilter(filter);
      }),

      events.on("reset", (_event) => {
        folders.empty();
        renderNodes(albumDataSource.getHierarchy().childs, folders);
      }),

      events.on("nodeChanged", (event) => {
        const node = event.node;
        const original = getElementFromNode(node);
        if (!original) return;
        const indent = original.getData().indent;
        const n = renderNode(node, indent);
        original.replaceWith(n);
      }),
    ],
  });

  function addListeners(container: _$) {
    const img = new Image();
    img.src = "resources/images/icons/actions/duplicate-50.png";
    container
      .on("click", function (ev): any {
        const item = $(ev.target as HTMLElement);
        if (item.hasClass("browser-list-head")) {
          const node = $(ev.target as HTMLElement).getData().node as Node;
          albumDataSource.toggleCollapse(node);
          return;
        }
        const album = albumFromElement(item, elementPrefix)!;
        if (!album) return;
        lastSelectedAlbum = album;
        events.emit("selected", { album });
      })
      .on("dragover", (ev: any) => {
        ev.preventDefault();
      })
      .on("dragenter", (ev: any) => {
        const item = $(ev.target as HTMLElement);
        if (ev.currentTarget.contains(ev.relatedTarget)) {
          return;
        }
        item.addClass("drop-area");
        ev.dataTransfer.setDragImage(img, 10, 10);
      })
      .on("dragleave", (ev: any) => {
        if (ev.currentTarget.contains(ev.relatedTarget)) {
          return;
        }
        const item = $(ev.target as HTMLElement);
        item.removeClass("drop-area");
        ev.preventDefault();
      })
      .on("drop", async (ev: any) => {
        const item = $(ev.target as HTMLElement);
        const selection = selectionManager.selected();
        const album = albumFromElement(item, elementPrefix)!;
        if (!album) return;
        const s = await getService();

        if (selection.length === 0) {
          throw new Error("No selection");
        }

        s.createJob(JOBNAMES.MOVE, {
          source: selection,
          destination: { album },
        });
        selectionManager.clear();
      });
  }

  return container;
}

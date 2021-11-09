import {
  albumEntryFromId,
  albumFromId,
  idFromAlbum,
  range,
  rectanglesIntersect,
} from "../../shared/lib/utils.js";
import {
  Album,
  AlbumEntry,
  AlbumListEventSource,
} from "../../shared/types/types.js";
import { picture } from "../element-templates.js";
import { FolderMonitor } from "../folder-monitor.js";
import { getAlbumInfo } from "../folder-utils.js";
import { thumbnailUrl } from "../imageProcess/client.js";
import { __ } from "../lib/dom.js";
import { toggleStar } from "../lib/handles.js";
import { getService } from "../rpc/connect.js";
import { SelectionManager } from "../selection/selection-manager.js";
import { makeNThumbnails, thumbnailData } from "./thumbnail.js";

declare const nanogallery2: Function;
declare const $: Function;
// Create two elements, allergic to visibility

export function makePhotoList(
  container: HTMLElement,
  monitor: FolderMonitor,
  events: AlbumListEventSource
) {
  let processKeys = false;
  let topIndex: number = -1;
  let bottomIndex: number = -1;
  const displayed: HTMLElement[] = [];

  const dragElement = __(".dragregion", container.parentElement);
  const dragStartPos = { x: 0, y: 0 };
  var rect = container.getBoundingClientRect();
  let dragging = false;
  __(container).on("scroll", updateHighlighted);
  __(container).on("mouseup", (e: MouseEvent) => {
    if (!dragging) {
      return;
    }
    e.preventDefault();
    dragging = false;
    dragElement.css({ display: "none" });
    const newPos = { x: e.clientX - rect.x, y: e.clientY - rect.y };
    if (!e.metaKey) {
      SelectionManager.get().clear();
    }
    for (const e of Array.from(container.querySelectorAll(".thumbnail img"))) {
      const r = e.getBoundingClientRect();
      r.x -= rect.x;
      r.y -= rect.y;
      if (
        rectanglesIntersect(
          { p1: dragStartPos, p2: newPos },
          {
            p1: r,
            p2: { x: r.x + r.width, y: r.y + r.height },
          }
        )
      ) {
        SelectionManager.get().select(albumEntryFromId(e.id));
      }
    }
    // Find all the elements intersecting with the area.
  });
  events.on("tabChanged", ({ win }) => {
    processKeys = __(container).isParent(win);
  });
  events.on("keyDown", ({ code, tab }) => {
    if (!processKeys) return;
    switch (code) {
      case "Space":
        toggleStar(SelectionManager.get().selected());
      default:
    }
  });
  events.on("clicked", (e) => {
    const selectionManager = SelectionManager.get();
    let from = selectionManager.last();
    if (e.modifiers.range && from !== undefined) {
      // All the elements between this and the last
      let to = e as AlbumEntry;

      if (from.album.key !== to.album.key) {
        // Multi album range selection
        // Which one is the first ?
        if (
          monitor.albumIndexFromKey(from.album.key) >
          monitor.albumIndexFromKey(to.album.key)
        ) {
          // swap
          const _a = from;
          from = to;
          to = _a;
        }
        const fromAlbumIndex = monitor.albumIndexFromKey(from.album.key);
        const toAlbumIndex = monitor.albumIndexFromKey(to.album.key);

        for (const idx of range(fromAlbumIndex, toAlbumIndex)) {
          const album = monitor.albumAtIndex(idx);
          getAlbumInfo(album).then((data) => {
            const sels = data.pictures;
            if (idx === fromAlbumIndex) {
              sels.splice(
                0,
                sels.findIndex((e) => e.name === from!.name)
              );
            }
            if (idx === toAlbumIndex) {
              sels.splice(
                sels.findIndex((e) => e.name === to.name) + 1,
                sels.length
              );
            }
            for (const sel of sels) {
              selectionManager.select(sel);
            }
          });
        }
      } else {
        getAlbumInfo(from.album).then((data) => {
          const sels = data.pictures;
          const start = sels.findIndex((e) => e.name === from!.name);
          const end = sels.findIndex((e) => e.name === to.name);
          sels.splice(Math.max(start, end) + 1, sels.length);
          sels.splice(0, Math.min(start, end));
          for (const sel of sels) {
            selectionManager.select(sel);
          }
        });
      }
    } else if (e.modifiers.multi) {
      selectionManager.select(e as AlbumEntry);
    } else {
      selectionManager.clear();
      selectionManager.select(e as AlbumEntry);
    }
  });

  __(container).on("mousedown", (e: MouseEvent) => {
    // save start position
    dragStartPos.x = e.clientX - rect.x;
    dragStartPos.y = e.clientY - rect.y;
  });

  __(container).on("mousemove", (e: MouseEvent) => {
    if (!(e.buttons & 1)) {
      return;
    }
    const newPos = { x: e.clientX - rect.x, y: e.clientY - rect.y };
    if (
      Math.abs(newPos.x - dragStartPos.x) +
        Math.abs(newPos.y - dragStartPos.y) <
      20
    ) {
      return;
    }

    dragging = true;
    e.preventDefault();
    dragElement.css({
      left: `${Math.min(dragStartPos.x, newPos.x)}px`,
      top: `${Math.min(dragStartPos.y, newPos.y)}px`,
      display: "",
      width: `${
        Math.max(dragStartPos.x, newPos.x) - Math.min(dragStartPos.x, newPos.x)
      }px`,
      height: `${
        Math.max(dragStartPos.y, newPos.y) - Math.min(dragStartPos.y, newPos.y)
      }px`,
    });
  });

  __(container).on(
    "dragstart",
    (ev: any) => {
      const entry = albumEntryFromId(ev.target.id);
      if (entry) {
        SelectionManager.get().select(entry);
        ev.dataTransfer.effectAllowed = "move";
      }
      //ev.preventDefault();
    },
    false
  );
  let doReflow = false;
  let running = false;
  function updateHighlighted(): HTMLElement | null {
    if (displayed.length === 0) {
      return null;
    }
    // Find the first visible element
    const top = container.scrollTop;
    const bottom = container.scrollTop + container.clientHeight;
    let found;
    let previous = displayed[0];
    for (const e of displayed) {
      //if (parseInt(e.style.top) >= top) {
      if (parseInt(e.style.top) > bottom) {
        found = previous;
        break;
      }
      //}
      previous = e;
    }
    if (!found) {
      found = previous;
    }

    if (found) {
      const album = albumFromId(found.id);
      console.info(`Now visible album ${album.name}`);
      events.emit("scrolled", {
        album,
      });
      return found;
    }

    return null;
  }

  new ResizeObserver(() => {
    reflow(false);
  }).observe(container);

  getService().then((service) => {
    service.on("albumChanged", async (albums: Album[]) => {
      for (const d of displayed) {
        const album = albumFromId(d.id);
        if (albums.find((a) => a.key === album.key)) {
          await populateElement(d, album);
        }
      }
      reflow(false);
    });
  });
  window.requestAnimationFrame(addNewItemsIfNeeded);
  function addNewItemsIfNeeded() {
    if (running) {
      debugger;
    }
    if (!__(container).visible() || displayed.length === 0) {
      window.requestAnimationFrame(addNewItemsIfNeeded);
      return;
    }
    running = true;
    if (doReflow) {
      // reflow
      doReflow = false;
      reflow();

      running = false;
      window.requestAnimationFrame(addNewItemsIfNeeded);
      return;
    } else {
      if (displayed.length > 3) {
        const prune = [];
        // prune elements out of bounds
        const visibleScrollArea = {
          top: container.scrollTop - 1000,
          bottom: container.scrollTop + container.clientHeight + 1000,
        };
        for (const elem of displayed) {
          const top = parseInt(elem.style.top);
          const elemPos = {
            top,
            bottom: top + elem.clientHeight,
          };
          const album = albumFromId(elem.id);
          if (
            elemPos.bottom < visibleScrollArea.top ||
            elemPos.top > visibleScrollArea.bottom
          ) {
            console.info(
              `Pruning album ${album.name} : Visible Area = ${visibleScrollArea.top}/${visibleScrollArea.bottom} - Element (${elemPos.top}/${elemPos.bottom}`
            );
            prune.push(elem);
          } else {
            console.info(
              `- keeping album ${album.name} : Visible Area = ${visibleScrollArea.top}/${visibleScrollArea.bottom} - Element (${elemPos.top}/${elemPos.bottom}`
            );
          }
        }
        if (prune.length) {
          for (const elem of prune) {
            displayed.splice(displayed.indexOf(elem), 1);
            __(elem).remove();
          }
          topIndex = parseInt(displayed[0].getAttribute("index")!);
          bottomIndex = parseInt(
            displayed[displayed.length - 1].getAttribute("index")!
          );
        }
      }

      const promises: Promise<void>[] = [];

      const firstItem = displayed[0];
      const lastItem = displayed[displayed.length - 1];
      // Pick the topmost and the bottommost, compare with the scroll position
      if (firstItem && parseInt(firstItem.style.top) > container.scrollTop) {
        promises.push(addAtTop());
      }
      if (
        lastItem &&
        parseInt(lastItem.style.top) + lastItem.clientHeight <=
          container.scrollTop + container.clientHeight + 300
      ) {
        promises.push(addAtBottom());
      }
      if (promises.length > 0) {
        doReflow = true;
        Promise.allSettled(promises).finally(() => {
          running = false;
          window.requestAnimationFrame(addNewItemsIfNeeded);
        });
      } else {
        running = false;
        window.requestAnimationFrame(addNewItemsIfNeeded);
      }
    }
  }

  function reflow(incremental: boolean = true) {
    if (!incremental) {
      const active = updateHighlighted();
      if (active) {
        for (const d of displayed) {
          if (d !== active) {
            __(d).css({
              opacity: 0,
            });
          }
        }
      }
    }
    if (displayed.length === 0) {
      return;
    }

    const firstItem = displayed[0];
    const lastItem = displayed[displayed.length - 1];
    let goneBack = false;

    for (const [index, d] of Object.entries(displayed)) {
      if (d.style.opacity != "0" && !goneBack) {
        // First non hidden. Got backwards
        let lastElem = d;
        goneBack = true;
        for (const elem of displayed.slice(0, parseInt(index)).reverse()) {
          elem.style.top = `${
            parseInt(lastElem.style.top) - elem.clientHeight
          }px`;
          elem.style.opacity = "1";
          lastElem = elem;
          const album = albumFromId(elem.id);
          console.info(
            `Flowing album ${album.name} [height: ${elem.clientHeight}] : ${elem.style.top}`
          );
        }
      }
      if (d.style.opacity == "0" && goneBack) {
        let lastElem = displayed[parseInt(index) - 1];
        for (const elem of displayed.slice(parseInt(index))) {
          elem.style.top = `${
            parseInt(lastElem.style.top) + lastElem.clientHeight
          }px`;
          elem.style.opacity = "1";
          lastElem = elem;
          const album = albumFromId(elem.id);
          console.info(
            `Flowing album ${album.name} [height: ${elem.clientHeight}] : ${elem.style.top}`
          );
        }
        break;
      }
    }
    const displayedTop = parseInt(firstItem.style.top) - 10;
    const displayedBottom =
      parseInt(lastItem.style.top) + lastItem.clientHeight + 10;

    // Offset, we are < 0
    if (displayedTop < 0 || displayedTop > 1000) {
      for (const c of container.children) {
        const thisTop = parseInt((c as HTMLElement).style.top);
        (c as HTMLElement).style.top = `${thisTop - displayedTop}px`;
      }
      container.scrollBy({ top: -displayedTop });
    }
  }

  async function albumWithThumbnails(
    album: Album,
    title: HTMLElement,
    element: HTMLElement,
    events: AlbumListEventSource
  ) {
    title.innerText = album.name;
    return getAlbumInfo(album).then((info) => {
      __(element).empty();
      const n = $(element).nanogallery2({
        items: info.pictures.map((picture) => ({
          srct: thumbnailUrl(picture), // thumbnail url
          title: picture.name,
        })),
        thumbnailWidth: 250,
        thumbnailHeight: 250,
        thumbnailBorderVertical: 4,
        thumbnailBorderHorizontal: 4,
        thumbnailDisplayTransition: "slideUp",
        thumbnailLabel: {
          position: "overImageOnBottom",
          display: false,
        },
        thumbnailAlignment: "center",
        displayBreadcrumb: false,
        breadcrumbAutoHideTopLevel: false,
        breadcrumbOnlyCurrentLevel: false,
        thumbnailOpenImage: false,
        thumbnailSelectable: true,
        thumbnailDisplayOutsideScreen: true,
        thumbnailOpenInLightox: false,
      });

      return new Promise<void>((resolve) =>
        $(element).on("galleryRenderEnd.nanogallery2", () => {
          resolve();
        })
      );
    });
  }

  function getElement(): HTMLElement {
    return __(`<div class="album">
        <div class="header w3-bar">
        <a class="name w3-bar-item"></a>
        </div>
        <div class="photos album-photos"></div>
      </div>
      `).get();
  }
  async function populateElement(e: HTMLElement, album: Album) {
    __(e).css({ top: `0px`, opacity: 0 });
    await albumWithThumbnails(
      album,
      __(".name", e).get(),
      __(".photos", e).get(),
      events
    );
    e.id = idFromAlbum(album);
  }

  async function addAtTop() {
    if (topIndex > 0) {
      topIndex--;
      const albumElement = getElement();
      container.insertBefore(albumElement, container.firstChild!.nextSibling);
      const album = monitor.albumAtIndex(topIndex);
      await populateElement(albumElement, album);
      albumElement.setAttribute("index", topIndex.toString());
      displayed.unshift(albumElement);
      console.info(`Adding album ${album.name} at top`);
    }
  }

  async function addAtBottom() {
    if (bottomIndex < monitor.length() - 1) {
      bottomIndex++;
      const albumElement = getElement();
      const album = monitor.albumAtIndex(bottomIndex);
      container.insertBefore(albumElement, container.lastChild);
      await populateElement(albumElement, album);
      albumElement.setAttribute("index", bottomIndex.toString());
      displayed.push(albumElement);
      console.info(`Adding album ${album.name} at end`);
    }
  }

  async function refresh(album: Album) {
    console.info(`Refresh from ${album.name}`);
    for (const e of displayed) {
      container.removeChild(e);
    }
    displayed.splice(0, displayed.length);
    const index = monitor.albumIndexFromKey(album.key);
    topIndex = bottomIndex = index;

    const albumElement = getElement();
    container.appendChild(albumElement);
    await populateElement(albumElement, album);
    __(albumElement).css("top", index === 0 ? "0" : "100px");
    albumElement.setAttribute("index", index.toString());
    albumElement.style.opacity = "1";
    container.scrollTo({ top: 0 });
    displayed.push(albumElement);
    updateHighlighted();
    doReflow = true;
  }

  monitor.events.on("updated", (event) => {});
  events.on("selected", ({ album }) => {
    refresh(album);
  });
}

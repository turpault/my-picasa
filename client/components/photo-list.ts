import { albumFromElement, range, setIdForAlbum } from "../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumListEventSource,
} from "../../shared/types/types";
import { FolderMonitor } from "../folder-monitor";
import { getAlbumInfo } from "../folder-utils";
import { $ } from "../lib/dom";
import { toggleStar } from "../lib/handles";
import { getSettingsEmitter } from "../lib/settings";
import { getService } from "../rpc/connect";
import { SelectionManager } from "../selection/selection-manager";
import { animateStar } from "./animations";
import {
  makeNThumbnails,
  selectThumbnailsInRect,
  thumbnailData,
} from "./thumbnail";

// Create two elements, allergic to visibility
const elementPrefix = "photolist:";

export async function makePhotoList(
  container: HTMLElement,
  monitor: FolderMonitor,
  events: AlbumListEventSource
) {
  let tabIsActive = false;
  let topIndex: number = -1;
  let bottomIndex: number = -1;
  const pool: HTMLElement[] = [];
  const displayed: HTMLElement[] = [];

  const dragElement = $(".dragregion", container.parentElement);
  const dragStartPos = { x: 0, y: 0 };
  let dragging = false;
  let doReflow = 0; // bit field
  let doRepopulate = false;
  const REFLOW_FULL = 2;
  const REFLOW_TRIGGER = 1;

  let running = false;

  // UI State events
  events.on("tabChanged", ({ win }) => {
    tabIsActive = $(container).isParent(win);
  });
  events.on("keyDown", async ({ code, win }) => {
    if (!tabIsActive) return;
    switch (code) {
      case "Space":
        const target = await toggleStar(SelectionManager.get().selected());
        animateStar(target);
        break;
      case "Enter":
        startGallery();
        break;
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
          getAlbumInfo(album, true).then((data) => {
            const sels = data.assets;
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
        getAlbumInfo(from.album, true).then((data) => {
          const sels = data.assets;
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

  // UI events
  $(container).on("scroll", () => {
    updateHighlighted();
    doRepopulate = true;
  });
  $(container).on("mouseup", (e: MouseEvent) => {
    if (!dragging) {
      return;
    }
    var rect = container.getBoundingClientRect();
    e.stopPropagation();
    dragging = false;
    dragElement.css({ display: "none" });
    const newPos = { x: e.clientX - rect.x, y: e.clientY - rect.y };
    if (!e.metaKey) {
      SelectionManager.get().clear();
    }
    selectThumbnailsInRect(container, newPos, dragStartPos);
    // Find all the elements intersecting with the area.
  });
  $(container).on("mousedown", (e: MouseEvent) => {
    // save start position
    var rect = container.getBoundingClientRect();
    dragStartPos.x = e.clientX - rect.x;
    dragStartPos.y = e.clientY - rect.y;
  });
  $(container).on("mousemove", (e: MouseEvent) => {
    if (!(e.buttons & 1)) {
      return;
    }
    var rect = container.getBoundingClientRect();
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

  // Status change events
  const s = await getService();

  s.on("albumChanged", async (e: { payload: Album[] }) => {
    for (const d of displayed) {
      const album = albumFromElement(d, elementPrefix);
      if (album && e.payload.find((a) => a.key === album.key)) {
        await populateElement(d, album);
      }
    }
    doReflow |= REFLOW_FULL;
    doRepopulate = true;
  });

  function visibleIndex(): number {
    const e = visibleElement();
    if (!e) return -1;
    const album = albumFromElement(e, elementPrefix)!;
    return monitor.albumIndexFromKey(album.key);
  }

  function visibleElement(): HTMLElement | null {
    if (displayed.length === 0) {
      return null;
    }
    // Find the first visible element
    const top = container.scrollTop;
    const bottom = container.scrollTop + container.clientHeight;
    let found;
    let previous: HTMLElement | null = null;
    for (const e of displayed) {
      if (e.style.opacity !== "0") {
        if (parseInt(e.style.top) >= top) {
          found = e;
          if (parseInt(e.style.top) > bottom) {
            found = previous;
          }
          break;
        }
        //}
        previous = e;
      }
    }
    if (!found) {
      found = previous;
    }
    return found;
  }
  function updateHighlighted(): HTMLElement | null {
    const found = visibleElement();

    if (found) {
      const album = albumFromElement(found, elementPrefix);
      if (album) {
        console.info(`Now visible album ${album.name}`);
        events.emit("scrolled", {
          album,
        });
      }
      return found;
    }

    return null;
  }

  new ResizeObserver(() => {
    if (tabIsActive) {
      doReflow |= REFLOW_FULL;
    }
  }).observe(container);

  getSettingsEmitter().on("changed", () => {
    const found = visibleElement();
    if (found) {
      const album = albumFromElement(found, elementPrefix);
      if (album) {
        refresh(album);
      }
    }
  });

  window.requestAnimationFrame(addNewItemsIfNeededAndReschedule);
  function addNewItemsIfNeededAndReschedule() {
    if (running) debugger;
    running = true;
    addNewItemsIfNeeded()
      .catch(() => console.error)
      .finally(() => {
        running = false;
        window.requestAnimationFrame(addNewItemsIfNeededAndReschedule);
      });
  }
  async function addNewItemsIfNeeded() {
    if (!tabIsActive) {
      return;
    }
    if (displayed.length === 0) {
      return;
    }

    running = true;
    if (doReflow) {
      // reflow
      reflow();
      return;
    } else if (doRepopulate) {
      const minDistancesAboveBelowFold = 10000;

      if (displayed.length > 7) {
        const prune = [];
        // prune elements out of bounds
        const visibleScrollArea = {
          top: container.scrollTop,
          bottom: container.scrollTop + container.clientHeight,
        };
        for (const elem of displayed) {
          const top = parseInt(elem.style.top);
          const elemPos = {
            top,
            bottom: top + elem.clientHeight,
          };
          const album = albumFromElement(elem, elementPrefix);
          if (album) {
            if (
              elemPos.bottom <
                visibleScrollArea.top - minDistancesAboveBelowFold * 1.5 ||
              elemPos.top >
                visibleScrollArea.bottom + minDistancesAboveBelowFold * 1.5
            ) {
              console.info(
                `Pruning album ${album.name} : Visible Area = ${visibleScrollArea.top}/${visibleScrollArea.bottom} - Element (${elemPos.top}/${elemPos.bottom}`
              );
              prune.push(elem);
            } else {
              //console.info(
              //  `- keeping album ${album.name} : Visible Area = ${visibleScrollArea.top}/${visibleScrollArea.bottom} - Element (${elemPos.top}/${elemPos.bottom}`
              //);
            }
          }
        }
        if (prune.length) {
          for (const elem of prune) {
            displayed.splice(displayed.indexOf(elem), 1);
            $(elem).remove();
            pool.push(elem);
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
      // and make sure we have at least albumsAboveBelowFold albums above and below the fold
      if (
        firstItem &&
        parseInt(firstItem.style.top) >
          container.scrollTop - minDistancesAboveBelowFold &&
        topIndex > 0
      ) {
        promises.push(addAtTop());
      }
      if (
        lastItem &&
        parseInt(lastItem.style.top) + lastItem.clientHeight <=
          container.scrollTop +
            container.clientHeight +
            minDistancesAboveBelowFold
      ) {
        promises.push(addAtBottom());
      }
      if (promises.length > 0) {
        console.info("Added items, will reflow");
        doReflow |= REFLOW_TRIGGER;
        await Promise.allSettled(promises);
      } else {
        // Nothing happened, we will repopulate when scrolling only
        doRepopulate = false;
      }
    }
  }

  function reflow() {
    if (doReflow === 0) {
      return;
    }
    if (displayed.length === 0) return;
    if (doReflow & REFLOW_FULL) {
      const active = updateHighlighted();
      if (active) {
        for (const d of displayed) {
          if (d !== active) {
            $(d).css({
              opacity: 0,
            });
          }
        }
      }
    }
    doReflow = 0;

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
          const album = albumFromElement(elem, elementPrefix);
          if (album) {
            console.info(`Flowing album ${album.name} : ${elem.style.top}`);
          }
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
          const album = albumFromElement(elem, elementPrefix);
          if (album) {
            console.info(`Flowing album ${album.name} : ${elem.style.top}`);
          }
        }
        break;
      }
    }
    const displayedTop = parseInt(firstItem.style.top);
    const displayedBottom =
      parseInt(lastItem.style.top) + lastItem.clientHeight;

    // Offset, we are < 0
    if (displayedTop < 0 || displayedTop > 1000) {
      const currentPos = container.scrollTop;
      console.info(`top is ${displayedTop} - shifting contents`);
      for (const c of container.children) {
        const thisTop = parseInt((c as HTMLElement).style.top);
        console.info(
          `New top for ${
            albumFromElement(c as HTMLElement, elementPrefix)!.name
          } is ${thisTop - displayedTop}`
        );
        (c as HTMLElement).style.top = `${thisTop - displayedTop}px`;
      }
      container.scrollTo({ top: currentPos - displayedTop });
    }
  }

  async function albumWithThumbnails(
    album: Album,
    title: HTMLElement,
    element: HTMLElement,
    events: AlbumListEventSource
  ) {
    title.innerText = album.name;

    const info = await getAlbumInfo(album, true /* use settings */);
    makeNThumbnails(element, info.assets.length, events);

    const keys = info.assets.map((p) => p.name).reverse();
    let idx = keys.length;
    const p: Promise<void>[] = [];
    for (const name of keys) {
      p.push(
        thumbnailData(
          element.children[--idx] as HTMLElement,
          { album, name },
          info.picasa[name]
        )
      );
    }
    await Promise.allSettled(p);
  }

  function getElement(): HTMLElement {
    if (pool.length === 0) {
      const e = $(
        `<div class="album">
        <div class="header w3-bar">
        <a class="name w3-bar-item"></a>
        </div>
        <div class="photos album-photos"></div>
      </div>
      `
      );
      const title = $(".header", e);
      e.on("drop", async (ev) => {
        const selection = SelectionManager.get().selected();
        const album = albumFromElement(e.get(), elementPrefix)!;
        if (album) {
          const s = await getService();

          s.createJob("move", {
            source: selection,
            destination: album,
          });
          SelectionManager.get().clear();
        }
      });
      e.on("dragenter", (ev) => {
        e.addClass("album-drop-area");
        ev.preventDefault();
      });
      e.on("dragleave", (ev) => {
        e.removeClass("album-drop-area");
        ev.preventDefault();
      });
      e.on("dragover", (ev: any) => {
        ev.preventDefault();
      });
      e.on("click", async (ev: any) => {
        const album = albumFromElement(e.get(), elementPrefix)!;
        if (album) {
          ev.stopPropagation();
          const multi = ev.metaKey;
          if (!multi) {
            SelectionManager.get().clear();
          }
        }
      });
      title.on("click", async (ev: any) => {
        const album = albumFromElement(e.get(), elementPrefix)!;
        if (album) {
          ev.preventDefault();
          const info = await getAlbumInfo(album, true /* use settings */);
          const selection = SelectionManager.get();
          const multi = ev.metaKey;
          if (!multi) selection.clear();
          for (const e of info.assets) selection.select(e);
        }
      });
      title.on("dblclick", async (ev: any) => {
        const album = albumFromElement(e.get(), elementPrefix)!;
        if (album) {
          ev.preventDefault();
          const s = await getService();
          s.openInFinder(album);
        }
      });
      pool.push(e.get());
    }
    const e = pool.pop()!;
    return e;
  }
  async function populateElement(e: HTMLElement, album: Album) {
    await albumWithThumbnails(
      album,
      $(".name", e).get(),
      $(".photos", e).get(),
      events
    );
    setIdForAlbum(e, album, elementPrefix);
  }

  async function addAtTop() {
    if (topIndex > 0) {
      topIndex--;
      const albumElement = getElement();
      const album = monitor.albumAtIndex(topIndex);
      await populateElement(albumElement, album);
      $(albumElement).css({ top: `0px`, opacity: 0 });
      albumElement.setAttribute("index", topIndex.toString());
      container.insertBefore(albumElement, container.firstChild!.nextSibling);
      displayed.unshift(albumElement);
      console.info(`Adding album ${album.name} at top`);
    }
  }

  async function addAtBottom() {
    if (bottomIndex < monitor.length() - 1) {
      bottomIndex++;
      const albumElement = getElement();
      const album = monitor.albumAtIndex(bottomIndex);
      await populateElement(albumElement, album);
      $(albumElement).css({ top: `0px`, opacity: 0 });
      albumElement.setAttribute("index", bottomIndex.toString());
      container.insertBefore(albumElement, container.lastChild);
      displayed.push(albumElement);
      console.info(`Adding album ${album.name} at end`);
    }
  }

  async function refresh(album: Album) {
    console.info(`Refresh from ${album.name}`);
    for (const e of displayed) {
      container.removeChild(e);
      pool.push(e);
    }
    displayed.splice(0, displayed.length);
    const index = monitor.albumIndexFromKey(album.key);
    topIndex = bottomIndex = index;
    // pick from pool
    const albumElement = getElement();
    await populateElement(albumElement, album);
    $(albumElement).css("top", "0"); //index === 0 ? "0" : "100px");
    albumElement.setAttribute("index", index.toString());
    albumElement.style.opacity = "1";
    container.appendChild(albumElement);
    container.scrollTo({ top: 0 });
    displayed.push(albumElement);
    updateHighlighted();
    console.info("Refreshed album, will reflow");
    doReflow |= REFLOW_FULL;
    doRepopulate = true;
  }

  monitor.events.on("updated", (event) => {});
  events.on("selected", ({ album }) => {
    refresh(album);
  });

  async function startGallery(start?: AlbumEntry) {
    if (!start) {
      start = SelectionManager.get().selected()[0];
    }
    if (!start) {
      const v = visibleElement();
      start = { album: albumFromElement(v!, elementPrefix)!, name: "" };
    }
    events.emit("show", { start });
  }
}

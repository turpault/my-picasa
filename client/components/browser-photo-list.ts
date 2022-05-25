import { Point } from "ts-2d-geometry/dist";
import { range, sleep } from "../../shared/lib/utils";
import { Album, AlbumEntry, JOBNAMES } from "../../shared/types/types";
import { AlbumDataSource } from "../album-data-source";
import { getAlbumInfo } from "../folder-utils";
import { $, albumFromElement, elementFromAlbum, elementFromEntry, setIdForAlbum, _$ } from "../lib/dom";
import { toggleStar } from "../lib/handles";
import { getSettingsEmitter } from "../lib/settings";
import { getService } from "../rpc/connect";
import { SelectionManager } from "../selection/selection-manager";
import { AlbumListEventSource, AppEventSource } from "../uiTypes";
import { animateStar } from "./animations";
import {
  makeNThumbnails,
  selectThumbnailsInRect,
  thumbnailData,
  thumbnailsAround,
} from "./thumbnail";

const extra = `
<div class="w3-dropdown-hover w3-right sort-menu">
  <button
    style="font-size: 22px"
    class="w3-button fa fa-sort"
  ></button>
  <div class="w3-dropdown-content w3-bar-block w3-card-4">
    <a id="SortByDate" class="w3-bar-item w3-button">By date</a>
    <a id="SortByName" class="w3-bar-item w3-button">By name</a>
  </div>
</div>`;
// Create two elements, allergic to visibility
const elementPrefix = "photolist:";
const html = `<div class="w3-theme images-area">
<div class="images disable-scrollbar"></div>
<div style="display: none" class="dragregion"></div>
</div>
`;

export async function makePhotoList(
  appEvents: AppEventSource,
  events: AlbumListEventSource
): Promise<_$> {
  const datasource = new AlbumDataSource();
  let tabIsActive = false;
  let topIndex: number = -1;
  let bottomIndex: number = -1;
  const pool: _$[] = [];
  const displayed: _$[] = [];
  const photoList = $(html);
  const container = $(".images", photoList);

  const dragElement = $(".dragregion", photoList);
  const dragStartPos = { x: 0, y: 0 };
  let dragging = false;
  let doReflow = 0; // bit field
  let doRepopulate = false;
  const REFLOW_FULL = 2;
  const REFLOW_TRIGGER = 1;

  let running = false;
  let filter = "";
  await datasource.walk(filter);

  // UI State events
  const off = [
    appEvents.on("tabChanged", ({ win }) => {
      tabIsActive = $(container).isParent(win);
    }),
    appEvents.on("keyDown", async ({ code }) => {
      if (!tabIsActive) return;
      switch (code) {
        case "Space":
          if (SelectionManager.get().selected().length > 0) {
            const target = await toggleStar(SelectionManager.get().selected());
            animateStar(target);
          }
          break;
        case "Enter":
          startGallery(filter);
          break;
        default:
      }
    }),
    events.on("filterChanged", (event) => {
      filter = event.filter;
    }),
    events.on("thumbnailDblClicked", async (event) => {
      const { entries } = await s.media(event.entry.album, filter);
      const initialIndex = entries.findIndex(
        (e: AlbumEntry) => e.name === event.entry.name
      );
      if (initialIndex === -1) {
        return;
      }

      appEvents.emit("edit", { initialIndex, initialList: entries });
    }),

    events.on("thumbnailClicked", (e) => {
      const selectionManager = SelectionManager.get();
      let from = selectionManager.last();
      if (e.modifiers.range && from !== undefined) {
        // All the elements between this and the last
        let to = e.entry;

        if (from.album.key !== to.album.key) {
          // Multi album range selection
          // Which one is the first ?
          if (
            datasource.albumIndexFromKey(from.album.key) >
            datasource.albumIndexFromKey(to.album.key)
          ) {
            // swap
            const _a = from;
            from = to;
            to = _a;
          }
          const fromAlbumIndex = datasource.albumIndexFromKey(from.album.key);
          const toAlbumIndex = datasource.albumIndexFromKey(to.album.key);

          for (const idx of range(fromAlbumIndex, toAlbumIndex)) {
            const album = datasource.albumAtIndex(idx);
            getAlbumInfo(album, filter, true).then((data) => {
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
          getAlbumInfo(from.album, filter, true).then((data) => {
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
        selectionManager.select(e.entry);
      } else {
        selectionManager.clear();
        selectionManager.select(e.entry);
      }
    }),
    appEvents.on("tabDeleted", ({ win }) => {
      if ($(container).isParent(win)) {
        off.forEach((o) => o());
      }
    }),
  ];

  // UI events
  container.on("scroll", () => {
    updateHighlighted();
    doRepopulate = true;
  });
  container.on("mouseup", (e: MouseEvent) => {
    if (!dragging) {
      return;
    }
    var rect = container.get().getBoundingClientRect();
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
    var rect = container.clientRect();
    dragStartPos.x = e.clientX - rect.x;
    dragStartPos.y = e.clientY - rect.y;
  });
  $(container).on("mousemove", (e: MouseEvent) => {
    if (!(e.buttons & 1)) {
      return;
    }
    var rect = container.clientRect();
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

  s.on("updateAlbumList", async () => {
    await datasource.walk(filter);
    /*
    // refresh if one of the visible albums does not match the list
    let initialIndex = datasource.albumIndexFromKey(
      albumFromElement(displayed[0], elementPrefix)!.key
    );
    let repopulate = false;
    for (const d of displayed) {
      const album = albumFromElement(d, elementPrefix)!;
      if (album.key != datasource.albumAtIndex(initialIndex).key) {
        repopulate = true;
        break;
      }
    }
    if (repopulate) {
      refresh(albumFromElement(displayed[0], elementPrefix)!);
    }*/
  });

  s.on("albumChanged", async (e: { payload: Album[] }) => {
    // save index
    let idx = visibleIndex();
    if (idx === -1) {
      idx = 0;
    }
    let reflow = false;
    for (const d of displayed) {
      const album = albumFromElement(d, elementPrefix)!;
      if (album && e.payload.find((a) => a.key === album.key)) {
        refreshSingleAlbum(album);
        reflow = true;
      }
    }
    if (reflow) {
      doReflow |= REFLOW_FULL;
    }
  });

  function visibleIndex(): number {
    const e = visibleElement();
    if (!e) return -1;
    const album = albumFromElement(e, elementPrefix)!;
    return datasource.albumIndexFromKey(album.key);
  }

  function visibleElement(): _$ | null {
    if (displayed.length === 0) {
      return null;
    }
    // Find the first visible element
    const top = container.get().scrollTop;
    const bottom = container.get().scrollTop + container.get().clientHeight;
    let found;
    let previous: _$ | null = null;
    for (const e of displayed) {
      if (e.css("opacity") !== "0") {
        if (parseInt(e.css("top")) >= top) {
          found = e;
          if (parseInt(e.css("top")) > bottom) {
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
  function updateHighlighted(): _$ | null {
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
  }).observe(container.get());

  getSettingsEmitter().on("changed", () => {
    const found = visibleElement();
    if (found) {
      const album = albumFromElement(found, elementPrefix);
      if (album) {
        refreshViewStartingFrom(album);
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
          top: container.get().scrollTop,
          bottom: container.get().scrollTop + container.get().clientHeight,
        };
        for (const elem of displayed) {
          const top = parseInt(elem.css("top"));
          const elemPos = {
            top,
            bottom: top + elem.get().clientHeight,
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
          topIndex = parseInt(displayed[0].attr("index")!);
          bottomIndex = parseInt(
            displayed[displayed.length - 1].attr("index")!
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
        parseInt(firstItem.css("top")) >
          container.get().scrollTop - minDistancesAboveBelowFold &&
        topIndex > 0
      ) {
        promises.push(addAtTop());
      }
      if (
        lastItem &&
        parseInt(lastItem.css("top")) + lastItem.get().clientHeight <=
          container.get().scrollTop +
            container.get().clientHeight +
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
      if (d.css("opacity") != "0" && !goneBack) {
        // First non hidden. Got backwards
        let lastElem = d;
        goneBack = true;
        for (const elem of displayed.slice(0, parseInt(index)).reverse()) {
          elem.css(
            "top",
            `${parseInt(lastElem.css("top")) - elem.get().clientHeight}px`
          );
          elem.css("opacity", "1");
          lastElem = elem;
          const album = albumFromElement(elem, elementPrefix);
          if (album) {
            console.info(`Flowing album ${album.name} : ${elem.css("top")}`);
          }
        }
      }
      if (d.css("opacity") == "0" && goneBack) {
        let lastElem = displayed[parseInt(index) - 1];
        for (const elem of displayed.slice(parseInt(index))) {
          elem.css(
            "top",
            `${parseInt(lastElem.css("top")) + lastElem.get().clientHeight}px`
          );
          elem.css("opacity", "1");
          lastElem = elem;
          const album = albumFromElement(elem, elementPrefix);
          if (album) {
            console.info(`Flowing album ${album.name} : ${elem.css("top")}`);
          }
        }
        break;
      }
    }
    const displayedTop = parseInt(firstItem.css("top"));
    const displayedBottom =
      parseInt(lastItem.css("top")) + lastItem.get().clientHeight;

    // Offset, we are < 0
    if (displayedTop < 0 || displayedTop > 1000) {
      const currentPos = container.get().scrollTop;
      console.info(`top is ${displayedTop} - shifting contents`);
      for (const c of container.children()) {
        const thisTop = parseInt(c.css("top"));
        console.info(
          `New top for ${albumFromElement(c, elementPrefix)!.name} is ${
            thisTop - displayedTop
          }`
        );
        c.css("top", `${thisTop - displayedTop}px`);
      }
      container.get().scrollTo({ top: currentPos - displayedTop });
    }
  }

  async function albumWithThumbnails(
    album: Album,
    filter: string,
    title: _$,
    element: _$,
    events: AlbumListEventSource
  ) {
    title.val(album.name);

    const info = await getAlbumInfo(album, filter, true /* use settings */);
    makeNThumbnails(element, info.assets.length, events);

    const keys = info.assets.map((p) => p.name).reverse();
    let idx = keys.length;
    const p: Promise<void>[] = [];
    const children = element.children();
    for (const name of keys) {
      p.push(thumbnailData(children[--idx], { album, name }, info.picasa[name]));
    }
    await Promise.allSettled(p);
  }

  function getElement(): _$ {
    if (pool.length === 0) {
      const e = $(
        `<div class="album">
        <div class="header w3-bar w3-bar-item">
          <div class="name-container"><input class="name" disabled></div>
          <button data-tooltip-below="Delete Album" class="trash-album w3-button" style="background-image: url(resources/images/icons/actions/trash-50.png)"></button>
          <button data-tooltip-below="Open in Finder" class="open-in-finder w3-button" style="background-image: url(resources/images/icons/actions/finder-50.png)"></button>
          <button class="fa fa-pen edit-album-name"></button>
        </div>
        <div class="photos album-photos"></div>
      </div>
      `
      );
      const title = $(".name", e);
      title.on("change", async () => {
        title.attr("disabled", "");
        const s = await getService();

        const album = albumFromElement(e, elementPrefix)!;
        const newName = title.val();

        s.createJob(JOBNAMES.RENAME_ALBUM, {
          source: album,
          name: newName,
        });
      });
      $(".edit-album-name", e).on("click", async () => {
        if (title.attr("disabled") === "") {
          title.attr("disabled", null);
          title.get().focus();
        } else {
          title.attr("disabled", "");
        }
      });

      $(".trash-album", e).on("click", async () => {});

      $(".open-in-finder", e).on("click", async () => {
        const s = await getService();
        const album = albumFromElement(e, elementPrefix)!;
        s.openInFinder(album);
      });

      e.on("drop", async (ev) => {
        // Find the closest picture in the target album
        const album = albumFromElement(e, elementPrefix)!;
        const closestEntries = thumbnailsAround(container, new Point(ev.clientX, ev.clientY), album);

        const selection = SelectionManager.get().selected();
        if (album) {
          const s = await getService();

          s.createJob(JOBNAMES.MOVE, {
            source: selection,
            destination: {album, between: closestEntries},
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
        const album = albumFromElement(e, elementPrefix)!;
        const closestEntries = thumbnailsAround(e, new Point(ev.clientX, ev.clientY), album);
        closestEntries.slice(0,2).forEach(async entry=> {
          const e = elementFromEntry(entry, "thumb:");
          e.addClass('highlight-debug');
          await sleep(0.5);
          e.removeClass('highlight-debug');
        });
      });
      e.on("click", async (ev: any) => {
        const album = albumFromElement(e, elementPrefix)!;
        if (album) {
          ev.stopPropagation();
          const multi = ev.metaKey;
          if (!multi) {
            SelectionManager.get().clear();
          }
        }
      });
      title.on("click", async (ev: any) => {
        const album = albumFromElement(e, elementPrefix)!;
        if (album) {
          ev.preventDefault();
          const info = await getAlbumInfo(
            album,
            filter,
            true /* use settings */
          );
          const selection = SelectionManager.get();
          const multi = ev.metaKey;
          if (!multi) selection.clear();
          for (const e of info.assets) selection.select(e);
        }
      });
      title.on("dblclick", async (ev: any) => {
        const album = albumFromElement(e, elementPrefix)!;
        if (album) {
          ev.preventDefault();
          const s = await getService();
          s.openInFinder(album);
        }
      });
      pool.push(e);
    }
    const e = pool.pop()!;
    return e;
  }
  async function populateElement(e: _$, album: Album, filter: string) {
    await albumWithThumbnails(
      album,
      filter,
      $(".name", e),
      $(".photos", e),
      events
    );
    setIdForAlbum(e, album, elementPrefix);
  }

  async function addAtTop() {
    if (topIndex > 0) {
      topIndex--;
      const albumElement = getElement();
      const album = datasource.albumAtIndex(topIndex);
      await populateElement(albumElement, album, filter);
      $(albumElement).css({ top: `0px`, opacity: 0 });
      albumElement.attr("index", topIndex.toString());
      container
        .get()
        .insertBefore(
          albumElement.get(),
          container.get().firstChild!.nextSibling
        );
      displayed.unshift(albumElement);
      console.info(`Adding album ${album.name} at top`);
    }
  }

  async function addAtBottom() {
    if (bottomIndex < datasource.length() - 1) {
      bottomIndex++;
      const albumElement = getElement();
      const album = datasource.albumAtIndex(bottomIndex);
      await populateElement(albumElement, album, filter);
      $(albumElement).css({ top: `0px`, opacity: 0 });
      albumElement.attr("index", bottomIndex.toString());
      container
        .get()
        .insertBefore(albumElement.get(), container.get().lastChild);
      displayed.push(albumElement);
      console.info(`Adding album ${album.name} at end`);
    }
  }

  async function refreshSingleAlbum(album: Album) {
    const albumElement = elementFromAlbum(album, elementPrefix);
    if(albumElement)
      await populateElement(albumElement, album, filter);
  }
  async function refreshViewStartingFrom(album: Album) {
    console.info(`Refresh from ${album.name}`);    
    for (const e of displayed) {
      e.remove();
      pool.push(e);
    }
    displayed.splice(0, displayed.length);
    const index = datasource.albumIndexFromKey(album.key);
    topIndex = bottomIndex = index;
    // pick from pool
    const albumElement = getElement();
    await populateElement(albumElement, album, filter);
    $(albumElement).css("top", "0"); //index === 0 ? "0" : "100px");
    albumElement.attr("index", index.toString());
    albumElement.css("opacity", "1");
    container.append(albumElement);
    container.get().scrollTo({ top: 0 });
    displayed.push(albumElement);
    updateHighlighted();
    console.info("Refreshed album, will reflow");
    doReflow |= REFLOW_FULL;
    doRepopulate = true;
  }

  events.on("selected", ({ album }) => {
    refreshViewStartingFrom(album);
  });

  async function startGallery(filter: string) {
    let initialList: AlbumEntry[] = [];
    let initialIndex = 0;
    if (SelectionManager.get().selected().length > 0) {
      initialIndex = 0;
      initialList = SelectionManager.get().selected();
    } else {
      const v = visibleElement();
      const album = albumFromElement(v!, elementPrefix)!;
      const s = await getService();
      const assets = (await s.media(album, filter)).entries;
      initialList = assets;
    }

    appEvents.emit("show", { initialIndex, initialList });
  }
  return photoList;
}

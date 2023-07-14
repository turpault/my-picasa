import { MAX_STAR } from "../../shared/lib/shared-constants";
import { lock, range } from "../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumWithData,
  JOBNAMES,
} from "../../shared/types/types";
import { AlbumIndexedDataSource } from "../album-data-source";
import { getAlbumInfo } from "../folder-utils";
import { $, _$, albumFromElement, setIdForAlbum } from "../lib/dom";
import { toggleStar } from "../lib/handles";
import {
  getSettings,
  getSettingsEmitter,
  updateFilterByStar,
  updateFilterByVideos,
} from "../lib/settings";
import { getService } from "../rpc/connect";
import { AlbumEntrySelectionManager } from "../selection/selection-manager";
import { AlbumListEventSource, AppEventSource } from "../uiTypes";
import { Button, message } from "./message";
import { t } from "./strings";
import {
  entryAboveBelow,
  entryLeftRight,
  makeNThumbnails,
  makeThumbnailManager,
  onDrop,
  selectThumbnailsInRect,
  thumbnailData,
} from "./thumbnail";

const extra = `
<div class="w3-dropdown-hover w3-right filter-menu">
  <button
    class="w3-button filter-button"
  >Filtres</button>
  <div class="filter-menu-items w3-dropdown-content w3-bar-block w3-card-4">
    <a class="filter-videos w3-bar-item w3-button">${t("Only Videos")}</a>
  </div>
</div>`;
// Create two elements, allergic to visibility
const elementPrefix = "photolist:";
const html = `<div class="w3-theme images-area">
<div class="images disable-scrollbar"><div class="invisible-pixel"/></div>
<div style="display: none" class="dragregion"></div>
</div>
`;

const thumbElementPrefix = "thumb:";
const initialVerticalPosition = 10000;

export async function makePhotoList(
  appEvents: AppEventSource,
  dataSource: AlbumIndexedDataSource,
  selectionManager: AlbumEntrySelectionManager
): Promise<_$> {
  appEvents.emit("ready", { state: false });
  let tabIsActive = false;
  let ready = false;
  let topIndex: number = -1;
  let bottomIndex: number = -1;
  const pool: _$[] = [];
  const displayed: _$[] = [];
  const photoList = $(html);
  const topMenu = $(extra);
  const menuItems = $(".filter-menu-items", topMenu);
  const filterByVideos = $(".filter-videos", menuItems);
  filterByVideos.on("click", () =>
    updateFilterByVideos(!getSettings().filters.video)
  );
  range(1, MAX_STAR - 1).forEach((star) => {
    const item = $(
      `<a class="w3-bar-item w3-button filter-favorites-${star}">${
        t("Only Favorites") + ` ${star}`
      }</a>`
    );
    item.on("click", () =>
      updateFilterByStar(getSettings().filters.star === star ? 0 : star)
    );
    menuItems.append(item);
  });
  getSettingsEmitter().on("changed", () => {
    const settings = getSettings();
    filterByVideos.addRemoveClass("list-check", settings.filters.video);
    range(1, MAX_STAR - 1).forEach((star) => {
      $(`.filter-favorites-${star}`, menuItems).addRemoveClass(
        "list-check",
        settings.filters.star === star
      );
    });
  });

  photoList.append(topMenu);

  const container = $(".images", photoList);
  // Bind thumbnails display with selection
  makeThumbnailManager(thumbElementPrefix, selectionManager);

  const dragElement = $(".dragregion", photoList);
  const dragStartPos = { x: 0, y: 0 };
  let dragging = false;
  let doReflow = 0; // bit field
  let doRepopulate = false;
  const REFLOW_FULL = 2;
  const REFLOW_TRIGGER = 1;

  let running = false;
  let filter = "";
  const events = dataSource.emitter;

  // UI State events
  const off = [
    appEvents.on("tabChanged", ({ win }) => {
      tabIsActive = $(container).isParent(win);
    }),
    appEvents.on("keyDown", async ({ code, win, meta, shift }) => {
      if (!tabIsActive) return;
      switch (code) {
        case "Space":
          if (selectionManager.selected().length > 0) {
            toggleStar(selectionManager.selected());
          }
          break;
        case "ArrowLeft":
        case "ArrowRight":
          {
            const entry = selectionManager.last();
            if (entry) {
              const e = entryLeftRight(
                entry,
                thumbElementPrefix,
                code === "ArrowRight"
              );
              if (e) {
                if (!meta && !shift) {
                  selectionManager.clear();
                }
                selectionManager.select(e);
              }
            }
          }
          break;
        case "ArrowUp":
        case "ArrowDown":
          {
            const entry = selectionManager.last();
            if (entry) {
              const e = entryAboveBelow(
                entry,
                thumbElementPrefix,
                code === "ArrowDown"
              );
              if (e) {
                if (!meta && !shift) {
                  selectionManager.clear();
                }
                selectionManager.select(e);
              }
            }
          }
          break;
        /*
        case "Enter":
          startGallery(filter);
          break;
          */
        default:
      }
    }),
    events.on("filterChanged", (event) => {
      filter = event.filter;
    }),
    events.on("thumbnailDblClicked", async (event) => {
      const s = await getService();
      const { entries } = await s.media(event.entry.album);
      const initialIndex = entries.findIndex(
        (e: AlbumEntry) => e.name === event.entry.name
      );
      if (initialIndex === -1) {
        return;
      }

      appEvents.emit("edit", { initialIndex, initialList: entries });
    }),
    appEvents.on("editSelect", (e) => {
      if (selectionManager.selected().length === 1) {
        selectionManager.clear();
        selectionManager.select(e.entry);
      }
    }),

    events.on("thumbnailClicked", (e) => {
      let from = selectionManager.last();
      if (e.modifiers.range && from !== undefined) {
        // All the elements between this and the last
        let to = e.entry;

        if (from.album.key !== to.album.key) {
          // Multi album range selection
          // Which one is the first ?
          if (
            dataSource.albumIndexFromKey(from.album.key) >
            dataSource.albumIndexFromKey(to.album.key)
          ) {
            // swap
            const _a = from;
            from = to;
            to = _a;
          }
          const fromAlbumIndex = dataSource.albumIndexFromKey(from.album.key);
          const toAlbumIndex = dataSource.albumIndexFromKey(to.album.key);

          for (const idx of range(fromAlbumIndex, toAlbumIndex)) {
            const album = dataSource.albumAtIndex(idx);
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
              for (const sel of fromAlbumIndex < toAlbumIndex
                ? sels
                : sels.reverse()) {
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
            for (const sel of start < end ? sels : sels.reverse()) {
              selectionManager.select(sel);
            }
          });
        }
      } else if (e.modifiers.multi) {
        selectionManager.toggle(e.entry);
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
  container.on("click", (e: MouseEvent) => {
    if (!dragging) {
      // I'm not dragging. let's unselect things
      const multi = e.metaKey;
      if (!multi) {
        selectionManager.clear();
      }
      return;
    }
    var rect = container.get().getBoundingClientRect();
    e.stopPropagation();
    dragging = false;
    dragElement.css({ display: "none" });
    const newPos = { x: e.clientX - rect.x, y: e.clientY - rect.y };
    if (!e.metaKey) {
      selectionManager.clear();
    }
    selectThumbnailsInRect(
      container,
      newPos,
      dragStartPos,
      selectionManager,
      thumbElementPrefix
    );
    // Find all the elements intersecting with the area.
  });
  container.on("mousedown", (e: MouseEvent) => {
    // save start position
    var rect = container.clientRect();
    dragStartPos.x = e.clientX - rect.x;
    dragStartPos.y = e.clientY - rect.y;
    return false;
  });
  container.on("mousemove", (e: MouseEvent) => {
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

  function moveToPool(element: _$) {
    pool.push(element);
    element.remove();
    const i = displayed.findIndex((e) => e.get() === element.get());
    if (i !== -1) {
      displayed.splice(i, 1);
    }
  }
  container.attachData({
    events: [
      events.on("invalidateAt", async (event) => {
        // Check if the album should be redrawn or not
        const element = elementAtIndex(event.index);
        if (element) {
          const hasChanged = await populateElement(
            element,
            dataSource.albumAtIndex(event.index),
            filter
          );
          if (hasChanged) {
            doReflow |= REFLOW_FULL;
          }
        }
      }),
      events.on("invalidateFrom", (event) => {
        invalidateFrom(event.index, event.to);
      }),
    ],
  });

  async function invalidateFrom(index: number, to: number) {
    if (displayed.length === 0) {
      // Nothing to invalidate, nothing is displayed
      return;
    }
    if (
      indexOf(displayed[0]) > to ||
      indexOf(displayed[displayed.length - 1]) < index
    ) {
      // Nothing to invalidate, the invalidated data is not displayed
      return;
    }

    const l = await lock("invalidateFrom");
    try {
      // Keep the visible element visible, potentially draw around it
      const visible = visibleIndex();
      // The visible might be impacted, let's clear what's after it
      for (const d of [...displayed]) {
        if (indexOf(d) >= index && indexOf(d) <= to) {
          if (indexOf(d) === visible) {
            await populateElement(
              visibleElement()!,
              dataSource.albumAtIndex(index),
              filter
            );
          } else {
            moveToPool(d);
          }
        }
      }
    } finally {
      l();
    }
    doReflow |= REFLOW_FULL;
  }

  function visibleIndex(): number {
    const e = visibleElement();
    if (!e) return -1;
    return indexOf(e);
    //const album = albumFromElement(e, elementPrefix)!;
    //return datasource.albumIndexFromKey(album.key);
  }

  function elementAtIndex(index: number): _$ | undefined {
    for (const d of displayed) {
      if (d.attr("index") === index.toString()) {
        return d;
      }
    }
    return undefined;
  }

  function indexOf(d: _$): number {
    return parseInt(d.attr("index"));
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
        rebuildViewStartingFrom(album);
      }
    }
  });

  addNewItemsIfNeededAndReschedule();
  async function addNewItemsIfNeededAndReschedule() {
    if (running) debugger;
    running = true;
    const l = await lock("addNewItemsIfNeededAndReschedule");
    try {
      await addNewItemsIfNeeded();
    } catch (e) {
      console.error(e);
    }
    running = false;
    l();
    window.requestAnimationFrame(addNewItemsIfNeededAndReschedule);
  }
  async function addNewItemsIfNeeded() {
    if (!tabIsActive) {
      return;
    }
    if (topIndex === -1) {
      return;
    }
    // Nothing to display, start at topIndex
    if (displayed.length === 0) {
      if (dataSource.length() > 0) {
        const album = dataSource.albumAtIndex(topIndex);
        const albumElement = getElement();
        await populateElement(albumElement, album, filter);
        $(albumElement).css("top", `${initialVerticalPosition}px`); //index === 0 ? "0" : "100px");
        $(".invisible-pixel", container).css({
          top: `${initialVerticalPosition + container.height}px`,
        });
        albumElement.attr("index", topIndex.toString());
        albumElement.css("opacity", "1");
        container.append(albumElement);
        container.get().scrollTo({ top: initialVerticalPosition });
        displayed.push(albumElement);
        updateHighlighted();
      }
    }

    running = true;
    if (doReflow) {
      // reflow
      reflow();
      return;
    } else if (doRepopulate) {
      const minDistancesAboveBelowFold = 1000;

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
                `Pruning album ${album.name} : Visible Area = ${visibleScrollArea.top}/${visibleScrollArea.bottom} - Element (${elemPos.top}/${elemPos.bottom})`
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
            moveToPool(elem);
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
    if (!ready) {
      ready = true;
      console.info("Ready");
      appEvents.emit("ready", { state: true });
    }
  }

  function reflow() {
    if (doReflow === 0) {
      return;
    }
    if (displayed.length === 0) return;
    // full reflow
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
    if (displayedTop < 0) {
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
  ): Promise<boolean> {
    title.innerHTML(album.name);

    const info = await getAlbumInfo(album, true /* use settings */);
    const countChanged = makeNThumbnails(
      element,
      info.assets.length,
      events,
      selectionManager,
      thumbElementPrefix
    );

    const keys = info.assets.map((p) => p.name).reverse();
    let idx = keys.length;
    const p: Promise<void>[] = [];
    const children = element.children();
    for (const name of keys) {
      p.push(
        thumbnailData(
          children[--idx],
          { album, name },
          info.metadata[name],
          selectionManager,
          thumbElementPrefix
        )
      );
    }
    await Promise.allSettled(p);
    return countChanged;
  }
  function updateElement(e: _$, album: AlbumWithData) {
    if (album.shortcut) {
      $(".select-shortcut", e).val(album.shortcut);
    } else {
      $(".select-shortcut", e).val("");
    }
  }

  function getElement(): _$ {
    if (pool.length === 0) {
      const e = $(
        `<div class="album">
        <div class="header w3-bar w3-bar-item">
          <div class="name-container"><div class="name"/></div>
          <button data-tooltip-below="${t(
            "Delete Album"
          )}" class="album-button trash-album w3-button" style="background-image: url(resources/images/icons/actions/trash-50.png)"></button>
          <button data-tooltip-below="${t(
            "Open in Finder"
          )}" class="album-button open-in-finder w3-button" style="background-image: url(resources/images/icons/actions/finder-50.png)"></button>
          <button data-tooltip-below="${t(
            "Edit Album Name"
          )}" class="album-button w3-button edit-album-name" style="background-image: url(resources/images/icons/actions/pen-50.png)"></button>
          <span  style="display: inline-block; width: 10px;" class="album-button"></span>
          <button data-tooltip-below="${t(
            "Sort by Name"
          )}" class="album-button w3-button sort-by-name" style="background-image: url(resources/images/icons/actions/sort-name-50.png)"></button>
          <button data-tooltip-below="${t(
            "Sort by Date"
          )}" class="album-button w3-button sort-by-date" style="background-image: url(resources/images/icons/actions/sort-date-50.png)"></button>
          <button data-tooltip-below="${t(
            "Reverse Sort"
          )}" class="album-button w3-button reverse-sort" style="background-image: url(resources/images/icons/actions/sort-reverse-50.png)"></button>
          <select data-tooltip-below="${t(
            "Select shortcut for this folder"
          )}" class="album-button w3-button select-shortcut select-no-arrow" style="background-image: url(resources/images/icons/actions/finger-50.png)">
          <option value=""></option>
          ${["1", "2", "3", "4", "5", "6", "7", "8", "9"]
            .map((v) => `<option value="${v}">${v}</option>`)
            .join("")}</select>
        </div>
        <div class="photos album-photos"></div>
      </div>
      `
      );
      const title = $(".name", e);
      title.on("blur", async () => {
        title.attr("contenteditable", "false");
        title.removeClass("name-is-focused");
        const newName = title.innerHTML();
        const album = albumFromElement(e, elementPrefix)!;

        const s = await getService();
        s.createJob(JOBNAMES.RENAME_ALBUM, {
          source: album,
          name: newName,
        });
      });
      title.on("focus", async () => {
        title.addClass("name-is-focused");
      });
      title.on("keydown", (ev: KeyboardEvent) => {
        if (ev.code === "Enter") {
          ev.preventDefault();
          $(".edit-album-name", e).get().focus();
        }
      });
      $(".edit-album-name", e).on("click", async () => {
        if (title.attr("contenteditable") === "true") {
          title.attr("contenteditable", "false");
        } else {
          title.attr("contenteditable", "true");
          title.get().focus();
        }
      });

      $(".trash-album", e).on("click", async () => {
        const album = albumFromElement(e, elementPrefix)!;
        const res = await message(t(`Delete the album $1 ?| ${album.name}`), [
          Button.Ok,
          Button.Cancel,
        ]);
        if (res === Button.Ok) {
          const s = await getService();
          s.createJob(JOBNAMES.DELETE_ALBUM, { source: album });
        }
      });

      $(".open-in-finder", e).on("click", async () => {
        const s = await getService();
        const album = albumFromElement(e, elementPrefix)!;
        s.openInFinder(album);
      });

      $(".sort-by-name", e).on("click", async () => {
        const s = await getService();
        const album = albumFromElement(e, elementPrefix)!;
        s.sortAlbum(album, "name");
      });
      $(".sort-by-date", e).on("click", async () => {
        const s = await getService();
        const album = albumFromElement(e, elementPrefix)!;
        s.sortAlbum(album, "date");
      });
      $(".reverse-sort", e).on("click", async () => {
        const s = await getService();
        const album = albumFromElement(e, elementPrefix)!;
        s.sortAlbum(album, "reverse");
      });
      $(".select-shortcut", e).on("change", async () => {
        const s = await getService();
        const album = albumFromElement(e, elementPrefix)!;
        s.setAlbumShortcut(album, $(".select-shortcut", e).val());
      });

      const photosContainer = $(".photos", e);

      photosContainer.on("dragover", async (ev) => {
        ev.preventDefault();
      });
      photosContainer.on("drop", async (ev) => {
        const album = albumFromElement(e, elementPrefix)!;
        onDrop(ev, album, selectionManager, thumbElementPrefix);
      });
      /*
      photosContainer.on("dragenter", (ev) => {
        e.addClass("album-drop-area");
        ev.preventDefault();
      });
      photosContainer.on("dragleave", (ev) => {
        e.removeClass("album-drop-area");
        ev.preventDefault();
      });*/
      title.on("click", async (ev: any) => {
        if (title.attr("contenteditable") === "true") {
          return;
        }
        const album = albumFromElement(e, elementPrefix)!;
        if (album) {
          ev.preventDefault();
          const info = await getAlbumInfo(album, true /* use settings */);
          const multi = ev.metaKey;
          if (!multi) selectionManager.clear();
          for (const e of info.assets) selectionManager.select(e);
        }
      });
      title.on("dblclick", async (ev: any) => {
        if (title.attr("contenteditable") === "true") {
          return;
        }
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
  async function populateElement(
    e: _$,
    album: AlbumWithData,
    filter: string
  ): Promise<boolean> {
    const hasChanged = await albumWithThumbnails(
      album,
      filter,
      $(".name", e),
      $(".photos", e),
      events
    );
    setIdForAlbum(e, album, elementPrefix);
    updateElement(e, album);
    return hasChanged;
  }

  async function addAtTop() {
    if (topIndex > 0) {
      topIndex--;
      const albumElement = getElement();
      const album = dataSource.albumAtIndex(topIndex);
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
    if (bottomIndex < dataSource.length() - 1) {
      bottomIndex++;
      const albumElement = getElement();
      const album = dataSource.albumAtIndex(bottomIndex);
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

  async function rebuildViewStartingFrom(album: Album) {
    if (!album) {
      return;
    }
    const l = await lock("rebuildViewStartingFrom");
    console.info(`Refresh from ${album.name}`);
    for (const e of [...displayed]) {
      moveToPool(e);
    }
    const index = dataSource.albumIndexFromKey(album.key);
    topIndex = bottomIndex = index;

    doReflow |= REFLOW_FULL;
    doRepopulate = true;
    l();
  }

  container.attachData({
    events: [
      events.on("selected", ({ album }) => {
        rebuildViewStartingFrom(album);
      }),
    ],
  });

  async function startGallery() {
    let initialList: AlbumEntry[] = [];
    let initialIndex = 0;
    if (selectionManager.selected().length > 0) {
      initialIndex = 0;
      initialList = selectionManager.selected();
    } else {
      const v = visibleElement();
      const album = albumFromElement(v!, elementPrefix)!;
      const s = await getService();
      const assets = (await s.media(album)).entries;
      initialList = assets;
    }

    appEvents.emit("show", { initialIndex, initialList });
  }
  return photoList;
}

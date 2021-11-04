import { Album, AlbumListEventSource } from "../../shared/types/types.js";
import { FolderMonitor } from "../folder-monitor.js";
import { getFolderInfo } from "../folder-utils.js";
import { $ } from "../lib/dom.js";
import { albumFromId, idFromAlbum } from "../../shared/lib/utils.js";
import { getService } from "../rpc/connect.js";
import { SelectionManager } from "../selection/selection-manager.js";
import { makeNThumbnails, thumbnailData } from "./thumbnail.js";

// Create two elements, allergic to visibility

export function makePhotoList(
  container: HTMLElement,
  monitor: FolderMonitor,
  events: AlbumListEventSource
) {
  let topIndex: number = -1;
  let bottomIndex: number = -1;
  const pool: HTMLElement[] = [];
  const displayed: HTMLElement[] = [];

  $(container).on("scroll", updateHighlighted);

  $(container).on(
    "dragstart",
    (ev: any) => {
      SelectionManager.get().select(ev.target.id);
      ev.dataTransfer.effectAllowed = "move";
      //ev.preventDefault();
    },
    false
  );
  let reflow = false;
  let running = false;
  function updateHighlighted() {
    // Find the first visible element
    const top = container.scrollTop;
    const bottom = container.scrollTop + container.clientHeight;
    let found, previous;
    for (const e of displayed) {
      if (parseInt(e.style.top) >= top) {
        if (parseInt(e.style.top) > bottom) {
          found = previous;
        } else {
          found = e;
        }
        break;
      }
    }

    if (found) {
      const album = albumFromId(found.id);
      console.info(`Now visible album ${album.name}`);
      events.emit("scrolled", {
        album,
      });
    }
  }
  window.requestAnimationFrame(addNewItemsIfNeeded);
  function addNewItemsIfNeeded() {
    if (running) {
      debugger;
    }
    if (!$(container).visible()) {
      window.requestAnimationFrame(addNewItemsIfNeeded);
      return;
    }
    running = true;
    if (reflow) {
      // reflow
      let goneBack = false;
      reflow = false;
      const firstItem = displayed[0];
      const lastItem = displayed[displayed.length - 1];

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
            console.info(`Flowing album ${album.name} : ${elem.style.top}`);
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
            console.info(`Flowing album ${album.name} : ${elem.style.top}`);
          }
          break;
        }
      }
      const displayedTop = parseInt(firstItem.style.top) - 10;
      const displayedBottom =
        parseInt(lastItem.style.top) + lastItem.clientHeight + 10;

      $("#before", container).css("top", `${displayedTop}px`);
      $("#after", container).css("top", `${displayedBottom}px`);

      // Offset, we are < 0
      if (displayedTop < 0 || displayedTop > 1000) {
        for (const c of container.children) {
          const thisTop = parseInt((c as HTMLElement).style.top);
          (c as HTMLElement).style.top = `${thisTop - displayedTop}px`;
        }
        container.scrollBy({ top: -displayedTop });
      }

      running = false;
      window.requestAnimationFrame(addNewItemsIfNeeded);
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
          if (
            elemPos.bottom < visibleScrollArea.top ||
            elemPos.top > visibleScrollArea.bottom
          ) {
            const album = albumFromId(elem.id);
            console.info(`Pruning album ${album.name}`);
            prune.push(elem);
          }
        }
        if (prune.length) {
          for (const elem of prune) {
            displayed.splice(displayed.indexOf(elem), 1);
            elem.parentElement?.removeChild(elem);
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
      if (promises.length) {
        reflow = true;
        Promise.allSettled(promises).finally(() => {
          running = false;
          window.requestAnimationFrame(addNewItemsIfNeeded);
        });
      } else {
        running = false;
        window.requestAnimationFrame(addNewItemsIfNeeded);
      }
    }

    getService().then((service) => {
      service.on("folderChanged", (folders: string[]) => {
        for (const d of displayed) {
          const album = albumFromId(d.id);
          if (folders.includes(album.key)) {
            populateElement(d, album);
          }
        }
      });
    });
  }

  function albumWithThumbnails(
    album: Album,
    title: HTMLElement,
    element: HTMLElement,
    events: AlbumListEventSource
  ) {
    title.innerText = album.name;

    return getFolderInfo(album).then((info) => {
      makeNThumbnails(element, info.pictures.length, events);

      const keys = info.pictures.map((p) => p.name).reverse();
      let idx = keys.length;
      for (const name of keys) {
        thumbnailData(element.children[--idx] as HTMLElement, { album, name });
      }
    });
  }

  function getElement(): HTMLElement {
    if (pool.length === 0) {
      pool.push(
        $(`<div class="album">
        <div id="header" class="w3-bar">
        <a id="name" class="w3-bar-item w3-black"></a>
        </div>
        <div id="photos" class="album-photos"></div>
      </div>
      `).get()
      );
    }
    const e = pool.pop()!;
    return e;
  }
  async function populateElement(e: HTMLElement, album: Album) {
    await albumWithThumbnails(
      album,
      $("#name", e).get(),
      $("#photos", e).get(),
      events
    );
    e.id = idFromAlbum(album);
    $(e).css({ top: `0px`, opacity: 0 });
  }

  async function addAtTop() {
    if (topIndex > 0) {
      topIndex--;
      const albumElement = getElement();
      const album = monitor.albumAtIndex(bottomIndex);
      populateElement(albumElement, album);
      albumElement.setAttribute("index", topIndex.toString());
      container.insertBefore(albumElement, container.firstChild!.nextSibling);
      displayed.unshift(albumElement);
      console.info(`Adding album ${album.name} at end`);
    }
  }

  async function addAtBottom() {
    if (bottomIndex < monitor.length() - 1) {
      bottomIndex++;
      const albumElement = getElement();
      const album = monitor.albumAtIndex(bottomIndex);
      populateElement(albumElement, album);
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
    $(albumElement).css("top", index === 0 ? "0" : "100px");
    albumElement.setAttribute("index", index.toString());
    container.appendChild(albumElement);
    container.scrollTo({ top: 0 });
    displayed.push(albumElement);
    updateHighlighted();
  }

  monitor.events.on("updated", (event) => {});
  events.on("selected", ({ album }) => {
    refresh(album);
  });
}

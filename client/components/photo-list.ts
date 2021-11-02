import { AlbumListEventSource, Folder } from "../../shared/types/types.js";
import { FolderMonitor } from "../folder-monitor.js";
import { getFolderInfo } from "../folder-utils.js";
import { $ } from "../lib/dom.js";
import { makeNThumbnails, thumbnailData } from "./thumbnail.js";

// Create two elements, allergic to visibility

export function make(
  container: HTMLElement,
  monitor: FolderMonitor,
  select: AlbumListEventSource
) {
  let topIndex: number = -1;
  let bottomIndex: number = -1;

  let options = {
    root: container,
    rootMargin: "0px",
    threshold: 1.0,
  };

  const callback = (
    entries: IntersectionObserverEntry[],
    observer: IntersectionObserver
  ) => {
    entries.forEach((entry) => {
      // Each entry describes an intersection change for one observed
      // target element:
      //   entry.boundingClientRect
      //   entry.intersectionRatio
      //   entry.intersectionRect
      //   entry.isIntersecting
      //   entry.rootBounds
      //   entry.target
      //   entry.time
    });
  };
  let observer = new IntersectionObserver(callback, options);
  // observer.observe(top);
  // observer.observe(bottom);

  let reflow = false;
  let running = false;
  window.requestAnimationFrame(addNewItemsIfNeeded);
  function addNewItemsIfNeeded() {
    if (running) {
      debugger;
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
            console.info(
              `Flowing album ${elem.getAttribute("name")} : ${elem.style.top}`
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
            console.info(
              `Flowing album ${elem.getAttribute("name")} : ${elem.style.top}`
            );
          }
          break;
        }
      }
      const displayedTop = parseInt(firstItem.style.top) - 100;
      const displayedBottom =
        parseInt(lastItem.style.top) + lastItem.clientHeight + 100;

      $("#before", container).css("top", `${displayedTop}px`);
      $("#after", container).css("top", `${displayedBottom}px`);

      // Find the first visible element
      const top = container.scrollTop;
      const bottom = container.scrollTop + container.clientHeight;
      let found, previous;
      for (const e of displayed) {
        if (parseInt(e.style.top) > top) {
          if (parseInt(e.style.top) > bottom) {
            found = previous;
            break;
          } else {
            found = e;
          }
        }
      }

      if (found) {
        console.info(`Now visible album ${found.getAttribute("name")}`);
        const index = parseInt(found.getAttribute("index")!);
        select.emit("scrolled", {
          folder: monitor.folders[index],
          index,
        });
      }

      // Offset, we are < 0
      if (displayedTop < 0) {
        for (const c of container.children) {
          const thisTop = parseInt((c as HTMLElement).style.top);
          (c as HTMLElement).style.top = `${thisTop - displayedTop}px`;
        }
        container.scrollBy({ top: -displayedTop });
      }

      running = false;
      window.requestAnimationFrame(addNewItemsIfNeeded);
    } else {
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
          console.info(`Pruning album ${elem.getAttribute("name")}`);
          prune.push(elem);
        }
      }
      for (const elem of prune) {
        displayed.splice(displayed.indexOf(elem), 1);
        elem.parentElement?.removeChild(elem);
        pool.push(elem);
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
        parseInt(lastItem.style.top) + lastItem.clientHeight <
          container.scrollTop + container.clientHeight
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
  }

  monitor.events.on("updated", (event) => {});
  const pool: HTMLElement[] = [];
  const displayed: HTMLElement[] = [];
  select.on("selected", (event) => {
    refresh(event!.index);
  });

  function albumWithThumbnails(
    f: Folder,
    title: HTMLElement,
    element: HTMLElement
  ) {
    title.innerText = f.name;

    return getFolderInfo(f).then((info) => {
      makeNThumbnails(element, info.pictures.length);

      const keys = info.pictures.map((p) => p.name).reverse();
      let idx = keys.length;
      for (const k of keys) {
        thumbnailData(
          element.children[--idx] as HTMLElement,
          f,
          k,
          monitor.idFromFolderAndName(f, k)
        );
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
  async function addAtTop() {
    if (topIndex > 0) {
      topIndex--;
      const albumElement = getElement();
      await albumWithThumbnails(
        monitor.folders[topIndex],
        $("#name", albumElement).get(),
        $("#photos", albumElement).get()
      );
      albumElement.setAttribute("name", monitor.folders[topIndex].name);
      albumElement.setAttribute("index", topIndex.toString());
      $(albumElement).css({ top: `0px`, opacity: 0 });
      container.insertBefore(albumElement, container.firstChild!.nextSibling);
      displayed.unshift(albumElement);
    }
  }

  async function addAtBottom() {
    if (bottomIndex < monitor.folders.length - 1) {
      bottomIndex++;
      const albumElement = getElement();
      await albumWithThumbnails(
        monitor.folders[bottomIndex],
        $("#name", albumElement).get(),
        $("#photos", albumElement).get()
      );
      albumElement.setAttribute("name", monitor.folders[bottomIndex].name);
      albumElement.setAttribute("index", bottomIndex.toString());
      $(albumElement).css({ top: `0px`, opacity: 0 });
      container.insertBefore(albumElement, container.lastChild);
      displayed.push(albumElement);
    }
  }

  async function refresh(index: number) {
    for (const e of displayed) {
      container.removeChild(e);
      pool.push(e);
    }
    displayed.splice(0, displayed.length);
    topIndex = bottomIndex = index;
    // pick from pool
    const albumElement = getElement();
    $(albumElement).css("top", "100px");
    await albumWithThumbnails(
      monitor.folders[index],
      $("#name", albumElement).get(),
      $("#photos", albumElement).get()
    );
    albumElement.setAttribute("name", monitor.folders[index].name);
    albumElement.setAttribute("index", index.toString());
    container.appendChild(albumElement);
    container.scrollTo({ top: 0 });
    displayed.push(albumElement);
    index++;
  }
}

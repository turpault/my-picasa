import { FolderMonitor } from "../folder-monitor.js";
import { getFolderInfo } from "../folder-utils.js";
import { Emitter } from "../../shared/lib/event.js";
import { AlbumListEvent, Folder } from "../../shared/types/types.js";
import { makeNThumbnails, thumbnailData } from "./thumbnail.js";

// Create two elements, allergic to visibility
const top = document.createElement("div");
const bottom = document.createElement("div");
let bottomVisible: boolean = true;
let topIndex = -1;

export function make(
  e: HTMLElement,
  monitor: FolderMonitor,
  select: Emitter<AlbumListEvent>
): void {
  e.appendChild(top);
  e.appendChild(bottom);

  let options = {
    root: e,
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
      if (entry.target === bottom) {
        bottomVisible = entry.isIntersecting;
      }
    });
  };
  let observer = new IntersectionObserver(callback, options);
  observer.observe(top);
  observer.observe(bottom);

  monitor.events.on("updated", (event) => {});
  const pool = new Set<HTMLElement>();
  const visible = new Set<HTMLElement>();
  select.on("selected", (event) => {
    refresh(event!.index, event!.folder, e, monitor, pool, visible);
  });

  function albumWithThumbnails(f: Folder, element: HTMLElement) {
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

  async function refresh(
    index: number,
    folder: Folder,
    container: HTMLElement,
    monitor: FolderMonitor,
    pool: Set<HTMLElement>,
    displayed: Set<HTMLElement>
  ) {
    for (const e of displayed) {
      container.removeChild(e);
      pool.add(e);
      displayed.delete(e);
    }

    topIndex = index;
    while (true) {
      // pick from pool
      if (pool.size === 0) {
        pool.add(document.createElement("div"));
      }
      const e = pool.values().next().value;
      pool.delete(e);
      await albumWithThumbnails(monitor.folders[index], e);
      container.appendChild(e);
      displayed.add(e);
      index++;
      break;
    }
  }
}

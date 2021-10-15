import {
  emptyPlaceHolder,
  loadMore,
  makeNThumbnails,
  picture,
} from "../element-templates.js";
import { Folder, FolderMonitor } from "../folder-monitor.js";
import { getFolderInfo, thumbnail } from "../folder-utils.js";
import {
  default as Infinite,
  default as InfiniteList,
} from "../lib/infinite-list/InfiniteList.js";

export function make(e: HTMLElement, monitor: FolderMonitor): {} {
  const infiniteList = Infinite({
    itemRenderer: (index: number, domElement: HTMLElement) => {
      emptyPlaceHolder(domElement);
      if (index < monitor.folders.array.length) {
        albumWithThumbnails(monitor.folders.array[index], domElement, () => {
          infiniteList.refreshItemHeight(index);
        });
      }
    },
    loadMoreRenderer: (index: number, domElement: HTMLElement) => {
      loadMore(domElement);
    },
    itemTypeGetter: (index: number): String => {
      return "album";
    },

    pageFetcher: (fromIndex: number, callback: Function) => {
      monitor.events.once("added", () => {
        callback(monitor.folders.array.length - fromIndex, true);
      });
    },

    initialPage: {
      hasMore: true,
      itemsCount: 0,
    },
  });
  infiniteList.attach(e);

  monitor.events.on("added", (event: { folder: Folder; index: number }) => {
    infiniteList.refreshItemHeight(event.index);
  });
  monitor.events.on("updated", (event: { folder: Folder; index: number }) => {
    infiniteList.refreshItemHeight(event.index);
  });
  return InfiniteList;
}

export function albumWithThumbnails(
  f: Folder,
  element: HTMLElement,
  callback: Function
) {
  getFolderInfo(f)
    .then((info) => {
      let idx = 0;
      makeNThumbnails(element, Object.keys(info.image).length);

      for (const k in info.image) {
        const p = element.children[idx++] as HTMLImageElement;
        p.src = "resources/images/loading250.gif";
        thumbnail(f, k).then((img) => {
          p.src = img;
        });
      }
    })
    .then(() => callback());
}

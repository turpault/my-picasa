import { loadMore } from "../element-templates.js";
import { FolderMonitor } from "../folder-monitor.js";
import { getFolderInfo, thumbnail } from "../folder-utils.js";
import {
  default as Infinite,
  default as InfiniteList,
} from "../lib/infinite-list/InfiniteList.js";
import { Folder } from "../types/types.js";
import { emptyPlaceHolder, makeNThumbnails } from "./thumbnail.js";

export function make(e: HTMLElement, monitor: FolderMonitor): {} {
  const infiniteList = Infinite({
    itemRenderer: (index: number, domElement: HTMLElement) => {
      emptyPlaceHolder(domElement);
      if (index < monitor.folders.length) {
        albumWithThumbnails(monitor.folders[index], domElement, () => {
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

    pageFetcher: (fromIndex: number, callback: Function) => {},

    initialPage: {
      hasMore: true,
      itemsCount: 0,
    },
  });
  infiniteList.attach(e);

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
      makeNThumbnails(element, info.pictures.length);

      for (const k in info.pixels) {
        const p = element.children[idx++] as HTMLImageElement;
        p.src = "resources/images/loading250.gif";
        thumbnail(f, k).then((img) => {
          p.src = img;
        });
      }
    })
    .then(() => callback());
}

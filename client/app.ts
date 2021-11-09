import { __, _$ } from "../client/lib/dom.js";
import { buildEmitter } from "../shared/lib/event.js";
import { makeAlbumList } from "./components/album-list.js";
import { makeEditorPage } from "./components/editor-page.js";
import { makeJobList } from "./components/joblist.js";
import { makeMetadata } from "./components/metadata.js";
import { makePhotoList } from "./components/photo-list.js";
import { FolderMonitor } from "./folder-monitor.js";
import { SelectionManager } from "./selection/selection-manager.js";
import { AlbumListEvent } from "./types/types.js";

function init() {
  const monitor = new FolderMonitor();
  const emitter = buildEmitter<AlbumListEvent>();

  makeJobList(__(".jobs").get());
  makeAlbumList(__(".browser").get(), monitor, emitter);
  makePhotoList(__(".images").get(), monitor, emitter);

  makeMetadata(
    __(".metadatasidebar").get()!,
    SelectionManager.get().events,
    monitor
  );

  //makeContextMenu();

  const tabs = __(".tabs");
  const tabElements: { tab: _$; win: _$ }[] = [
    { tab: __(".browser-tab"), win: __(".browser") },
  ];

  __(".browser-tab").on("click", () => {
    selectTab(__(".browser-tab").get());
  });

  function selectTab(_tab: HTMLElement) {
    for (const e of tabElements) {
      if (e.tab.get() === _tab) {
        tabElements.splice(tabElements.indexOf(e), 1);
        tabElements.push(e);
        break;
      }
    }
    for (const e of tabElements) {
      e.tab.removeClass("highlight");
      e.win.css("display", "none");
    }
    const last = tabElements[tabElements.length - 1];

    last.tab.addClass("highlight");
    last.win.css("display", "");
    emitter.emit("tabChanged", last);
  }

  function deleteTab(_tab: HTMLElement) {
    for (const e of tabElements) {
      if (e.tab.get() === _tab) {
        e.tab.remove();
        e.win.remove();
        tabElements.splice(tabElements.indexOf(e), 1);
      }
    }
    const last = tabElements[tabElements.length - 1];
    selectTab(last.tab.get());
  }

  emitter.on("open", async ({ album, name }) => {
    const win = __(await makeEditorPage(album, name));

    const tab = __(
      `<a class="w3-button tab-button">${name}<span class="remove-tab">&times;</span></a>`
    );
    tabs.append(tab);
    tab.on("click", () => {
      selectTab(tab.get());
    });
    __(".remove-tab", tab).on("click", () => {
      deleteTab(tab.get());
    });

    __(".workarea").append(win);
    tabElements.push({ tab, win });
    selectTab(tab.get());
  });

  selectTab(tabElements[0].win.get());

  document.addEventListener("keydown", (ev: KeyboardEvent) => {
    ev.preventDefault();
    const activeTab = tabElements[tabElements.length - 1];
    emitter.emit("keyDown", {
      code: ev.code,
      tab: activeTab.win.get(),
    });
  });
}

window.addEventListener("load", () => {
  init();
});

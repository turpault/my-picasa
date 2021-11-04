import { $, _$ } from "../client/lib/dom.js";
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

  makeJobList($("#jobs").get());
  makeAlbumList($("#folders").get(), monitor, emitter);
  makePhotoList($("#images").get(), monitor, emitter);

  makeMetadata(
    $("#metadatasidebar").get()!,
    SelectionManager.get().events,
    monitor
  );

  //makeContextMenu();

  const tabs = $("#tabs");
  const tabElements: { tab: _$; win: _$ }[] = [
    { tab: $("#browser-tab"), win: $("#main") },
  ];

  $("#browser-tab").on("click", () => {
    selectTab($("#browser-tab").get());
  });
  function selectTab(_tab: HTMLElement) {
    for (const { tab, win } of tabElements) {
      if (tab.get() === _tab) {
        tab.addClass("highlight");
        win.css("display", "");
      } else {
        tab.removeClass("highlight");
        win.css("display", "none");
      }
    }
  }
  function deleteTab(_tab: HTMLElement) {
    for (const { tab, win } of tabElements) {
      if (tab.get() === _tab) {
        tab.remove();
        win.remove();
      }
    }
  }
  emitter.on("open", async ({ album, name }) => {
    const win = $(await makeEditorPage(album, name));

    const tab = $(
      `<a class="w3-button tab-button">${name}<span id="remove">&times;</span></a>`
    );
    tabs.append(tab);
    tab.on("click", () => {
      selectTab(tab.get());
    });
    $("#remove", tab).on("click", () => {
      deleteTab(tab.get());
    });
    $("#workarea").append(win);
    tabElements.push({ tab, win });
    selectTab(tab.get());
  });
}

window.addEventListener("load", () => {
  init();
});

import { $, _$ } from "../lib/dom";
import { Emitter } from "../lib/event";
import {
  getSettings,
  getSettingsEmitter,
  updateFilter,
  updateFilterByStar,
  updateFilterByVideos,
  updateSort,
} from "../lib/settings";
import { getService } from "../rpc/connect";
import { AlbumListEvent, undoStep } from "../types/types";

let tabs: _$;
let tabElements: { tab: _$; win: _$ }[] = [];
let emitter: Emitter<AlbumListEvent>;
export async function makeTabs(_emitter: Emitter<AlbumListEvent>) {
  emitter = _emitter;
  tabs = $(".tabs");
  const browser = $(".browser-tab");
  tabElements = [{ tab: browser, win: $(".browser") }];

  browser.on("click", () => {
    selectTab(browser.get());
  });
  selectTab(browser.get());

  const fStar = $("#FilterStar").on("click", () =>
    updateFilterByStar(!getSettings().filters.star)
  );
  const fFilterVideo = $("#FilterVideo").on("click", () =>
    updateFilterByVideos(!getSettings().filters.video)
  );
  const fSortByDate = $("#SortByDate").on("click", () => updateSort("date"));
  const fSortByName = $("#SortByName").on("click", () => updateSort("name"));
  const fFilter = $("#filter");
  fFilter.on("input", () => updateFilter(fFilter.val()));
  function updateSettings() {
    const settings = getSettings();
    fStar.addRemoveClass("highlight", settings.filters.star);
    fFilterVideo.addRemoveClass("highlight", settings.filters.video);
    fSortByDate.addRemoveClass("highlight", settings.sort === "date");
    fSortByName.addRemoveClass("highlight", settings.sort === "name");
    fFilter.addRemoveClass("highlight", settings.filter !== "");
    fFilter.val(settings.filter);
  }
  updateSettings();
  getSettingsEmitter().on("changed", updateSettings);

  const s = await getService();
  async function updateUndoList() {
    const list = (await s.undoList()) as undoStep[];
    const e = $("#undo");
    e.empty();
    for (const u of list.reverse()) {
      e.append(
        $(`<a class="w3-bar-item w3-button">${u.description}</a>`).on(
          "click",
          () => {
            s.undo(u.uuid);
          }
        )
      );
    }
  }
  s.on("undoChanged", updateUndoList);
  await updateUndoList();
}

export function selectTab(_tab: HTMLElement) {
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

export function deleteTab(_tab: HTMLElement) {
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

export function deleteTabWin(_win: HTMLElement) {
  for (const e of tabElements) {
    if (e.win.get() === _win) {
      emitter.emit("tabDeleted", e);
      e.tab.remove();
      e.win.remove();
      tabElements.splice(tabElements.indexOf(e), 1);
    }
  }
  const last = tabElements[tabElements.length - 1];
  selectTab(last.tab.get());
}

export function makeTab(win: _$, tab: _$) {
  tabs.append(tab);
  tab.on("click", () => {
    selectTab(tab.get());
  });
  $(".remove-tab", tab).on("click", () => {
    deleteTab(tab.get());
  });

  $(".workarea").append(win);
  tabElements.push({ tab, win });
  selectTab(tab.get());
}

export function activeTab() {
  return tabElements[tabElements.length - 1];
}

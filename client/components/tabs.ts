import { $, _$ } from "../lib/dom.js";
import { Emitter } from "../lib/event.js";
import { AlbumListEvent } from "../types/types.js";

let tabs: _$;
let tabElements: { tab: _$; win: _$ }[] = [];
let emitter: Emitter<AlbumListEvent>;
export function makeTabs(_emitter: Emitter<AlbumListEvent>) {
  emitter = _emitter;
  tabs = $(".tabs");
  const browser = $(".browser-tab");
  tabElements = [{ tab: browser, win: $(".browser") }];

  browser.on("click", () => {
    selectTab(browser.get());
  });
  selectTab(browser.get());
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

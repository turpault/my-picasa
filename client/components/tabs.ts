import { undoStep } from "../../shared/types/types";
import { $, _$ } from "../lib/dom";
import { Emitter } from "../lib/event";
import { getService } from "../rpc/connect";
import { AppEventSource, TabContext } from "../uiTypes";

const genericTab = `<a class="w3-button tab-button"><span class="label"></span><span class="remove-tab">&times;</span></a>`;
const genericTools = `<a class="w3-button tab-button">Close</a>`;

export type TabEvent = {
  rename: { name: string };
};

export type TabEventEmitter = Emitter<TabEvent>;

export function makeGenericTab(tabEvent: TabEventEmitter): _$ {
  const e = $(genericTab);
  const label = $(".label", e);
  tabEvent.on("rename", ({ name }) => {
    label.text(name);
  });
  $(".remove-tab", e).on("click", () => {
    deleteTab(e);
  });

  return e;
}

let tabs: _$;
let tabElements: { tab: _$; win: _$, context: TabContext }[] = [];
let emitter: AppEventSource;
export  function makeTabs(_emitter: AppEventSource) {
  emitter = _emitter;
  const html = $(`
  <div class="fill">
    <div class="w3-bar main-tab-bar">
      <span class="tabs">
      </span>
    </div>
    <div class="workarea">
    </div>
  </div>
`);
  tabs = $(".tabs", html);
  return html;
}

export function selectTab(_tab: _$) {
  for (const e of tabElements) {
    if (e.tab.get() === _tab.get()) {
      tabElements.splice(tabElements.indexOf(e), 1);
      tabElements.push(e);
      break;
    }
  }
  for (const e of tabElements) {
    e.tab.removeClass("tab-button-highlight");
    e.win.css("z-index", 0);
  }
  const last = tabElements[tabElements.length - 1];

  last.tab.addClass("tab-button-highlight");
  last.win.css("z-index", 1);
  emitter.emit("tabChanged", last);
}

export function deleteTab(_tab: _$) {
  for (const e of tabElements) {
    if (e.tab.get() === _tab.get()) {
      emitter.emit("tabDeleted", e);
      e.tab.remove();
      e.win.remove();
      tabElements.splice(tabElements.indexOf(e), 1);
    }
  }
  const last = tabElements[tabElements.length - 1];
  selectTab(last.tab);
}

export function deleteTabWin(_win: _$) {
  for (const e of tabElements) {
    if (e.win.get() === _win.get()) {
      emitter.emit("tabDeleted", e);
      e.tab.remove();
      e.win.remove();
      tabElements.splice(tabElements.indexOf(e), 1);
    }
  }
  const last = tabElements[tabElements.length - 1];
  selectTab(last.tab);
}

export function makeTab(win: _$, tab: _$, context: TabContext) {
  tabs.append(tab);
  tab.on("click", () => {
    selectTab(tab);
  });

  $(".workarea").append(win);
  tabElements.push({ tab, win, context });
  selectTab(tab);

  emitter.emit("tabDisplayed", { tab, win, context });
}

export function activeTab() {
  return tabElements[tabElements.length - 1];
}
export function activeTabContext() {
  return tabElements[tabElements.length - 1].context;
}

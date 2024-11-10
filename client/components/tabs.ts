import { AlbumEntry } from "../../shared/types/types";
import { $, _$ } from "../lib/dom";
import { Emitter } from "../lib/event";
import { idFromAlbumEntry } from "../../shared/lib/utils";
import { SelectionManagerProxy } from "../selection/selection-manager";
import { AppEventSource, ApplicationState, TabContext } from "../uiTypes";

const genericTab = `<a class="tab-button"><span class="label"></span><span class="remove-tab">&times;</span></a>`;

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
let tabElements: { tab: _$; win: _$; context: TabContext }[] = [];
let emitter: AppEventSource;
let state: ApplicationState;
export function makeTabs(_emitter: AppEventSource, _state: ApplicationState) {
  emitter = _emitter;
  state = _state;
  const html = $(`
  <div class="fill">
    <div class="w3-bar main-tab-bar">
      <div class="underline-bar"></div>
      <div class="tabs">
      </div>
    </div>
    <div class="workarea">
    </div>
  </div>
`);
  tabs = $(".tabs", html);

  const activeSelectionManager = new SelectionManagerProxy<AlbumEntry>();
  state.setValueByRef("activeSelectionManager", activeSelectionManager);
  state.events.on("activeTab", (tab) => {
    // get new selection manager
    const selManager = tab?.context?.selectionManager;
    activeSelectionManager.updateManager(selManager);
  });

  return html;
}

export function selectTab(_tab: _$, closeActive: boolean = false) {
  const active = tabElements[tabElements.length - 1];
  if (closeActive && !active.tab.is(_tab)) {
    deleteTab(active.tab);
  }
  for (const e of tabElements) {
    if (e.tab.is(_tab)) {
      tabElements.splice(tabElements.indexOf(e), 1);
      tabElements.push(e);
      break;
    }
  }
  for (const e of tabElements) {
    e.tab.removeClass("tab-button-highlight");
    e.win.css("z-index", 0);
    e.win.hide();
  }
  const last = tabElements[tabElements.length - 1];

  last.tab.addClass("tab-button-highlight");
  last.win.css("z-index", 1);
  last.win.show();
  _tab.get().scrollIntoView();
  emitter.emit("tabChanged", last);
  state.setValueByRef("activeTab", last);
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

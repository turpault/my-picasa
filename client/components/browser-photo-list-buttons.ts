import { Emitter } from "../../shared/lib/event";
import { debounce } from "../../shared/lib/utils";
import {
  Album,
  AlbumEntry, AlbumMetaData, JOBNAMES, undoStep
} from "../../shared/types/types";
import { thumbnailUrl } from "../imageProcess/client";
import { $, _$ } from "../lib/dom";
import { toggleStar } from "../lib/handles";
import {
  getSettings,
  getSettingsEmitter,
  Settings,
  updateFilterByStar,
  updateFilterByVideos,
  updateIconSize
} from "../lib/settings";
import { getService } from "../rpc/connect";
import { AppEventSource } from "../uiTypes";
import { DropListEvents, makeDropList } from "./controls/dropdown";
import { question } from "./question";
import { t } from "./strings";
import { activeTabContext } from "./tabs";
const html = `<div class="bottom-list-tools">
<div class="w3-bar buttons">
</div>
<div class="selection-thumbs">
</div>
<div class="brightness-photo-list">
  <label>${t("Brightness")}</label>
  <input type="range" min="0" max="20" class="photos-brightness-ctrl slider">
</div>
<div class="zoom-photo-list">
  <label>${t("Icon Size")}</label>
  <input type="range" min="75" max="250" class="photos-zoom-ctrl slider">
</div>
</div>`;

export function makeButtons(appEvents: AppEventSource): _$ {
  const container = $(html);
  const buttons = $(".buttons", container);
  const zoomController = $(".photos-zoom-ctrl", container);

  zoomController.on("input", () => {
    updateIconSize(zoomController.val());
  });
  getSettingsEmitter().on("changed", (event) => {
    if (event.field === "iconSize") zoomController.val(event.iconSize);
  });
  zoomController.val(getSettings().iconSize);
  const state: {
    settings: Settings,
    tabKind:string;
    selection: AlbumEntry[],
    albumMetaData: AlbumMetaData;
    undo: undoStep[]
  } = {
    settings: getSettings(),
    selection: [],
    albumMetaData: {},
    tabKind: '',
    undo: []
  }

  const actions: (
    | {
        name: string;
        icon: string;
        element?: _$;
        type?: "button" | "dropdown";
        click?: (ev: MouseEvent) => any;
        tooltip?: ()=> string;
        visible?: ()=>boolean;
        enabled?: ()=>boolean;
        highlight?: ()=>boolean;
        dropdownReady?: (emitter: Emitter<DropListEvents>) => any;        
      }
    | { element?: _$; click?: (ev: MouseEvent) => any; type: "sep" }
  )[] = [
    {
      name: t("Export All Favorites"),
      icon: "resources/images/icons/actions/export-favorites-50.png",
      visible: ()=> state.tabKind === 'Browser',
      click: async (ev: MouseEvent) => {
        const s = await getService();
        return  s.createJob(JOBNAMES.EXPORT_TO_IPHOTO, {});
      },
    },
    {
      name: t("Export selection to folder"),
      icon: "resources/images/icons/actions/export-50.png",
      visible: ()=> state.tabKind === 'Browser',
      enabled: () => state.selection.length > 0,
      click: async (ev: MouseEvent) => {
        if(state.selection.length >0) {
        const s = await getService();
        return s.createJob(JOBNAMES.EXPORT, {
          source: state.selection,
        });
      }
      },
    },
    {
      name: t("Export displayed image to folder"),
      icon: "resources/images/icons/actions/export-50.png",
      enabled: () => state.selection.length > 0,
      visible: ()=> state.tabKind === 'Editor',
      click: async (ev: MouseEvent) => {
        if(state.selection.length >0) {
        const s = await getService();
        return s.createJob(JOBNAMES.EXPORT, {
          source: state.selection,
        });
      }
      },
    },
    { type: "sep" },
    {
      name: t("Clone Selection"),
      icon: "resources/images/icons/actions/duplicate-50.png",
      visible: ()=> state.tabKind === 'Browser',
      click: async (ev: MouseEvent) => {
        const s = await getService();
        return s.createJob(JOBNAMES.DUPLICATE, {
          source: state.selection,
        });
      },
    },
    {
      name: t("Move selection to new Album"),
      icon: "resources/images/icons/actions/move-to-new-album-50.png",
      enabled: () => state.selection.length > 0,
      visible: ()=> state.tabKind === 'Browser',
      click: (ev: MouseEvent) => {
        question("New album name", "Please type the new album name").then(
          async (newAlbum) => {
            if (newAlbum) {
              const s = await getService();
              s.makeAlbum(newAlbum).then((album: Album) => {
                return s.createJob(JOBNAMES.MOVE, {
                  source: state.selection,
                  destination: { album },
                });
              });
            }
          }
        );
      },
    },
    {
      name: t("Add/Remove favorite"),
      icon: "resources/images/icons/actions/favorites-50.png",
      enabled: () => state.selection.length > 0,
      highlight: ()=> state.selection.length > 0 ? !!state.albumMetaData[state.selection[0].name]?.star : false,
      click: async (ev: MouseEvent) => {
        toggleStar(state.selection);
      },
    },
    {
      name: t("Rotate Selected Left"),
      icon: "resources/images/icons/actions/rotate-left-50.png",
      enabled: () => state.selection.length > 0,
      visible: ()=> state.tabKind === 'Browser',
      click: async (ev: MouseEvent) => {
        const s = await getService();
        s.rotate(state.selection, 'left');
      },
    },
    {
      name: t("Rotate Selected Right"),
      icon: "resources/images/icons/actions/rotate-right-50.png",
      enabled: () => state.selection.length > 0,
      visible: ()=> state.tabKind === 'Browser',
      click: async (ev: MouseEvent) => {
        const s = await getService();
        s.rotate(state.selection, 'right');
      },
    },


    {
      name: t("Create Composition"),
      icon: "resources/images/icons/actions/composition-50.png",
      enabled: () => state.selection.length > 0,
      visible: ()=> state.tabKind === 'Browser',
      click: (ev: MouseEvent) => {
        appEvents.emit("composite", {
          initialList: state.selection,
          initialIndex: 0,
        });
      },
    },
    {
      name: t("Create Slideshow"),
      icon: "resources/images/icons/actions/slideshow-50.png",
      enabled: () => state.selection.length > 0,
      visible: () => false,
      click: (ev: MouseEvent) => {
        appEvents.emit("composite", {
          initialList: state.selection,
          initialIndex: 0,
        });
      },
    },
    { type: "sep" },
    {
      name: t("Undo"),
      icon: "resources/images/icons/actions/undo-50.png",
      enabled: () => state.undo.length >0,
      visible: ()=> state.tabKind === 'Browser',
      tooltip: ()=> state.undo.length > 0 ? `${t("Undo")} ${ t(state.undo[0].description)}` : t('Nothing to undo'),
      click: async (_ev: MouseEvent) => {
        const s = await getService();
        const undo = state.undo[0];
        return s.undo(undo.uuid);
      },
    },
    { type: "sep" },
    {
      name: t("Open in Finder"),
      icon: "resources/images/icons/actions/finder-50.png",
      enabled: () => state.selection.length > 0,
      visible: ()=> state.tabKind === 'Browser' || state.tabKind === 'Editor',
      click: async (ev: MouseEvent) => {
        const s = await getService();
        const firstSelection = state.selection[0];
        if (firstSelection) s.openEntryInFinder(firstSelection);
      },
    },    
    {
      name: t("Delete"),
      icon: "resources/images/icons/actions/trash-50.png",
      enabled: () => state.selection.length > 0,
      visible: ()=> state.tabKind === 'Browser',
      click: async (ev: MouseEvent) => {
        const s = await getService();
        return s.createJob(JOBNAMES.DELETE, {
          source: state.selection,
        });
      },
    },
  ];
  for (const action of actions) {
    switch (action.type) {
      case "sep":
        action.element = $(`<span class="button-separator"/>`);
        break;
      case "dropdown":
        const { element, emitter } = makeDropList("", [], 0);
        action.element = element;

        if (action.dropdownReady) {
          action.dropdownReady(emitter);
        }

        break;

      case "button":
      case undefined:
        action.element = $(`<button data-tooltip-above="${action.name}"
      class="w3-button bottom-bar-button" style="background-image: url(${action.icon})"></button>`);
        break;
    }
    if (action.click!==undefined) {
    action.element.on("click", async (ev:MouseEvent) => {
      const res = await action.click!(ev);
      if(typeof res === "string") {
        action.element?.addClass('job-running');
        const s =await getService();
        await s.waitJob(res);
        action.element?.removeClass('job-running');
      }
    });   
  }
    buttons.append(action.element);
  }

  async function refreshState() {
    const s = await getService();
    const oldSelection =state.selection;
    state.settings = getSettings();
    state.selection = activeTabContext().selectionManager.selected();
    state.tabKind = activeTabContext().kind;
    state.undo = ((await s.undoList()) as undoStep[]).reverse();
    state.albumMetaData = state.selection.length > 0 ? await s.readAlbumMetadata(state.selection[0].album) : {};

    for (const action of actions) {
      if (action.type !== "sep") {
        action.element!.addRemoveClass("disabled", !!action.enabled && !action.enabled() );
        action.element!.addRemoveClass("highlight", !!action.highlight && action.highlight() );
        action.element!.addRemoveClass("hidden", !!action.visible && !action.visible() );
        if(action.tooltip)
          action.element!.attr("data-tooltip-above", action.tooltip());
      }
    }
    function selectionHash(entries: AlbumEntry[]) {
      return entries.map(e=>e.name).sort().join();
    }
    if(selectionHash(oldSelection) !== selectionHash(state.selection)) {
    const lst = $(".selection-thumbs", container);
    lst.empty();
    state.selection.forEach((entry) => {
      lst.append(
        `<div class="selection-thumb" style="background-image: url(${thumbnailUrl(entry, "th-small")})"/>`
      );
    });
    lst.append(
      `<span class="selection-thumb-count">${
        state.selection.length.toString() +
        " " +
        t("photos selected")
      }</span>`
    );
    }

  }
  getSettingsEmitter().on("changed", refreshState);
  appEvents.on('tabDisplayed', ({context})=>{
    context.selectionManager.events.on('*', ()=>debounce(refreshState, 200));
  });
  getService().then(s => {
    s.on("undoChanged", refreshState);
    s.on("picasaFileMetaChanged", refreshState);
  });
  appEvents.on("tabChanged", refreshState);
  return container;
}

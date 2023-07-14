import { Emitter } from "../../shared/lib/event";
import { debounce } from "../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumMetaData,
  JOBNAMES,
  Job,
  undoStep,
} from "../../shared/types/types";
import { thumbnailUrl } from "../imageProcess/client";
import { $, _$ } from "../lib/dom";
import { toggleStar } from "../lib/handles";
import {
  Settings,
  getSettings,
  getSettingsEmitter,
  updateIconSize,
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
<!--
<div class="brightness-photo-list">
  <label>${t("Brightness")}</label>
  <input type="range" min="0" max="20" class="photos-brightness-ctrl slider">
</div>
-->
<div class="zoom-photo-list">
  <label>${t("Icon Size")}</label>
  <input type="range" min="75" max="250" class="photos-zoom-ctrl slider">
</div>
</div>`;

function hotKeyToCode(hotKey: string) {
  const parts = hotKey.split("+");
  const key = parts[parts.length - 1].toLowerCase();
  const modifierString = parts.slice(0, parts.length - 1);
  const modifiers = Object.fromEntries(
    modifierString
      .map((m) => {
        switch (m) {
          case "Ctrl":
            return "ctrl";
          case "Shift":
            return "shift";
          case "Alt":
            return "alt";
          case "Meta":
            return "meta";
          default:
            throw new Error(`Unknown modifier ${m}`);
        }
      })
      .map((n) => [n, true])
  );
  return { modifiers, key };
}

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
    settings: Settings;
    tabKind: string;
    selection: AlbumEntry[];
    albumMetaData: AlbumMetaData;
    undo: undoStep[];
  } = {
    settings: getSettings(),
    selection: [],
    albumMetaData: {},
    tabKind: "",
    undo: [],
  };

  const actions: (
    | {
        name: string;
        icon: string;
        element?: _$;
        type?: "button" | "dropdown";
        execute?: () => any;
        hotKey?: string;
        tooltip?: () => string;
        visible?: () => boolean;
        enabled?: () => boolean;
        highlight?: () => boolean;
        dropdownReady?: (emitter: Emitter<DropListEvents>) => any;
      }
    | { element?: _$; execute?: () => any; type: "sep"; hotKey?: string }
  )[] = [
    {
      name: t("Export All Favorites"),
      icon: "resources/images/icons/actions/export-favorites-50.png",
      visible: () => state.tabKind === "Browser",
      execute: async () => {
        const s = await getService();
        return s.createJob(JOBNAMES.EXPORT_TO_IPHOTO, {});
      },
    },
    {
      name: JOBNAMES.EXPORT,
      icon: "resources/images/icons/actions/export-50.png",
      enabled: () => state.selection.length > 0,
      visible: () => state.tabKind === "Editor",
      tooltip: () => `${t("Export $1 item(s)", state.selection.length)}`,
      execute: async () => {
        if (state.selection.length > 0) {
          const s = await getService();
          return s.createJob(JOBNAMES.EXPORT, {
            source: state.selection,
          });
        }
      },
    },
    { type: "sep" },
    {
      name: JOBNAMES.DUPLICATE,
      icon: "resources/images/icons/actions/duplicate-50.png",
      visible: () => state.selection.length > 0,
      hotKey: "Ctrl+D",
      tooltip: () => `${t("Duplicate $1 item(s)", state.selection.length)}`,
      execute: async () => {
        const s = await getService();
        const jobId = await s.createJob(JOBNAMES.DUPLICATE, {
          source: state.selection,
        });
        s.waitJob(jobId).then((results: Job) => {
          appEvents.emit("edit", {
            initialList: results.out as AlbumEntry[],
            initialIndex: 0,
          });
        });
      },
    },
    {
      name: JOBNAMES.MOVE,
      icon: "resources/images/icons/actions/move-to-new-album-50.png",
      enabled: () => state.selection.length > 0,
      visible: () => state.tabKind === "Browser",
      tooltip: () =>
        `${t("Move $1 item(s) to a new album", state.selection.length)}`,
      execute: () => {
        question("New album name", "Please type the new album name").then(
          async (newAlbum) => {
            if (newAlbum) {
              const s = await getService();
              s.makeAlbum(newAlbum).then((album: Album) => {
                if (state.selection.length === 0) {
                  throw new Error("No selection");
                }
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
      hotKey: "Space",
      highlight: () =>
        state.selection.length > 0
          ? !!state.albumMetaData[state.selection[0].name]?.star
          : false,
      execute: async () => {
        toggleStar(state.selection);
      },
    },
    {
      name: t("Rotate Left"),
      icon: "resources/images/icons/actions/rotate-left-50.png",
      enabled: () => state.selection.length > 0,
      visible: () => state.tabKind === "Browser",
      hotKey: "Ctrl+ArrowLeft",
      execute: async () => {
        const s = await getService();
        s.rotate(state.selection, "left");
      },
    },
    {
      name: t("Rotate Right"),
      icon: "resources/images/icons/actions/rotate-right-50.png",
      enabled: () => state.selection.length > 0,
      visible: () => state.tabKind === "Browser",
      hotKey: "Ctrl+ArrowRight",
      execute: async () => {
        const s = await getService();
        s.rotate(state.selection, "right");
      },
    },

    {
      name: t("Create Mosaic"),
      icon: "resources/images/icons/actions/composition-50.png",
      enabled: () => state.selection.length > 0,
      visible: () => state.tabKind === "Browser",
      execute: () => {
        appEvents.emit("mosaic", {
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
      execute: () => {
        appEvents.emit("gallery", {
          initialList: state.selection,
          initialIndex: 0,
        });
      },
    },
    { type: "sep" },
    {
      name: t("Undo"),
      icon: "resources/images/icons/actions/undo-50.png",
      enabled: () => state.undo.length > 0,
      visible: () => state.tabKind === "Browser",
      hotKey: "Ctrl+Z",
      tooltip: () =>
        state.undo.length > 0
          ? `${t("Undo")} ${t(state.undo[0].description)}`
          : t("Nothing to undo"),
      execute: async () => {
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
      visible: () =>
        false && (state.tabKind === "Browser" || state.tabKind === "Editor"),
      execute: async () => {
        const s = await getService();
        const firstSelection = state.selection[0];
        if (firstSelection) s.openEntryInFinder(firstSelection);
      },
    },
    {
      name: t("Delete"),
      icon: "resources/images/icons/actions/trash-50.png",
      enabled: () => state.selection.length > 0,
      visible: () => state.tabKind === "Browser",
      tooltip: () => `${t("Delete $1 item(s)", state.selection.length)}`,
      execute: async () => {
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
        action.element = $(
          `
        <button 
          data-tooltip-above="${action.name}${
            action.hotKey ? " (" + t(action.hotKey) + ")" : ""
          }"
          class="w3-button bottom-bar-button" 
          style="background-image: url(${action.icon})">
        </button>`
        );
        break;
    }
    if (action.execute !== undefined) {
      action.element.on("click", async () => {
        const res = await action.execute!();
        if (typeof res === "string") {
          action.element?.addClass("job-running");
          const s = await getService();
          await s.waitJob(res);
          action.element?.removeClass("job-running");
        }
      });
    }
    buttons.append(action.element);
  }
  console.warn("Register keydown");
  appEvents.on("keyDown", (ev) => {
    console.info("keyDown", ev.key, ev.code, ev);
    for (const action of actions) {
      if (action.type !== "sep") {
        if (action.hotKey) {
          const codeMod = hotKeyToCode(action.hotKey);
          if (
            action.visible &&
            action.visible() &&
            !!ev.alt === !!codeMod.modifiers.alt &&
            !!ev.shift === !!codeMod.modifiers.shift &&
            !!ev.ctrl === !!codeMod.modifiers.ctrl &&
            !!ev.meta === !!codeMod.modifiers.meta &&
            ev.key === codeMod.key
          ) {
            console.info("executing", action.name, action.hotKey, ev.key);
            action.execute!();
            ev.preventDefault();
            break;
          }
        }
      }
    }
  });

  async function refreshState() {
    const s = await getService();
    const oldSelection = state.selection;
    state.settings = getSettings();
    state.selection = activeTabContext().selectionManager.selected();
    state.tabKind = activeTabContext().kind;
    state.undo = ((await s.undoList()) as undoStep[]).reverse();
    state.albumMetaData =
      state.selection.length > 0
        ? await s.readAlbumMetadata(state.selection[0].album)
        : {};

    for (const action of actions) {
      if (action.type !== "sep") {
        action.element!.addRemoveClass(
          "disabled",
          !!action.enabled && !action.enabled()
        );
        action.element!.addRemoveClass(
          "highlight",
          !!action.highlight && action.highlight()
        );
        action.element!.addRemoveClass(
          "hidden",
          !!action.visible && !action.visible()
        );
        if (action.tooltip)
          action.element!.attr("data-tooltip-above", action.tooltip());
      }
    }
    function selectionHash(entries: AlbumEntry[]) {
      return entries
        .map((e) => e.name)
        .sort()
        .join();
    }
    if (selectionHash(oldSelection) !== selectionHash(state.selection)) {
      const lst = $(".selection-thumbs", container);
      lst.empty();
      state.selection.forEach((entry) => {
        lst.append(
          `<div class="selection-thumb" style="background-image: url(${thumbnailUrl(
            entry,
            "th-small"
          )})"/>`
        );
      });
      lst.append(
        `<span class="selection-thumb-count">${
          state.selection.length.toString() + " " + t("photos selected")
        }</span>`
      );
    }
  }
  getSettingsEmitter().on("changed", refreshState);
  appEvents.on("tabDisplayed", ({ context }) => {
    context.selectionManager.events.on("added", () =>
      debounce(refreshState, 200)
    );
    context.selectionManager.events.on("removed", () =>
      debounce(refreshState, 200)
    );
  });
  getService().then((s) => {
    s.on("undoChanged", refreshState);
    s.on("albumEntryAspectChanged", refreshState);
  });
  appEvents.on("tabChanged", refreshState);
  return container;
}

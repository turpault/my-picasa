import { Emitter } from "../../shared/lib/event";
import { debounced } from "../../shared/lib/utils";
import {
  Album,
  AlbumEntry,
  AlbumEntryPicasa,
  JOBNAMES,
  Job,
  UndoStep,
} from "../../shared/types/types";
import { thumbnailUrl } from "../imageProcess/client";
import { $, _$, elementFromEntry, setIdForEntry } from "../lib/dom";
import { toggleStar } from "../lib/handles";
import {
  getSettings,
  getSettingsEmitter,
  updateIconSize,
} from "../lib/settings";
import { State } from "../lib/state";
import { getService } from "../rpc/connect";
import { AlbumEntrySelectionManager } from "../selection/selection-manager";
import { AppEventSource } from "../uiTypes";
import { DropListEvents, makeDropList } from "./controls/dropdown";
import { PicasaMultiButton } from "./controls/multibutton";
import { Button, message } from "./question";
import { question } from "./question";
import {
  ApplicationState,
  META_PAGES,
  SelectionStateDef,
} from "./selection-meta";
import { t } from "./strings";
import { activeTabContext } from "./tabs";
const elementPrefix = "selection-thumb";
const html = `<div class="bottom-list-tools">
<div class="selection-info"></div>
<div class="selection-thumbs">
  <div class="selection-thumbs-icons"></div>
  <div class="selection-thumbs-actions">
    <picasa-button class="selection-thumbs-actions-pin">📌</picasa-button>
    <picasa-button class="selection-thumbs-actions-clearpin">⊙</picasa-button>  
  </div>
</div>
<div class="quick-actions picasa-button-group">
<picasa-button class="quick-actions-star">☆</picasa-button>
<picasa-button icon="resources/images/icons/actions/rotate-left.svg" class="quick-actions-rotate-left"> </picasa-button>
<picasa-button icon="resources/images/icons/actions/rotate-right.svg" class="quick-actions-rotate-right"> </picasa-button>
</div>
<div class="selection-actions-buttons">
</div>
<div class="zoom-photo-list">
  <label>⛰</label>
  <input is="picasa-slider" ticks="100,200" min="75" max="250" class="photos-zoom-ctrl">
</div>
<div class="metadata-modes">
<picasa-multi-button class="metadata-modes-button" toggle items="≡|📍|👤"></picasa-multi-button>
</div>
</div>`;

function hotKeyToCode(hotKey: string) {
  const parts = hotKey.split("+");
  let key = parts[parts.length - 1];
  if (key.length === 1) key = key.toLowerCase();
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
      .map((n) => [n, true]),
  );
  return { modifiers, key };
}

export function makeButtons(
  appEvents: AppEventSource,
  selectionManager: AlbumEntrySelectionManager,
  state: ApplicationState,
): _$ {
  const container = $(html);
  const buttons = $(".selection-actions-buttons", container);
  const zoomController = $(".photos-zoom-ctrl", container);

  zoomController.on("input", () => {
    updateIconSize(zoomController.val());
  });
  getSettingsEmitter().on("changed", (event) => {
    if (event.field === "iconSize") zoomController.val(event.iconSize);
  });
  zoomController.val(getSettings().iconSize);

  $(".quick-actions-rotate-left", container).on("click", async () => {
    const s = await getService();
    s.rotate(localState.getValue("selected"), "left");
  });
  $(".quick-actions-rotate-right", container).on("click", async () => {
    const s = await getService();
    s.rotate(localState.getValue("selected"), "right");
  });
  $(".quick-actions-star", container).on("click", async () => {
    toggleStar(localState.getValue("selected"));
  });
  $(".selection-thumbs-actions-pin", container).on("click", () => {
    selectionManager.selected().forEach((entry: AlbumEntry) => {
      selectionManager.setPin(entry, true);
    });
  });
  $(".selection-thumbs-actions-clearpin", container).on("click", () => {
    selectionManager.selected().forEach((entry: AlbumEntry) => {
      selectionManager.setPin(entry, false);
    });
  });

  const pages = [META_PAGES.METADATA, META_PAGES.LOCATION, META_PAGES.PERSONS];
  const metaButton = $(".metadata-modes-button", container)
    .on("select", () => {
      const selectedPage = pages[metaButton.selected()[0]];
      state.setValue("META_PAGE", selectedPage);
    })
    .get() as PicasaMultiButton;
  state.events.on("META_PAGE", () => {
    const page = pages.indexOf(state.getValue("META_PAGE"));
    if (page !== -1) metaButton.select(page, true);
    else metaButton.select(-1);
  });

  const localState = new State();
  localState.setValues({
    albumMetaData: {},
    tabKind: "",
    undo: [],
  });

  type Action =
    | {
        name: string;
        icon: string;
        label: string;
        element?: _$;
        stateKeys: (keyof SelectionStateDef)[];
        type?: "button" | "dropdown";
        execute?: () => any;
        hotKey?: string;
        tooltip?: () => string;
        visible?: () => boolean;
        enabled?: () => boolean;
        dropdownReady?: (emitter: Emitter<DropListEvents>) => any;
      }
    | { element?: _$; execute?: () => any; type: "sep"; hotKey?: string };
  const actions: Action[] = [
    {
      name: JOBNAMES.EXPORT,
      label: t("Export..."),
      stateKeys: ["selected"],
      icon: "resources/images/icons/actions/export-50.png",
      enabled: () => localState.getValue("selected").length > 0,
      tooltip: () =>
        localState.getValue("selected")?.length
          ? `${t("Export $1 item(s)", localState.getValue("selected")?.length)}`
          : "",
      execute: async () => {
        if (localState.getValue("selected").length > 0) {
          const s = await getService();
          return s.createJob(JOBNAMES.EXPORT, {
            source: localState.getValue("selected"),
          });
        }
      },
    },
    { type: "sep" },
    {
      name: JOBNAMES.DUPLICATE,
      label: t("Duplicate"),
      stateKeys: ["selected"],
      icon: "resources/images/icons/actions/duplicate-50.png",
      enabled: () => localState.getValue("selected").length > 0,
      hotKey: "Ctrl+D",
      tooltip: () =>
        localState.getValue("selected")?.length
          ? `${t("Duplicate $1 item(s)", localState.getValue("selected").length)}`
          : "",
      execute: async () => {
        const s = await getService();
        const jobId = await s.createJob(JOBNAMES.DUPLICATE, {
          source: localState.getValue("selected"),
        });
        s.waitJob(jobId).then((results: Job) => {
          selectionManager.setSelection(results.out as AlbumEntry[]);
          appEvents.emit("edit", {
            active: true,
          });
        });
      },
    },
    {
      name: JOBNAMES.MOVE,
      label: t("Move"),
      stateKeys: ["selected"],
      icon: "resources/images/icons/actions/move-to-new-album-50.png",
      enabled: () => localState.getValue("selected").length > 0,
      tooltip: () =>
        localState.getValue("selected")?.length
          ? `${t(
              "Move $1 item(s) to a new album",
              localState.getValue("selected").length,
            )}`
          : "",
      execute: () => {
        question("New album name", "Please type the new album name").then(
          async (newAlbum) => {
            if (newAlbum) {
              const s = await getService();
              s.makeAlbum(newAlbum).then((album: Album) => {
                if (localState.getValue("selected").length === 0) {
                  throw new Error("No selection");
                }
                return s.createJob(JOBNAMES.MOVE, {
                  source: localState.getValue("selected"),
                  destination: { album },
                });
              });
            }
          },
        );
      },
    },
    {
      name: t("Create Mosaic"),
      label: t("Mosaic"),
      stateKeys: ["selected"],
      icon: "resources/images/icons/actions/composition-50.png",
      enabled: () => localState.getValue("selected").length > 0,
      execute: () => {
        appEvents.emit("mosaic", {
          initialList: localState.getValue("selected"),
          initialIndex: 0,
        });
      },
    },
    {
      name: t("Create Slideshow"),
      label: t("Slideshow"),
      stateKeys: ["selected"],
      icon: "resources/images/icons/actions/slideshow.svg",
      enabled: () => localState.getValue("selected").length > 0,
      execute: () => {
        appEvents.emit("slideshow", {
          initialList: localState.getValue("selected"),
          initialIndex: 0,
        });
      },
    },
    { type: "sep" },
    {
      name: t("Undo"),
      label: t("Undo"),
      stateKeys: ["undo"],
      icon: "resources/images/icons/actions/undo-50.png",
      enabled: () => localState.getValue("undo")?.length > 0,
      hotKey: "Ctrl+Z",
      tooltip: () => {
        return localState.getValue("undo")?.length > 0
          ? `${t("Undo")} ${t(localState.getValue("undo")[0].description)}`
          : t("Nothing to undo");
      },
      execute: async () => {
        const s = await getService();
        const undo = localState.getValue("undo")[0];
        return s.undo(undo.uuid);
      },
    },
    { type: "sep" },
    {
      name: t("Open in Finder"),
      label: t("Finder"),
      icon: "resources/images/icons/actions/finder-50.png",
      stateKeys: ["active"],
      enabled: () => !!state.getValue("active"),
      execute: async () => {
        const s = await getService();
        const firstSelection = state.getValue("active");
        if (firstSelection) s.openEntryInFinder(firstSelection);
      },
    },
    {
      name: JOBNAMES.POPULATE_IPHOTO_FAVORITES,
      label: t("iPhoto Favorites"),
      stateKeys: [],
      icon: "resources/images/icons/actions/iphoto-50.png",
      enabled: () => true,
      tooltip: () => `${t("Synchronize favorites from Photos App")}`,
      execute: async () => {
        const s = await getService();
        return s.createJob(JOBNAMES.POPULATE_IPHOTO_FAVORITES, {});
      },
    },
    {
      name: t("Delete"),
      label: t("Delete"),
      icon: "resources/images/icons/actions/trash-50.png",
      stateKeys: ["selected"],
      hotKey: "Delete",
      enabled: () => localState.getValue("selected").length > 0,
      tooltip: () =>
        localState.getValue("selected")?.length
          ? `${t("Delete $1 item(s)", localState.getValue("selected").length)}`
          : "",
      execute: async () => {
        let label =
          localState.getValue("selected").length === 1
            ? t(
                `Do you want to delete the file $1|${
                  localState.getValue("selected")[0].name
                }`,
              )
            : t(
                `Do you want to delete $1 files|${
                  localState.getValue("selected").length
                }`,
              );

        const b = await message(label, [Button.Ok, Button.Cancel]);

        if (b === Button.Ok) {
          const s = await getService();
          s.createJob(JOBNAMES.DELETE, {
            source: localState.getValue("selected"),
          });
        }
        return true;
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
        <picasa-button 
          data-tooltip-above=""
          class="selection-actions-button"
          iconpos="top"
          icon="${action.icon}">
          ${action.label}
        </picasa-button>`,
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

  function refreshAction(action: Action) {
    if (action.type !== "sep") {
      action.element!.addRemoveClass(
        "disabled",
        !!action.enabled && !action.enabled(),
      );
      action.element!.addRemoveClass(
        "hidden",
        !!action.visible && !action.visible(),
      );
      action.element!.attr(
        "data-tooltip-above",
        `${
          ((action.tooltip && action.tooltip()) || action.name) +
          (action.hotKey ? " (" + action.hotKey + ")" : "")
        }`,
      );
    }
  }
  for (const action of actions) {
    if (action.type !== "sep") {
      action.stateKeys.forEach((key) => {
        localState.events.on(key, () => {
          refreshAction(action);
        });
      });
    }
  }

  appEvents.on("keyDown", (ev) => {
    console.info("keyDown", ev.key, ev.code, ev);
    for (const action of actions) {
      if (action.type !== "sep") {
        if (action.hotKey) {
          const codeMod = hotKeyToCode(action.hotKey);
          if (
            (!action.visible || action.visible()) &&
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

  state.events.on("selected", () => {
    $(".quick-actions-rotate-left", container).addRemoveClass(
      "disabled",
      !localState.getValue("selected"),
    );
    $(".quick-actions-rotate-right", container).addRemoveClass(
      "disabled",
      !localState.getValue("selected"),
    );
    $(".quick-actions-star", container).addRemoveClass(
      "disabled",
      !!localState.getValue("selected"),
    );
  });

  state.events.on("stars", () => {
    const stars = state.getValue("stars");
    $(".quick-actions-star", container).text(stars ? "🌟".repeat(stars) : "☆");
  });

  async function refreshState() {
    const s = await getService();
    const activeEntry = selectionManager.active();
    const albumMetadata = activeEntry
      ? await s.getAlbumMetadata(activeEntry.album)
      : {};
    const selectedIndex = selectionManager.activeIndex();
    const activeMetadata = activeEntry ? albumMetadata[activeEntry.name] : {};
    const stars = parseInt(activeMetadata.starCount || "0");
    localState.setValue("albumMetaData", albumMetadata);
    localState.setValue("stars", stars || 0);
    localState.setValue("active", activeEntry);
    localState.setValue("selectedIndex", selectedIndex);
    localState.setValue(
      "activeMetadata",
      activeEntry
        ? {
            entry: activeEntry,
            metadata: albumMetadata[activeEntry.name],
          }
        : undefined,
    );
    const activeOnly = !!state.getValue("META_SINGLE_SELECTION_MODE");

    if (activeOnly) {
      localState.setValue("selected", [activeEntry]);
    } else {
      localState.setValue("selected", selectionManager.selected());
    }
    localState.setValue("undo", await s.undoList());
  }
  localState.events.on("selected", () => {
    const lst = $(".selection-thumbs-icons", container);
    lst.empty();
    selectionManager.selected().forEach((entry: AlbumEntry, index) => {
      const icon = $(
        `<div class="selection-thumb ${
          selectionManager.isPinned(entry) ? "selection-thumb-pinned" : ""
        } entry" style="background-image: url(${thumbnailUrl(
          entry,
          "th-small",
        )})"/>`,
      );
      lst
        .append(icon)
        .addRemoveClass(
          "selection-thumb-selected",
          selectionManager.activeIndex() === index,
        );
      setIdForEntry(icon, entry, elementPrefix);
    });
    lst.append(
      `<span class="selection-thumb-count">${
        selectionManager.selected().length.toString() +
        " " +
        t("photos selected")
      }</span>`,
    );
  });
  const updateLabel = debounced(() => {
    const entry = localState.getValue("active");
    const selected = localState.getValue("selected");
    const selectedIndex = localState.getValue("selectedIndex");
    const metadata = localState.getValue("activeMetadata");
    const info =
      (entry ? `${entry.album.name} > ${entry.name}   ` : "") +
      (metadata?.dateTaken
        ? `    ${new Date(metadata.dateTaken).toLocaleString(undefined, {
            weekday: "long",
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
          })}`
        : "") +
      (metadata?.dimensions ? `    ${metadata?.dimensions} pixels` : "") +
      (selectedIndex !== -1
        ? ` (${selectedIndex + 1} ${t("of")} ${selected.length})`
        : " ");
    $(".selection-info", container).text(info);
  });
  localState.events.on("activeMetadata", updateLabel);
  localState.events.on("active", updateLabel);
  localState.events.on("selected", updateLabel);
  localState.events.on("selectedIndex", updateLabel);

  const debouncedRefresh = debounced(refreshState, 200, false);

  getSettingsEmitter().on("changed", debouncedRefresh);
  selectionManager.events.on("activeChanged", debouncedRefresh);
  selectionManager.events.on("changed", () => {
    debouncedRefresh();
  });
  getService().then((s) => {
    s.on("undoChanged", (ev: { payload: { undoSteps: UndoStep[] } }) => {
      localState.setValue("undo", ev.payload.undoSteps.reverse());
    });
    s.on(
      "albumEntryAspectChanged",
      async (e: { payload: AlbumEntryPicasa }) => {
        // Is there a thumbnail with that data ?
        const elem = elementFromEntry(e.payload, elementPrefix);
        if (elem.exists()) {
          elem.css({
            "background-image": `url(${thumbnailUrl(e.payload, "th-small")})`,
          });
        }
      },
    );
  });
  appEvents.on("tabChanged", () => {
    localState.setValue("tabKind", activeTabContext().kind);
  });

  refreshState();
  return container;
}

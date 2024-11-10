import { albumEntryMetadata, thumbnailUrl } from "../imageProcess/client";
import { $, _$, elementFromEntry, setIdForEntry } from "../lib/dom";
import { Emitter } from "../lib/event";
import { toggleStar } from "../lib/handles";
import {
  getSettings,
  getSettingsEmitter,
  updateIconSize,
} from "../lib/settings";
import { debounced } from "../../shared/lib/utils";
import { getService } from "../rpc/connect";
import {
  Album,
  AlbumEntry,
  AlbumEntryPicasa,
  JOBNAMES,
  Job,
} from "../../shared/types/types";
import {
  AppEventSource,
  ApplicationSharedStateDef,
  ApplicationState,
} from "../uiTypes";
import { DropListEvents, makeDropList } from "./controls/dropdown";
import { PicasaMultiButton } from "./controls/multibutton";
import { META_PAGES } from "./metadata-viewer";
import { Button, message, question } from "./question";
import { t } from "./strings";

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
  state: ApplicationState,
): _$ {
  const container = $(html);
  const buttons = $(".selection-actions-buttons", container);
  const zoomController = $(".photos-zoom-ctrl", container);
  const selectionManager = state.getValue("activeSelectionManager");

  zoomController.on("input", () => {
    updateIconSize(zoomController.val());
  });
  getSettingsEmitter().on("changed", (event) => {
    if (event.field === "iconSize") zoomController.val(event.iconSize);
  });
  zoomController.val(getSettings().iconSize);

  $(".quick-actions-rotate-left", container).on("click", async () => {
    const s = await getService();
    s.rotate(state.getValue("activeSelectionManager").selected(), "left");
  });
  $(".quick-actions-rotate-right", container).on("click", async () => {
    const s = await getService();
    s.rotate(state.getValue("activeSelectionManager").selected(), "right");
  });
  $(".quick-actions-star", container).on("click", async () => {
    toggleStar(state.getValue("activeSelectionManager").selected());
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
      state.setValue("activeMetaPage", selectedPage);
    })
    .get() as PicasaMultiButton;
  state.events.on("activeMetaPage", () => {
    const page = pages.indexOf(state.getValue("activeMetaPage"));
    if (page !== -1) metaButton.select(page, true);
    else metaButton.select(-1);
  });

  type Action =
    | {
        name: string;
        icon: string;
        label: string;
        element?: _$;
        stateKeys: (keyof ApplicationSharedStateDef)[];
        type?: "button" | "dropdown";
        execute?: () => any;
        hotKey?: string;
        tooltip?: (
          selected: AlbumEntry[],
          active: AlbumEntry,
          activeIndex: number,
        ) => string;
        visible?: (
          selected: AlbumEntry[],
          active: AlbumEntry,
          activeIndex: number,
        ) => boolean;
        enabled?: (
          selected: AlbumEntry[],
          active: AlbumEntry,
          activeIndex: number,
        ) => boolean;
        dropdownReady?: (emitter: Emitter<DropListEvents>) => any;
      }
    | { element?: _$; execute?: () => any; type: "sep"; hotKey?: string };
  const actions: Action[] = [
    {
      name: JOBNAMES.EXPORT,
      label: t("Export..."),
      stateKeys: ["activeSelectionManager"],
      icon: "resources/images/icons/actions/export-50.png",
      enabled: (
        selected: AlbumEntry[],
        active: AlbumEntry,
        activeIndex: number,
      ) => selected.length > 0,
      tooltip: (
        selected: AlbumEntry[],
        active: AlbumEntry,
        activeIndex: number,
      ) =>
        selected?.length ? `${t("Export $1 item(s)", selected?.length)}` : "",
      execute: async () => {
        const selected = state.getValue("activeSelectionManager").selected();
        if (selected.length > 0) {
          const s = await getService();
          return s.createJob(JOBNAMES.EXPORT, {
            source: selected,
          });
        }
      },
    },
    { type: "sep" },
    {
      name: JOBNAMES.DUPLICATE,
      label: t("Duplicate"),
      stateKeys: ["activeSelectionManager"],
      icon: "resources/images/icons/actions/duplicate-50.png",
      enabled: (
        selected: AlbumEntry[],
        active: AlbumEntry,
        activeIndex: number,
      ) => selected.length > 0,
      hotKey: "Ctrl+D",
      tooltip: (
        selected: AlbumEntry[],
        active: AlbumEntry,
        activeIndex: number,
      ) =>
        selected.length ? `${t("Duplicate $1 item(s)", selected.length)}` : "",
      execute: async () => {
        const selected = state.getValue("activeSelectionManager").selected();
        const s = await getService();
        const jobId = await s.createJob(JOBNAMES.DUPLICATE, {
          source: selected,
        });
        s.waitJob(jobId).then((results: Job) => {
          selectionManager.setSelection(results.out as AlbumEntry[]);
        });
      },
    },
    {
      name: JOBNAMES.MOVE,
      label: t("Move"),
      stateKeys: ["activeSelectionManager"],
      icon: "resources/images/icons/actions/move-to-new-album-50.png",
      enabled: (
        selected: AlbumEntry[],
        active: AlbumEntry,
        activeIndex: number,
      ) => selected.length > 0,
      tooltip: (
        selected: AlbumEntry[],
        active: AlbumEntry,
        activeIndex: number,
      ) =>
        selected?.length
          ? `${t("Move $1 item(s) to a new album", selected.length)}`
          : "",
      execute: () => {
        const selected = state.getValue("activeSelectionManager").selected();
        question("New album name", "Please type the new album name").then(
          async (newAlbum) => {
            if (newAlbum) {
              const s = await getService();
              s.makeAlbum(newAlbum).then((album: Album) => {
                if (selected.length === 0) {
                  throw new Error("No selection");
                }
                return s.createJob(JOBNAMES.MOVE, {
                  source: selected,
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
      stateKeys: ["activeSelectionManager"],
      icon: "resources/images/icons/actions/composition-50.png",
      enabled: (
        selected: AlbumEntry[],
        active: AlbumEntry,
        activeIndex: number,
      ) => selected.length > 0,
      execute: () => {
        const selected = state.getValue("activeSelectionManager").selected();
        appEvents.emit("mosaic", {
          initialList: selected,
          initialIndex: 0,
        });
      },
    },
    {
      name: t("Create Slideshow"),
      label: t("Slideshow"),
      stateKeys: ["activeSelectionManager"],
      icon: "resources/images/icons/actions/slideshow.svg",
      enabled: (
        selected: AlbumEntry[],
        active: AlbumEntry,
        activeIndex: number,
      ) => selected.length > 0,
      execute: () => {
        const selected = state.getValue("activeSelectionManager").selected();
        appEvents.emit("slideshow", {
          initialList: selected,
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
      enabled: () => state.getValue("undo")?.length > 0,
      hotKey: "Ctrl+Z",
      tooltip: () => {
        return state.getValue("undo")?.length > 0
          ? `${t("Undo")} ${t(state.getValue("undo")[state.getValue("undo")?.length - 1].description)}`
          : t("Nothing to undo");
      },
      execute: async () => {
        const s = await getService();
        const undo = state.getValue("undo")[state.getValue("undo")?.length - 1];
        return s.undo(undo.uuid);
      },
    },
    { type: "sep" },
    {
      name: t("Open in Finder"),
      label: t("Finder"),
      icon: "resources/images/icons/actions/finder-50.png",
      stateKeys: ["activeSelectionManager"],
      enabled: (
        selected: AlbumEntry[],
        active: AlbumEntry,
        activeIndex: number,
      ) => !!active,
      execute: async () => {
        const s = await getService();
        const firstSelection = state
          .getValue("activeSelectionManager")
          ?.selected()[0];
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
      stateKeys: ["activeSelectionManager"],
      hotKey: "Delete|Backspace",
      enabled: (selected: AlbumEntry[]) => selected.length > 0,
      tooltip: (selected: AlbumEntry[]) =>
        selected?.length ? `${t("Delete $1 item(s)", selected.length)}` : "",
      execute: async () => {
        const selected = state.getValue("activeSelectionManager").selected();
        let label =
          selected.length === 1
            ? t(`Do you want to delete the file $1|${selected[0].name}`)
            : t(`Do you want to delete $1 files|${selected.length}`);

        const b = await message(label, [Button.Ok, Button.Cancel]);

        if (b === Button.Ok) {
          const s = await getService();
          s.createJob(JOBNAMES.DELETE, {
            source: selected,
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

  function isActionEnabled(action: Action) {
    return !action.element!.hasClass("disabled");
  }
  function refreshAction(
    action: Action,
    selected: AlbumEntry[],
    active: AlbumEntry,
    activeIndex: number,
  ) {
    if (action.type !== "sep") {
      action.element!.addRemoveClass(
        "disabled",
        !!action.enabled && !action.enabled(selected, active, activeIndex),
      );
      action.element!.addRemoveClass(
        "hidden",
        !!action.visible && !action.visible(selected, active, activeIndex),
      );
      action.element!.attr(
        "data-tooltip-above",
        `${
          ((action.tooltip && action.tooltip(selected, active, activeIndex)) ||
            action.name) + (action.hotKey ? " (" + action.hotKey + ")" : "")
        }`,
      );
    }
  }

  appEvents.on("keyDown", (ev) => {
    console.info("keyDown", ev.key, ev.code, ev);
    for (const action of actions) {
      if (action.type !== "sep") {
        if (action.hotKey) {
          for (const hotKey of action.hotKey.split("|")) {
            const codeMod = hotKeyToCode(hotKey);
            if (
              isActionEnabled(action) &&
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
    }
  });

  const selManager = state.getValue("activeSelectionManager");
  const debouncedRefresh = debounced(async () => {
    const [selected, active, activeIndex] = [
      selManager.selected(),
      selManager.active(),
      selManager.activeIndex(),
    ];
    for (const action of actions) {
      if (
        action.type !== "sep" &&
        action.stateKeys.includes("activeSelectionManager")
      ) {
        refreshAction(action, selected, active, activeIndex);
      }
    }
    $(".quick-actions-rotate-left", container).addRemoveClass(
      "disabled",
      !selected.length,
    );
    $(".quick-actions-rotate-right", container).addRemoveClass(
      "disabled",
      !selected.length,
    );
    $(".quick-actions-star", container).addRemoveClass(
      "disabled",
      !!selected.length,
    );
    const lst = $(".selection-thumbs-icons", container);
    lst.empty();
    selected.slice(0, 100).forEach((entry: AlbumEntry, index) => {
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
        .addRemoveClass("selection-thumb-selected", activeIndex === index);
      setIdForEntry(icon, entry, elementPrefix);
    });
    lst.append(
      `<span class="selection-thumb-count">${
        selectionManager.selected().length.toString() +
        " " +
        t("photos selected")
      }</span>`,
    );
    $(".selection-info", container).text("");
    if (active) {
      const meta = await albumEntryMetadata(active);
      const stars = parseInt(meta.starCount || "0");
      $(".quick-actions-star", container).text(
        stars ? "🌟".repeat(stars) : "☆",
      );
      const info =
        `${active.album.name} > ${active.name}   ` +
        (meta?.dateTaken
          ? `    ${new Date(meta.dateTaken).toLocaleString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "numeric",
              day: "numeric",
              hour: "numeric",
              minute: "numeric",
              second: "numeric",
            })}`
          : "") +
        (meta?.dimensions ? `    ${meta?.dimensions} pixels` : "") +
        (activeIndex !== -1
          ? ` (${activeIndex + 1} ${t("of")} ${selected.length})`
          : " ");
      $(".selection-info", container).text(info);
    }
  }, 100);

  selManager.events.on("*", debouncedRefresh);
  state.events.on("undo", debouncedRefresh);
  getSettingsEmitter().on("changed", debouncedRefresh);
  getService().then((s) => {
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

  debouncedRefresh();
  return container;
}

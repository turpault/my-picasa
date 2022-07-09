import { buildEmitter, Emitter } from "../../shared/lib/event";
import {
  Album,
  JOBNAMES,
  PicasaFileMeta,
  undoStep,
} from "../../shared/types/types";
import { $, _$ } from "../lib/dom";
import {
  getSettings,
  getSettingsEmitter,
  updateFilterByStar,
  updateFilterByVideos,
  updateIconSize,
} from "../lib/settings";
import { getService } from "../rpc/connect";
import { SelectionManager } from "../selection/selection-manager";
import { AlbumListEventSource, AppEventSource } from "../uiTypes";
import { DropListEvents, makeDropList } from "./controls/dropdown";
import { question } from "./question";
import { t } from "./strings";
const html = `<div class="bottom-list-tools">
<div class="zoom-photo-list">
  <label>${t("Icon Size")}</label>
  <input type="range" min="75" max="250" class="photos-zoom-ctrl slider">
</div>
<div class="w3-bar buttons">
</div>
</div>`;

export async function makeButtons(
  appEvents: AppEventSource,
  _events: AlbumListEventSource
): Promise<_$> {
  const s = await getService();
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

  type Actions = {
    enable: {
      enabled: boolean;
    };
    tooltip: {
      text: string;
    };
  };
  const actions: {
    name: string;
    icon: string;
    element?: _$;
    type?: "button" | "dropdown" | "sep";
    click?: (ev: MouseEvent) => any;
    displayed?: (element: _$, actions: Emitter<Actions>) => any;
    dropdownReady?: (emitter: Emitter<DropListEvents>) => any;
    needSelection: boolean;
  }[] = [
    {
      name: t("Export Favorites"),
      icon: "resources/images/icons/actions/export-favorites-50.png",
      needSelection: false,
      click: async (ev: MouseEvent) => {
        s.createJob(JOBNAMES.EXPORT_TO_IPHOTO, {});
      },
    },
    {
      name: t("Undo"),
      icon: "resources/images/icons/actions/undo-50.png",
      needSelection: false,
      displayed: async (_element, actions) => {
        const s = await getService();
        s.on("undoChanged", undoChanged);

        async function undoChanged() {
          const undo = ((await s.undoList()) as undoStep[]).reverse()[0];
          if (undo) {
            actions.emit("enable", { enabled: true });
            actions.emit("tooltip", { text: t("Undo") + ' ' + t(undo.description) });
          } else {
            actions.emit("enable", { enabled: false });
          }
        }
        await undoChanged();
      },
      click: async (_ev: MouseEvent) => {
        const s = await getService();
        const undo = ((await s.undoList()) as undoStep[]).reverse()[0];
        s.undo(undo.uuid);
      },
    },
    {
      name: t("View starred only"),
      icon: "resources/images/icons/actions/filter-star-50.png",
      needSelection: false,
      displayed: (element: _$) => {
        function updateSettings() {
          const settings = getSettings();
          element.addRemoveClass("highlight", settings.filters.star);
        }
        updateSettings();
        getSettingsEmitter().on("changed", updateSettings);
      },
      click: async (ev: MouseEvent) => {
        updateFilterByStar(!getSettings().filters.star);
      },
    },
    {
      name: t("View videos only"),
      icon: "resources/images/icons/actions/filter-video-50.png",
      needSelection: false,
      displayed: (element: _$) => {
        function updateSettings() {
          const settings = getSettings();
          element.addRemoveClass("highlight", settings.filters.video);
        }
        updateSettings();
        getSettingsEmitter().on("changed", updateSettings);
      },
      click: async (ev: MouseEvent) => {
        updateFilterByVideos(!getSettings().filters.video);
      },
    },
    {
      name: "sep",
      type: "sep",
      icon: "",
      needSelection: false
    },
    {
      name: t("Open in Finder"),
      icon: "resources/images/icons/actions/finder-50.png",
      needSelection: true,
      click: (ev: MouseEvent) => {
        const firstSelection = SelectionManager.get().selected()[0];
        if (firstSelection) s.openInFinder(firstSelection.album);
      },
    },
    {
      name: t("Export to folder"),
      icon: "resources/images/icons/actions/export-50.png",
      needSelection: true,
      click: (ev: MouseEvent) => {
        s.createJob(JOBNAMES.EXPORT, {
          source: SelectionManager.get().selected(),
        });
      },
    },
    {
      name: t("Duplicate"),
      icon: "resources/images/icons/actions/duplicate-50.png",
      needSelection: true,
      click: (ev: MouseEvent) => {
        s.createJob(JOBNAMES.DUPLICATE, {
          source: SelectionManager.get().selected(),
        });
      },
    },
    {
      name: t("Move to new Album"),
      icon: "resources/images/icons/actions/move-to-new-album-50.png",
      needSelection: true,
      click: (ev: MouseEvent) => {
        question("New album name", "Please type the new album name").then(
          (newAlbum) => {
            if (newAlbum) {
              s.makeAlbum(newAlbum).then((album: Album) => {
                s.createJob(JOBNAMES.MOVE, {
                  source: SelectionManager.get().selected(),
                  destination: { album },
                });
                SelectionManager.get().clear();
              });
            }
          }
        );
      },
    },

    {
      name: t("Rotate"),
      icon: "resources/images/icons/actions/rotate-50.png",
      needSelection: true,
      click: async (ev: MouseEvent) => {
        for (const e of SelectionManager.get().selected()) {
          const p = (await s.readPicasaEntry(e)) as PicasaFileMeta;
          if (p.filters) {
            p.filters += ";";
          } else {
            p.filters = "";
          }
          // TODO: Ugly
          p.filters += "rotate=1,1";
          s.updatePicasaEntry(e, "filters", p.filters);
        }
      },
    },

    {
      name: t("Composition"),
      icon: "resources/images/icons/actions/composition-50.png",
      needSelection: true,
      click: (ev: MouseEvent) => {
        appEvents.emit("composite", {
          initialList: SelectionManager.get().selected(),
          initialIndex: 0,
        });
      },
    },
    {
      name: t("Delete"),
      icon: "resources/images/icons/actions/trash-50.png",
      needSelection: true,
      click: (ev: MouseEvent) => {
        s.createJob(JOBNAMES.DELETE, {
          source: SelectionManager.get().selected(),
        });
        SelectionManager.get().clear();
      },
    },
  ];
  for (const action of actions) {
    switch (action.type) {
      case "sep":
        action.element = $(`<span style="width:20px"/>`);
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
        action.element = $(`<button data-tooltip-below="${action.name}"
      class="w3-button" style="background-image: url(${action.icon})"></button>`);
        break;
    }
    if (action.click) action.element.on("click", action.click);
    if (action.displayed) {
      const em = buildEmitter<Actions>();
      em.on("enable", (ev) => {
        action.element!.addRemoveClass("disabled", !ev.enabled);
      });
      em.on("tooltip", (ev) => {
        action.element!.attr("data-tooltip-below", ev.text);
      });
      action.displayed(action.element, em);
    }
    buttons.append(action.element);
  }
  function enable() {
    const hasSelection = SelectionManager.get().selected().length != 0;
    for (const action of actions) {
      action.element!.removeClass("disabled");
      if (action.needSelection === true) {
        if (!hasSelection) {
          action.element!.addClass("disabled");
        }
      }
    }
  }
  enable();
  SelectionManager.get().events.on("*", enable);
  return container;
}

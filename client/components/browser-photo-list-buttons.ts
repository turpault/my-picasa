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
import { Album, JOBNAMES, PicasaFileMeta } from "../../shared/types/types";
import { AlbumListEventSource, AppEventSource } from "../uiTypes";
import { question } from "./question";
const html = `<div class="bottom-list-tools">
<div class="zoom-photo-list">
  <label>Icon Size</label>
  <input type="range" min="75" max="250" class="photos-zoom-ctrl slider">
</div>
<div class="w3-bar buttons">
</div>
</div>`;

export async function makeButtons(
  appEvents: AppEventSource,
  events: AlbumListEventSource
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

  const actions: {
    name: string;
    icon: string;
    element?: _$;
    click: (ev: MouseEvent) => any;
    displayed?: (element: _$) => any;
    needSelection: boolean;
  }[] = [
    {
      name: "Open in Finder",
      icon: "resources/images/icons/actions/finder-50.png",
      needSelection: true,
      click: (ev: MouseEvent) => {
        const firstSelection = SelectionManager.get().selected()[0];
        if (firstSelection) s.openInFinder(firstSelection.album);
      },
    },
    {
      name: "Export to folder",
      icon: "resources/images/icons/actions/export-50.png",
      needSelection: true,
      click: (ev: MouseEvent) => {
        s.createJob(JOBNAMES.EXPORT, {
          source: SelectionManager.get().selected(),
        });
      },
    },
    {
      name: "Duplicate",
      icon: "resources/images/icons/actions/duplicate-50.png",
      needSelection: true,
      click: (ev: MouseEvent) => {
        s.createJob(JOBNAMES.DUPLICATE, {
          source: SelectionManager.get().selected(),
        });
      },
    },
    {
      name: "Move to new Album",
      icon: "resources/images/icons/actions/move-to-new-album-50.png",
      needSelection: true,
      click: (ev: MouseEvent) => {
        question("New album name", "Please type the new album name").then(
          (newAlbum) => {
            if (newAlbum) {
              s.makeAlbum(newAlbum).then((album: Album) => {
                s.createJob(JOBNAMES.MOVE, {
                  source: SelectionManager.get().selected(),
                  destination: {album},
                });
                SelectionManager.get().clear();
              });
            }
          }
        );
      },
    },
    {
      name: "Rotate",
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
      name: "View starred only",
      icon: "resources/images/icons/actions/filter-star-50.png",
      needSelection: false,
      displayed:(element: _$)=>{
        function updateSettings() {
          const settings = getSettings();
          element.addRemoveClass("highlight", settings.filters.star);
        }
        updateSettings();
        getSettingsEmitter().on("changed", updateSettings);
      },
      click: async (ev: MouseEvent) => {
        updateFilterByStar(!getSettings().filters.star);
      }
    },
    {
      name: "View videos only",
      icon: "resources/images/icons/actions/filter-video-50.png",
      needSelection: false,
      displayed:(element: _$)=>{
        function updateSettings() {
          const settings = getSettings();
          element.addRemoveClass("highlight", settings.filters.video);
        }
        updateSettings();
        getSettingsEmitter().on("changed", updateSettings);
      },
      click: async (ev: MouseEvent) => {
        updateFilterByVideos(!getSettings().filters.video);
      }
    },
    {
      name: "Composition",
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
      name: "Delete",
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
    action.element = $(`<button data-tooltip="${action.name}"
      class="w3-button" style="background-image: url(${action.icon})"></button>`).on(
      "click",
      action.click
    );
    if(action.displayed) {
      action.displayed(action.element);
    }
    buttons.append(action.element);
  }
  function enable() {
    const hasSelection = SelectionManager.get().selected().length != 0;
    for (const action of actions) {
      action.element!.removeClass("disabled");
      if (action.needSelection) {
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

import { $, _$ } from "../lib/dom";
import { getService } from "../rpc/connect";
import { SelectionManager } from "../selection/selection-manager";
import { Album, AlbumListEventSource, PicasaFileMeta } from "../types/types";
import { makeCompositorPage } from "./compositor";
import { question } from "./question";
import { ToolRegistrar } from "./tools";

export async function makeButtons(
  e: HTMLElement,
  events: AlbumListEventSource
) {
  const s = await getService();
  const actions: {
    name: string;
    icon: string;
    element?: _$;
    click: (ev: MouseEvent) => any;
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
        s.createJob("export", { source: SelectionManager.get().selected() });
      },
    },
    {
      name: "Duplicate",
      icon: "resources/images/icons/actions/duplicate-50.png",
      needSelection: true,
      click: (ev: MouseEvent) => {
        s.createJob("duplicate", { source: SelectionManager.get().selected() });
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
              s.makeAlbum(newAlbum).then((a: Album) => {
                s.createJob("move", {
                  source: SelectionManager.get().selected(),
                  destination: a,
                });
                SelectionManager.get().clear();
              });
            }
          }
        );
      },
    },
    {
      name: "New Album",
      icon: "resources/images/icons/actions/new-album-50.png",
      needSelection: false,
      click: (ev: MouseEvent) => {
        alert("todo");
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
      name: "Composition",
      icon: "resources/images/icons/actions/composition-50.png",
      needSelection: true,
      click: (ev: MouseEvent) => {
        events.emit("composite", {});
      },
    },
    {
      name: "Delete",
      icon: "resources/images/icons/actions/trash-50.png",
      needSelection: true,
      click: (ev: MouseEvent) => {
        s.createJob("delete", { source: SelectionManager.get().selected() });
        SelectionManager.get().clear();
      },
    },
  ];
  const container = $(e);
  for (const action of actions) {
    action.element = $(`<button data-tooltip="${action.name}" 
      class="w3-button" style="background-image: url(${action.icon})"></button>`).on(
      "click",
      action.click
    );
    container.append(action.element);
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
}

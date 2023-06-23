import { buildEmitter, Emitter } from "../../../shared/lib/event";
import { $, _$ } from "../../lib/dom";
import { idFromAlbumEntry, uuid } from "../../../shared/lib/utils";
import { AlbumEntry, ThumbnailSize } from "../../types/types";
import {
  AlbumEntrySelectionManager,
  SelectionManager,
} from "../../selection/selection-manager";
import { thumbnailUrl } from "../../imageProcess/client";

const singleLineSelectHTML = `
<div class="w3-bar multiselect-control">
  <div class="w3-bar-block multiselect-label"></div>
  <div class="w3-bar-block multiselect-values wrapper-space-evenly"></div>
</div>
`;

const dropdownSelectHTML = `
<div class="w3-bar multiselect-control">
  <div class="w3-bar-block multiselect-label"></div>
  <select class="w3-bar-block multiselect-values"></select>
</div>
`;

type SelectionList = { image: string; key: any; selected: boolean }[];
type SelectEvents<T extends SelectionList> = {
  select: {
    index: number;
    key: any;
  };
  multiselect: {
    index: number;
    key: any;
    items: T;
  };
};

export function makeChoiceList<T extends SelectionList>(
  label: string,
  items: { label: string; key: any }[],
  currentKey: any,
  mode: "buttons" | "radio" | "dropdown" = "buttons"
): { element: _$; emitter: Emitter<SelectEvents<T>> } {
  const emitter = buildEmitter<SelectEvents<T>>(false);

  const html = mode === "buttons" ? singleLineSelectHTML : dropdownSelectHTML;
  const e = $(html);
  const name = uuid();
  $(".multiselect-label", e).text(label);

  items
    .map((item, index) => {
      const id = name + "|" + index.toString();
      if (mode === "buttons" || mode === "radio") {
        return $(`
    <span class="wrapper-space-evenly-element radio-toggle">
      <input type="radio" class="radio-button" name="${name}" id="${id}" ${
          item.key === currentKey ? "checked" : ""
        }></input>
      <label for="${id}" class="radio-button-label">${item.label}</label>
    </span>`);
      } else if (mode === "dropdown") {
        return $(
          `<option value="${id}" name="${name}" ${
            item.key === currentKey ? "selected" : ""
          }>${item.label}</option>`
        );
      } else {
        throw new Error("Invalid mode");
      }
    })
    .forEach((item) => $(".multiselect-values", e).append(item));

  $(".multiselect-values", e).on("change", (e) => {
    const index = parseInt(
      ((e.target as HTMLSelectElement).value || (e.target as HTMLElement).id)
        .split("|")
        .pop()!
    );
    emitter.emit("select", {
      index,
      key: items[index].key,
    });
  });

  return { element: e, emitter };
}

const multiSelectImageHTML = `
<div class="w3-bar multiselect-control">
  <div class="w3-bar-block multiselect-label"></div>
  <div class="w3-bar-block multiselect-values"></div>
</div>
`;

export function makeMultiselectImageList(
  label: string,
  pool: AlbumEntry[],
  selectionManager: AlbumEntrySelectionManager,
  imageThumbnailSize: ThumbnailSize,
  imageClass: string = ""
): _$ {
  const e = $(multiSelectImageHTML);
  const name = uuid();
  $(".multiselect-label", e).text(label);
  const vals = $(".multiselect-values", e)!;

  vals.empty();
  pool.forEach((item, index) => {
    const id = idFromAlbumEntry(item, name);
    vals.append(
      $(`
      <img id="${id}" class="${imageClass} multiselect-image ${
        selectionManager.isSelected(item) ? "multiselect-image-selected" : ""
      } " loading="lazy" src="${thumbnailUrl(
        item,
        imageThumbnailSize
      )}" style="display: inline-block" 
        class="radio-button-label">`).on("click", () => {
        selectionManager.toggle(item);
      })
    );
  });

  selectionManager.events.on("added", ({ key }) => {
    const id = idFromAlbumEntry(key, name);
    $(`#${id}`).optional()?.addRemoveClass("multiselect-image-selected", true);
  });

  selectionManager.events.on("removed", ({ key }) => {
    const id = idFromAlbumEntry(key, name);
    $(`#${id}`).optional()?.addRemoveClass("multiselect-image-selected", false);
  });

  return e;
}

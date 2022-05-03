import { buildEmitter, Emitter } from "../../../shared/lib/event";
import { $, _$ } from "../../lib/dom";
import { uuid } from "../../../shared/lib/utils";
import { AlbumEntry } from "../../types/types";

const singleLineSelectHTML = `
<div class="w3-bar multiselect-control">
  <div class="w3-bar-block multiselect-label"></div>
  <div class="w3-bar-block multiselect-values wrapper-space-evenly"></div>
</div>
`;

type SelectionList =  { image: string, key: any, selected: boolean }[];
type SelectEvents = {
  select: {
    index: number;
    key: any;
  };
  multiselect: {
    index: number;
    key: any;
    selected: boolean;
    items: SelectionList
  };
};

export function makeChoiceList(
  label: string,
  items: { label: string; key: any }[],
  currentKey: any
): { element: _$; emitter: Emitter<SelectEvents> } {
  const e = $(singleLineSelectHTML);
  const emitter = buildEmitter<SelectEvents>();
  const name =  uuid();
  $(".multiselect-label", e).text(label);
  items
    .map((item, index) => {
      const id =  name + '|' + index.toString();
      return $(`
    <span class="wrapper-space-evenly-element radio-toggle">
      <input type="radio" class="radio-button" name="${name}" id="${id}" ${item.key === currentKey ? "checked" : ""}></input>
      <label for="${id}" class="radio-button-label">${item.label}</label>
    </span>`);
    })
    .forEach((item) => $(".multiselect-values", e).append(item));

  $(".multiselect-values", e).on("change", (e) => {
    const index = parseInt((e.target as HTMLElement).id.split('|').pop()!);
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
  items: SelectionList
): { element: _$; emitter: Emitter<SelectEvents> } {
  const e = $(multiSelectImageHTML);
  const emitter = buildEmitter<SelectEvents>();
  const name =  uuid();
  $(".multiselect-label", e).text(label);
  items
    .map((item, index) => {
      const id =  name + '|' + index.toString();
      return $(`
      <img class="multiselect-image ${item.selected  ? "multiselect-image-selected" : ""} " loading="lazy" src="${item.image}" style="display: ${item.image ? "inline-block" : "none"}" class="radio-button-label">`);
    })
    .forEach((item) => $(".multiselect-values", e).append(item));

  $(".multiselect-values", e).on("click", (e) => {
    const elem = (e.target as HTMLElement);
    const index = parseInt(elem.id.split('|').pop()!);
    if(!Number.isNaN(index)) {
      items[index].selected = !items[index].selected;
      $(elem).addRemoveClass("multiselect-image-selected", items[index].selected);
    
      emitter.emit("multiselect", {
        index,
        key: items[index].key,
        selected: items[index].selected,
        items
      });
    }
  });

  return { element: e, emitter };
}

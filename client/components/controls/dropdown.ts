import { buildEmitter, Emitter } from "../../../shared/lib/event";
import { $, _$ } from "../../lib/dom";
import { uuid } from "../../../shared/lib/utils";

const droplistHTML = `
<div class="w3-dropdown-hover">
  <button class="dropdown-button w3-button"><span style="float:right" class="dropdown-value"></span></button>
  <div class="dropdown-content w3-dropdown-content w3-bar-block w3-card-4"></div>
</div>
`;

export type DropListEvents = {
  select: {
    index: number;
    key: any;
  };
  refresh: {
    label: string;
    items: { label: string; key: any }[];
  };
};

export function makeDropList(
  label: string,
  items: { label: string; key: any }[],
  currentIndex: number
): { element: _$; emitter: Emitter<DropListEvents> } {
  const e = $(droplistHTML);
  const emitter = buildEmitter<DropListEvents>(false);
  emitter.on("refresh", ({ label, items }) => {
    $(".dropdown-content", e).empty();
    $(".dropdown-button", e).text(label);
    $(".dropdown-value", e).text(
      currentIndex < items.length ? items[currentIndex].label : ""
    );
    items
      .map((itemText, index) =>
        $(
          `<a class="dropdown-item w3-bar-item w3-button">${itemText.label}</a>`
        ).on("click", () => {
          $(".dropdown-value", e).text(itemText.label);
          emitter.emit("select", {
            index,
            key: itemText.key,
          });
        })
      )
      .forEach((item) => $(".dropdown-content", e).append(item));
  });
  emitter.emit("refresh", { label, items });
  return { element: e, emitter };
}

export function makeNativeDropList(
  label: string,
  items: { label: string; key: any }[],
  currentIndex: number
): { element: _$; emitter: Emitter<DropListEvents> } {
  const id = uuid();
  const emitter = buildEmitter<DropListEvents>();
  const idToKeyMap = items.map((item, index) => {
    return { id: uuid(), index, item };
  });
  const e = $(`<label for="${id}">${label}</label>`).append(
    `<select id="${id}>` +
      idToKeyMap.map(
        (i) => `<option value="${i.id}">${i.item.label}</option>`
      ) +
      `</select>`
  );
  e.on("change", (ev) => {
    const m = idToKeyMap[e.val()];
    emitter.emit("select", {
      index: m.index,
      key: m.item.key,
    });
  });
  return { element: e, emitter };
}

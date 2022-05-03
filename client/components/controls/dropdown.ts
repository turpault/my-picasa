import { buildEmitter, Emitter } from "../../../shared/lib/event";
import { $, _$ } from "../../lib/dom";

const droplistHTML = `
<div class="w3-dropdown-hover">
  <button class="dropdown-button w3-button"><span style="float:right" class="dropdown-value"></span></button>
  <div class="dropdown-content w3-dropdown-content w3-bar-block w3-card-4"></div>
</div>
`;

type DropListEvents = {
  select: {
    index: number,
    key: any
  }
}

export function makeDropList(label:string, items: {label: string, key:any}[], currentIndex: number):  {element: _$, emitter: Emitter<DropListEvents>} {
  const e = $(droplistHTML);
  const emitter = buildEmitter<DropListEvents>();
  $(".dropdown-button", e).text(label);
  $(".dropdown-value", e).text(items[currentIndex].label);
  items.map((itemText, index) => 
    $(`<a class="dropdown-item w3-bar-item w3-button">${itemText.label}</a>`).on('click', ()=>{
      $(".dropdown-value",e).text(itemText.label);
      emitter.emit("select", {
        index,
        key: itemText.key
      })
    })
  ).forEach(item => $(".dropdown-content", e).append(item));
  currentIndex
  return {element: e, emitter};
}

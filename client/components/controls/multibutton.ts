import { $, _$ } from "../../lib/dom";
import { State } from "../../lib/state";

export class PicasaMultiButton extends HTMLElement {
  static observedAttributes = ["selected", "items", "inverse", "toggle"];
  private elements: _$[] = [];
  // connect component
  connectedCallback() {
    this.classList.add("picasa-button-control");
    this.classList.add("picasa-button-group");
    this.displayItems();
  }
  displayItems() {
    $(this).empty();
    // list of "|" separated items
    const items = this.getAttribute("items");
    const itemList = items.split("|");
    const elements = itemList.map((item, index) => {
      if (item.startsWith("url:")) {
        return $(
          `<img class="picasa-multi-button picasa-button" src="${item.slice(
            4,
          )}">`,
        );
      }
      return $(
        `<span class="picasa-multi-button picasa-button">${item}</span>`,
      );
    });
    $(this).appendAll(elements);
    this.elements = elements;
    this.elements.forEach((e, index) =>
      e.on("click", () => {
        this.select(index);
      }),
    );
    this.highlight();
  }
  select(index: number, set?: boolean) {
    const selected = new Set(this.selected());
    const multi = this.hasAttribute("multiselect");
    const toggle = this.hasAttribute("toggle");
    if (toggle) {
      if (selected.has(index) && set !== true) {
        selected.delete(index);
      } else {
        if (!multi || index === -1) {
          selected.clear();
        }
        if (index !== -1) selected.add(index);
      }
      this.setAttribute("selected", Array.from(selected).join(","));
    } else if (multi) {
      if (selected.has(index)) {
        if (set === true) {
          return; /// Already selected
        }
        selected.delete(index);
      } else {
        if (set === false) {
          return; // Not selected in the first place
        }
        selected.add(index);
      }
      this.setAttribute("selected", Array.from(selected).join(","));
    } else {
      if (selected.has(index)) {
        // No change
        return;
      }
      this.setAttribute("selected", index.toString());
    }
    const event = new InputEvent("select");
    (event as any).index = index;
    (event as any).indices = this.selected();
    this.dispatchEvent(event);
  }
  selected(): number[] {
    const c = this.getAttribute("selected") || "";
    return Array.from(new Set(c.length ? c.split(",") : [])).map((v) =>
      parseInt(v),
    );
  }
  toggle(index: number) {
    return this.select(index);
  }

  attributeChangedCallback(name: string, _oldValue: any, newValue: any) {
    if (name === "selected") {
      this.highlight();
    } else if (name === "items") {
      this.displayItems();
    }
  }

  highlight() {
    const c = this.getAttribute("selected") || "";
    const inverse = this.getAttribute("inverse") !== null;
    const sels = c.length ? c.split(",").map((v) => parseInt(v)) : [];
    this.elements.forEach((e, index) => {
      e.addRemoveClass(
        "picasa-multi-button-shaded",
        sels.includes(index) ? !inverse : inverse,
      );
    });
  }
  bind<K>(state: State<K>, key: keyof K, list: any[]) {
    this.addEventListener("select", (ev) => {
      const index = (ev as any).index;
      state.setValue(key, list[index]);
    });
    state.events.on(key, (ev) => {
      this.select(list.indexOf(ev));
    });
    if(state.getValue(key) !== undefined)
      this.select(list.indexOf(state.getValue(key)) as any);
  }
}
export function registerMultiButton() {
  window.customElements.define("picasa-multi-button", PicasaMultiButton);
}

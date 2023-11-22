import { $, _$ } from "../../lib/dom";

export class PicasaMultiButton extends HTMLElement {
  static observedAttributes = ["selected", "items"];
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
            4
          )}">`
        );
      }
      return $(
        `<span class="picasa-multi-button picasa-button">${item}</span>`
      );
    });
    $(this).appendAll(elements);
    this.elements = elements;
    this.elements.forEach((e, index) =>
      e.on("click", () => {
        this.select(index);
      })
    );
    this.highlight();
  }
  select(index: number, set?: boolean) {
    const selected = new Set(this.selected());
    const c = this.getAttribute("selected") || "";
    if (this.hasAttribute("multiselect")) {
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
    this.dispatchEvent(new InputEvent("select", {}));
  }
  selected(): number[] {
    const c = this.getAttribute("selected") || "";
    return Array.from(new Set(c.length ? c.split(",") : [])).map((v) =>
      parseInt(v)
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
    const sels = c.length ? c.split(",").map((v) => parseInt(v)) : [];
    this.elements.forEach((e, index) => {
      e.addRemoveClass("picasa-multi-button-active", sels.includes(index));
    });
  }
}
export function registerMultiButton() {
  window.customElements.define("picasa-multi-button", PicasaMultiButton);
}

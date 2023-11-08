import { $, _$ } from "../../lib/dom";

class PicasaMultiButton extends HTMLElement {
  static observedAttributes = ["selected"];
  private elements: _$[] = [];
  // connect component
  connectedCallback() {
    this.classList.add("picasa-button-control");
    // list of "|" separated items
    const items = this.getAttribute("items");
    const selected = this.getAttribute("selected");
    const itemList = items.split("|");
    const elements = itemList.map((item, index) => {
      const c =
        index === 0
          ? "picasa-multi-button-left"
          : index === itemList.length - 1
          ? "picasa-multi-button-right"
          : "picasa-multi-button-middle";
      if (item.startsWith("url:")) {
        return $(
          `<img class="${c} picasa-multi-button picasa-button" src="${item.slice(
            4
          )}">`
        );
      }
      return $(
        `<span class="${c} picasa-multi-button picasa-button">${item}</span>`
      );
    });
    $(this).appendAll(elements);
    this.elements = elements;
    this.elements.forEach((e, index) =>
      e.on("click", () => {
        this.setAttribute("selected", index.toString());
        this.dispatchEvent(new InputEvent("select", {}));
      })
    );
    this.highlight(parseInt(selected || "0"));
  }
  attributeChangedCallback(name: string, _oldValue: any, newValue: any) {
    if (name === "selected") {
      this.highlight(parseInt(newValue));
    }
  }

  highlight(elementIndex: number) {
    this.elements.forEach((e, index) => {
      e.addRemoveClass("picasa-multi-button-active", index === elementIndex);
    });
  }
}
export function registerMultiButton() {
  window.customElements.define("picasa-multi-button", PicasaMultiButton);
}

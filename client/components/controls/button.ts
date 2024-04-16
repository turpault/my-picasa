import { $ } from "../../lib/dom";

class PicasaButton extends HTMLElement {
  static observedAttributes = ["type", "iconpos", "icon"];
  // connect component
  connectedCallback() {
    this.classList.add("picasa-button");
    this.classList.add("picasa-button-control");
    this.update();
  }
  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === "type") {
      this.classList.remove("picasa-button-" + oldValue);
    }
    this.update();
  }
  update() {
    if (this.hasAttribute("type")) {
      this.classList.add("picasa-button-" + this.getAttribute("type"));
      this.classList.add("picasa-button-type");
    } else {
      const icon = this.getAttribute("icon");
      $(this).addRemoveClass("picasa-button-icon", !!icon);
      if (icon) {
        this.classList.add("picasa-button-icon");
        const pos = this.getAttribute("iconpos");
        if (pos === "top") {
          this.setAttribute(
            "style",
            `background: url(${icon}) 50% 5px/24px 24px no-repeat, linear-gradient(#f3f3f3, #dddddd);`
          );
        } else {
          this.setAttribute(
            "style",
            `background: url(${icon}) 5px 50%/24px 24px no-repeat, linear-gradient(#f3f3f3, #dddddd);`
          );
        }
      } else {
        this.setAttribute(
          "style",
          `background: linear-gradient(#f3f3f3, #dddddd);`
        );
      }
    }
  }
}
export function registerButton() {
  window.customElements.define("picasa-button", PicasaButton);
}

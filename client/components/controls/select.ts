class PicasaSelect extends HTMLSelectElement {
  // connect component
  connectedCallback() {
    this.classList.add("picasa-select");
    this.classList.add("picasa-select-control");
    const icon = this.getAttribute("icon");
    if (icon) {
      this.classList.add("picasa-select-icon");
      this.setAttribute(
        "style",
        `background: url(${icon}) 5px 50%/24px 24px no-repeat, linear-gradient(#f3f3f3, #dddddd);`
      );
    } else {
      this.setAttribute(
        "style",
        `background: linear-gradient(#f3f3f3, #dddddd);`
      );
    }
  }
}
export function registerSelect() {
  window.customElements.define("picasa-select", PicasaSelect, {
    extends: "select",
  });
}

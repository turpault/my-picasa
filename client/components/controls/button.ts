class PicasaButton extends HTMLElement {
  // connect component
  connectedCallback() {
    this.classList.add("picasa-button");
    this.classList.add("picasa-button-control");
    const icon = this.getAttribute("icon");
    if (icon) {
      this.classList.add("picasa-button-icon");
      if (this.getAttribute("iconpos") === "top") {
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
export function registerButton() {
  window.customElements.define("picasa-button", PicasaButton);
}

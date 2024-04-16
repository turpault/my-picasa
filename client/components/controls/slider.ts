import { $, _$ } from "../../lib/dom";

class PicasaSlider extends HTMLInputElement {
  // connect component
  connectedCallback() {
    this.setAttribute("type", "range");
    this.classList.add("picasa-slider");
    this.addEventListener("resize", () => this.resized());
    this.resized();
  }
  resized() {
    const min = parseFloat(this.getAttribute("min") || "");
    const max = parseFloat(this.getAttribute("max") || "");
    if (max - min < 100) {
      this.setAttribute("step", ((max - min) / 100).toString());
    }

    const ticks = [
      min,
      ...(this.getAttribute("ticks") || "")
        .split(",")
        .map((v) => parseFloat(v)),
      max,
    ];
    const intervals = ticks
      .map((v) => {
        const pos = (94 * (v - min)) / (max - min) + 2.5;
        const dpos = pos + 1;
        return `transparent ${pos}%, gray ${pos}%, gray ${dpos}%, transparent ${dpos}%`;
      })
      .join(", ");
    this.setAttribute(
      "style",
      `background: linear-gradient(to right, ${intervals}), linear-gradient(to bottom, #bec9d1, #ccd5e1)`
    );
    this.addEventListener("input", () => this.changed());
  }
  changed() {
    const min = parseFloat(this.getAttribute("min") || "");
    const max = parseFloat(this.getAttribute("max") || "");
    const ticks = [
      min,
      ...(this.getAttribute("ticks") || "")
        .split(",")
        .map((v) => parseFloat(v)),
      max,
    ];

    // Snap at 5% of the slider range
    for (const t of ticks) {
      if (Math.abs(parseFloat(this.value) - t) < (2.5 * (max - min)) / 100) {
        this.value = t.toString();
        break;
      }
    }
  }
}

export function registerSlider() {
  window.customElements.define("picasa-slider", PicasaSlider, {
    extends: "input",
  });
}

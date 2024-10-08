import { State } from "../../lib/state";

export class PicasaInput extends HTMLInputElement {
  // connect component
  connectedCallback() {
    this.classList.add("picasa-input");
    this.classList.add("picasa-input-control");
  }

  bind<K>(state: State<K>, key: keyof K) {
    this.addEventListener("input", (ev) => {
      state.setValue(key, this.value);
    });
    state.events.on(key, (ev) => {
      this.value = ev as any;
    });
    if (state.getValue(key) !== undefined)
      this.value = state.getValue(key) as any;
  }
}
export function registerInput() {
  window.customElements.define("picasa-input", PicasaInput, {
    extends: "input",
  });
}

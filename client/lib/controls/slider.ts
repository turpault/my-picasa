import { SliderEvent } from "../../../shared/types/types.js";
import { buildEmitter, Emitter } from "../../../shared/lib/event.js";
import { $ } from "../dom.js";

export function slider(
  e: HTMLElement,
  min: number,
  max: number,
  value: number
): Emitter<SliderEvent> {
  const event = buildEmitter<SliderEvent>();
  const child = $(`
  <div class="slidecontainer">
  <input type="range" min="${min}" max="${max}" value="${value}" class="slider" id="range">
  </div>`);
  const range = $("#range", child);
  range.on("input", () => {
    event.emit("value", range.val());
  });
  e.appendChild(child.get());
  return event;
}

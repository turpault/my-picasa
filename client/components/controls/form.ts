import { $, _$ } from "../../lib/dom";
import { State, StateDef } from "../../lib/state";
import { t } from "../strings";
import { PicasaInput } from "./input";
import { PicasaMultiButton } from "./multibutton";

export type FormEntry = {
  type: "choice" | "button" | "text" | "separator" | "color";
  label: string;
  values: string[] | string | number[];
  id: string;
  icon?: string;
};

export type Form = {
  entries: FormEntry[];
};

export function MakeForm<T extends StateDef>(form: Form, state: State<T>): _$ {
  const e = $('<div class="form"></div>');
  form.entries.forEach((entry) => {
    const entryDiv = $(`<div class="form-entry"></div>`);
    if (entry.type === "text") {
      entryDiv.append(`<label>${entry.label}</label>`);
      const input = $<PicasaInput>(`<input is="picasa-input">`).attr({
        type: "text",
        name: entry.id,
      });
      input.get().bind(state, entry.id);
      entryDiv.append(input);
    } else if (entry.type === "choice") {
      entryDiv.append(`<label>${entry.label}</label>`);
      const values = entry.values as (number | string)[];
      const select = $<PicasaMultiButton>("picasa-multi-button").attr({
        class: "form-button",
        items: values.join("|"),
      });
      select.get().bind(state, entry.id, values);
      entryDiv.append(select);
    } else if (entry.type === "button") {
      const button = $("picasa-button")
        .attr({
          class: "form-button",
          icon: entry.icon ? entry.icon : undefined,
        })
        .text(t(entry.label));
      button.on("click", () => {
        state.setValue(entry.id, true as any);
        state.setValue(entry.id, false as any);
      });
      entryDiv.append(button);
    } else if (entry.type === "separator") {
      entryDiv
        .appendAnd("div")
        .addClass("form-separator")
        .text(entry.label || "");
    } else if (entry.type === "color") {
      entryDiv.append(`<label>${entry.label}</label>`);
      const input = $<PicasaInput>(`<input is="picasa-input">`).attr({
        type: "color",
        name: entry.id,
      });
      input.get().bind(state, entry.id);
      entryDiv.append(input);
    }

    e.append(entryDiv);
  });
  return e;
}

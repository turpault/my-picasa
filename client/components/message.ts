import { resolve } from "path";
import { $ } from "../lib/dom";

export enum Button {
  Ok = "Ok",
  Cancel = "Cancel",
}

export async function message(
  message: string,
  buttons: Button[] = [Button.Ok]
): Promise<Button> {
  const q = $(`<div class="messagebox w3-modal">
  <div class="w3-modal-content">
    <div class="w3-container">
      <p class="message">${message}</p>
      <div class="okcancel">
      </div>
    </div>
  </div>
  </div>
  `);
  const qs = $(".okcancel", q);

  $(document.body).append(q);

  return new Promise<Button>((resolve) => {
    buttons.forEach((button) => {
      qs.append(
        $(
          `<a class="button-${button} w3-button ${
            button === Button.Ok ? "w3-green" : ""
          }">${button}</a>`
        ).on("click", () => {
          q.remove();
          resolve(button);
        })
      );
    });
  });
}

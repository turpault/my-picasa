import { $ } from "../lib/dom";
import { hookKeyboardEvents } from "./hotkey";

export async function question(
  message: string,
  placeHolder: string,
): Promise<string | undefined> {
  const q = $(`<div class="questionbox w3-modal">
  <div class="w3-modal-content">
    <div class="w3-container">
      <p class="message">${message}</p>
      <input class="question" placeholder="${placeHolder}"></input>
      <div class="okcancel">
      <a class="confirm w3-button w3-green">Ok</a>
      <a class="cancel w3-button w3-red">Cancel</a>
      </div>
    </div>
  </div>
</div>
`);
  $(document.body).append(q);
  q.css({
    display: "block",
  });
  $(".question", q).focus();
  let off: Function;
  return new Promise<string | undefined>((resolve) => {
    $(".confirm", q).on("click", () => {
      resolve($(".question", q).val());
    });
    $(".cancel", q).on("click", () => {
      resolve(undefined);
    });
    off = hookKeyboardEvents.on("keyDown", (e) => {
      if (e.code === "Enter") {
        resolve($(".question", q).val());
      } else if (e.code === "Escape") {
        resolve(undefined);
      }
    });
  }).finally(() => {
    q.remove();
    off();
  });
}

import { t } from "./strings";

export enum Button {
  Ok = "Ok",
  Cancel = "Cancel",
}

export async function message(
  message: string,
  buttons: (Button | string)[] = [Button.Ok],
): Promise<Button | string> {
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
  let off: Function;

  return new Promise<Button | string>((resolve) => {
    off = hookKeyboardEvents.on("keyDown", (e) => {
      if (e.code === "Enter") {
        resolve(Button.Ok);
      } else if (e.code === "Escape") {
        resolve(Button.Cancel);
      }
    });

    buttons.forEach((button) => {
      qs.append(
        $(
          `<a class="button-${button} w3-button ${
            button === Button.Ok ? "w3-green confirm" : "cancel"
          }">${button}</a>`,
        ).on("click", () => {
          resolve(button);
        }),
      );
    });
  }).finally(() => {
    q.remove();
    off();
  });
}

export function notImplemented() {
  return message(t("Not implemented yet"));
}

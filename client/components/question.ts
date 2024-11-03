import { $, _$ } from "../lib/dom";
import { hookKeyboardEvents } from "./hotkey";

export async function modalForm(
  title: string,
  form: _$,
): Promise<string | undefined> {
  const q = $(`<div class="modalform w3-modal">
  <div class="w3-modal-content">
    <div class="w3-container">
      <p class="title">${title}</p>
      <div class="form"></div>
      <div class="okcancel">
      <a class="confirm w3-button w3-green">${t("Ok")}</a>
      <a class="cancel w3-button w3-red">${t("Cancel")}</a>
      </div>
    </div>
  </div>`);
  $(".form", q).append(form);
  $(document.body).append(q);
  return show(q);
}
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
      <a class="confirm w3-button w3-green disabled">${t("Ok")}</a>
      <a class="cancel w3-button w3-red">${t("Cancel")}</a>
      </div>
    </div>
  </div>
</div>
`);
  $(document.body).append(q);
  $(".question", q).focus();
  return show(q);
}
async function show(q: _$) {
  q.css({
    display: "block",
  });
  let off: Function;
  return new Promise<string | undefined>((resolve) => {
    const question = $(".question", q);
    $(".confirm", q).on("click", () => {
      resolve(question.val());
    });
    $(".cancel", q).on("click", () => {
      resolve(undefined);
    });
    question.on("input", (ev) => {
      $(".confirm", q).addRemoveClass("disabled", question.val() === "");
    });
    off = hookKeyboardEvents.on("keyDown", (e) => {
      if (e.code === "Enter") {
        resolve(question.val());
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

export async function message<T extends Button | string>(
  message: string,
  buttons: T[] = [Button.Ok] as T[],
): Promise<T> {
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

  return new Promise<T>((resolve) => {
    off = hookKeyboardEvents.on("keyDown", (e) => {
      if (e.code === "Enter") {
        resolve(Button.Ok as T);
      } else if (e.code === "Escape") {
        resolve(Button.Cancel as T);
      }
    });

    buttons.forEach((button) => {
      qs.append(
        $(
          `<a class="button-${button} w3-button ${
            button === Button.Ok ? "w3-green confirm" : "cancel"
          }">${t(button)}</a>`,
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

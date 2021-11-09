import { __ } from "../lib/dom";

export async function question(
  message: string,
  placeHolder: string
): Promise<"ok" | "cancel"> {
  const q = __(`<div class="messagebox w3-modal">
  <div class="w3-modal-content">
    <div class="w3-container">
      <p class="message"></p>
      <a class="confirm w3-button w3-green">Ok</a>
      <a class="cancel w3-button w3-red">Cancel</a>
    </div>
  </div>
  </div>
  `);
  __(document.body).append(q);
  __("message", q).get().innerText = message;
  q.css({
    display: "",
  });

  return new Promise<"ok" | "cancel">((resolve) => {
    __(".confirm", q).on("click", () => {
      q.remove();
      resolve("ok");
    });
    __(".cancel", q).on("click", () => {
      q.remove();
      resolve("cancel");
    });
  });
}

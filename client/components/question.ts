import { __ } from "../lib/dom";

export async function question(
  message: string,
  placeHolder: string
): Promise<string | undefined> {
  const q = __(`<div class="questionbox w3-modal">
  <div class="w3-modal-content">
    <div class="w3-container">
      <p class="message"></p>
      <input class="question"></input>
      <a class="confirm w3-button w3-green">Ok</a>
      <a class="cancel w3-button w3-red">Cancel</a>
    </div>
  </div>
</div>
`);
  __(document.body).append(q);
  __("message", q).get().innerText = message;
  (__("question", q).get() as HTMLInputElement).placeholder = placeHolder;
  q.css({
    display: "",
  });

  return new Promise<string | undefined>((resolve) => {
    __(".confirm", q).on("click", () => {
      q.remove();
      resolve(__("question", q).val());
    });
    __(".cancel", q).on("click", () => {
      q.remove();
      resolve(undefined);
    });
  });
}

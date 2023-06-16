import { $ } from "../lib/dom";

let displayed = false;
export function questionIsDisplayed() {
  return displayed;
}
export async function question(
  message: string,
  placeHolder: string
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
  displayed = true;
  $(".question", q).focus();

  return new Promise<string | undefined>((resolve) => {
    $(".confirm", q).on("click", () => {
      q.remove();
      displayed = false;
      resolve($(".question", q).val());
    });
    $(".cancel", q).on("click", () => {
      q.remove();
      displayed = false;
      resolve(undefined);
    });
    q.on("keydown", (e) => {
      if (e.code === "Enter") {
        q.remove();
        displayed = false;
        resolve($(".question", q).val());
      }
    });
  });
}

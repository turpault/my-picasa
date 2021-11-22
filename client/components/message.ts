import { $ } from "../lib/dom.js";

export async function message(message: string): Promise<void> {
  const q = $(`<div class="messagebox w3-modal">
  <div class="w3-modal-content">
    <div class="w3-container">
      <p class="message">${message}</p>
      <div class="okcancel">
      <a class="confirm w3-button w3-green">Ok</a>
      </div>
    </div>
  </div>
  </div>
  `);
  $(document.body).append(q);

  return new Promise<void>((resolve) => {
    $(".confirm", q).on("click", () => {
      q.remove();
      resolve();
    });
  });
}

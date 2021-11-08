import { $ } from "../lib/dom";

export async function question(message: string, placeHolder: string):Promise<'ok'|'cancel'> {
  const q = $(`<div class="messagebox w3-modal">
  <div class="w3-modal-content">
    <div class="w3-container">
      <p class="message"></p>
      <a class="confirm w3-button w3-green">Ok</a>
      <a class="cancel w3-button w3-red">Cancel</a>
    </div>
  </div>
  </div>
  `);
  $(document.body).append(q);
  $('message', q).get().innerText = message;
  q.css({
    display:''
  });

  return new Promise<'ok'|'cancel'>(resolve => {
  $('.confirm', q).on('click', () =>{
    q.remove();
    resolve('ok');
  });
  $('.cancel', q).on('click', () =>{
    q.remove();
    resolve('cancel');
  });
});
}

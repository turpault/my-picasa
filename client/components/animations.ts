import { $ } from "../lib/dom.js";
import { sleep } from "../../shared/lib/utils.js";

export async function animateStar(activate: boolean) {
  const star = $(".star-animation");
  star.removeClass("star-animation-activate star-animation-deactivate");
  await sleep(0.01);
  star.addRemoveClass("star-animation-activate", activate);
  star.addRemoveClass("star-animation-deactivate", !activate);
}

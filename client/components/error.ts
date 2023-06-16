import { $ } from "../lib/dom";
import { buildEmitter } from "../../shared/lib/event";
import { TabEvent, makeGenericTab } from "./tabs";

const html = `<div class="error fill" style="position: relative">
<div class="error-message"></div>
</div>`;

export async function makeErrorPage(e: Error) {
  const win = $(html);
  $(".error-message", win).text(e.message);
  const tabEvent = buildEmitter<TabEvent>();
  const tab = makeGenericTab(tabEvent);
  return { win, tab };
}

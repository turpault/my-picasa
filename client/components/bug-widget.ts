import { _$ } from "../lib/dom";
import { getService } from "../rpc/connect";
import { Bug } from "../types/types";
import { question } from "./question";
import { t } from "./strings";

export function makeBugWidget(e: _$) {
  e.on("click", async () => {
    const answer = await question(t("What is the bug?"), t("Describe the bug"));
    if (answer) {
      console.log("Bug:", answer);
      const s = await getService();
      s.addBug(answer);
    }
  }).on("mouseenter", async () => {
    e.attr("data-tooltip-below", t("Loading bugs..."));
    const s = await getService();
    const bugs = (await s.getBugs()) as Bug[];
    console.log("Bugs:", bugs);
    const textAsHTML = bugs
      .map((b) => `${t(b.status)}: ${b.description}`)
      .join("\r\n");
    e.attr("data-tooltip-below", textAsHTML);
  });
}

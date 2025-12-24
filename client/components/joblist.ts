import { $ } from "../lib/dom";
import { getService } from "../rpc/connect";
import { Job } from "../../shared/types/types";
import { t } from "./strings";
import { events } from "../../shared/server-events";

export async function makeJobList(e: HTMLElement) {
  const el = $(e);
  const jobs: { [id: string]: Job } = {};
  function refreshList() {
    el.empty();
    el.css({
      display: "none",
    });
    for (const job of Object.values(jobs)) {
      el.append(
        `<div class="job"><span>${t(
          job.name,
        )}:</span><span style="float:right">${Math.floor(
          (100 * (job.progress.total - job.progress.remaining)) /
            job.progress.total,
        )}%</span><br>${job.errors.join("<br>")}</div>`,
      );
      el.css({
        display: "block",
      });
    }
  }
  events.on("jobChanged", (job) => {
    jobs[job.id] = job;
    refreshList();
  });
  events.on("jobFinished", (job) => {
    jobs[job.id] = job;
    refreshList();
  });
  events.on("jobDeleted", (job) => {
    setTimeout(() => {
      delete jobs[job.id];
      refreshList();
    }, 5000);
  });
}

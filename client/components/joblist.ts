import { $ } from "../lib/dom";
import { getService } from "../rpc/connect";
import { Job } from "../../shared/types/types";
import { t } from "./strings";

export async function makeJobList(e: HTMLElement) {
  const el = $(e);
  const service = await getService();
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
  service.on("jobChanged", (e: any) => {
    const job = e.payload as Job;
    jobs[job.id] = job;
    refreshList();
  });
  service.on("jobAdded", (e: any) => {
    const job = e.payload as Job;
    jobs[job.id] = job;
    refreshList();
  });
  service.on("jobFinished", (e: any) => {
    const job = e.payload as Job;
    jobs[job.id] = job;
    refreshList();
  });
  service.on("jobDeleted", (e: any) => {
    const job = e.payload as Job;
    setTimeout(() => {
      delete jobs[job.id];
      refreshList();
    }, 5000);
  });
}

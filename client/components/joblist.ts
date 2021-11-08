import { $ } from "../lib/dom.js";
import { getService } from "../rpc/connect.js";
import { Job } from "../types/types.js";

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
        `<div class="job">${job.name}: ${Math.floor(
          (100 * job.progress.start) / job.progress.remaining
        )}%<br>${job.errors.join("<br>")}</div>`
      );
      el.css({
        display: "",
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
    delete jobs[job.id];
    refreshList();
  });
}

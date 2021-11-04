import { getService } from "../rpc/connect.js";

export async function makeJobList(e: HTMLElement) {
  const service = await getService();
  service.on("jobChanged", (event: any) => {
    const job = event.job;
  });
  service.on("jobAdded", (event: any) => {
    const job = event.job;
  });
  service.on("jobFinished", (event: any) => {
    const job = event.job;
  });
  service.on("jobDeleted", (event: any) => {
    const job = event.job;
  });
}

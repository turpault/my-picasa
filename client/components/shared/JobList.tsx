import { useState, useEffect, useCallback } from "react";
import { events as serverEvents } from "../../../shared/server-events";
import type { Job } from "../../../shared/types/types";

function JobItem({ job }: { job: Job }) {
  const { total, remaining } = job.progress;
  const done = total - remaining;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="job-item">
      <div className="job-header">
        <span className="job-name">{job.name}</span>
        <span className="job-status">{job.status}</span>
      </div>
      <div className="w3-light-grey" style={{ height: 8, borderRadius: 4 }}>
        <div
          className="w3-theme"
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 4,
            transition: "width 0.3s",
          }}
        />
      </div>
      <div className="job-progress-label">
        {done}/{total} ({pct}%)
      </div>
    </div>
  );
}

export function JobList() {
  const [jobs, setJobs] = useState<Map<string, Job>>(new Map());

  const upsertJob = useCallback((job: Job) => {
    setJobs((prev) => new Map(prev).set(job.id, job));
  }, []);

  const removeJob = useCallback((job: Job) => {
    setJobs((prev) => {
      const next = new Map(prev);
      next.delete(job.id);
      return next;
    });
  }, []);

  useEffect(() => {
    const offs = [
      serverEvents.on("jobChanged", upsertJob),
      serverEvents.on("jobFinished", removeJob),
      serverEvents.on("jobDeleted", removeJob),
    ];
    return () => offs.forEach((off) => off());
  }, [upsertJob, removeJob]);

  if (jobs.size === 0) return null;

  return (
    <div className="jobs">
      <div className="w3-theme w3-container">
        <h3>Jobs</h3>
        <div className="joblist">
          {[...jobs.values()].map((job) => (
            <JobItem key={job.id} job={job} />
          ))}
        </div>
      </div>
    </div>
  );
}

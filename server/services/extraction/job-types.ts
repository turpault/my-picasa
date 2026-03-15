export const JOB_PRIORITY = { EXIF: 1, GEO: 2, OTHER: 3 } as const;
export type JobType = keyof typeof JOB_PRIORITY;

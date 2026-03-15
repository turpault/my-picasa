export const JOB_PRIORITY = {
  EXIF: 1,
  WALK: 2,
  THUMBNAIL: 3,
  INDEX: 4,
  FACE: 5,
  UPDATE_ENTRY: 6,
  UPDATE_GEO_POI: 7,
  REMOVE: 8,
  /** Default for unknown job types. */
  OTHER: 5,
} as const;
export type JobType = keyof typeof JOB_PRIORITY;

/**
 * Wall-clock deadline for bounded worker runs (e.g. faces / favorites batch jobs).
 */
export function createRunDeadline(maxDurationMs: number): {
  isExpired: () => boolean;
  remainingMs: () => number;
} {
  const end = Date.now() + Math.max(0, maxDurationMs);
  return {
    isExpired: () => Date.now() >= end,
    remainingMs: () => Math.max(0, end - Date.now()),
  };
}

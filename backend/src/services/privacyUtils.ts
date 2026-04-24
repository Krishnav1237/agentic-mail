export const normalizeRetentionDaysWithBounds = (
  value: number,
  minDays: number,
  maxDays: number
) => Math.max(minDays, Math.min(maxDays, Math.trunc(value)));

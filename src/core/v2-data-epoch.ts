/** Progress and public statistics restart together. Old test data is not imported. */
export const DATA_EPOCH = "20261016-monthly-replay-v1";
export const DATA_EPOCH_STARTED_AT = "2026-10-16T05:25:29.000Z";

export function isCurrentDataEpoch(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.epoch === DATA_EPOCH && typeof record.savedAt === "string"
    && Number.isFinite(Date.parse(record.savedAt))
    && Date.parse(record.savedAt) >= Date.parse(DATA_EPOCH_STARTED_AT);
}

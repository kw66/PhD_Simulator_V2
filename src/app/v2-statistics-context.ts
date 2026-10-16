import { getRoleOptions } from "../core/v2-progression";

const roles = new Set<string>(getRoleOptions().map((role) => role.id));
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Old queued rows have no context; new diagnostics must agree with the scored row. */
export function validStatisticsContext(value: unknown, score: unknown): boolean {
  if (value == null) return true;
  if (!object(value) || value.version !== 1 || !roles.has(String(value.roleId))
    || typeof value.runKey !== "string" || value.runKey.length > 160
    || typeof value.paperId !== "string" || !value.paperId.length || value.paperId.length > 100
    || !Number.isInteger(value.totalMonths) || Number(value.totalMonths) < 0 || Number(value.totalMonths) > 120
    || !object(value.scores)) return false;
  try {
    const run = JSON.parse(value.runKey);
    if (!Array.isArray(run) || run.length !== 2 || !Number.isFinite(run[0]) || run[1] !== value.roleId) return false;
    // Pretty output conservatively includes PostgreSQL jsonb's added whitespace.
    if (new TextEncoder().encode(JSON.stringify(value, null, 1)).length > 32_768) return false;
  } catch { return false; }
  let total = 0;
  for (const field of ["idea", "experiment", "writing"]) {
    const part = value.scores[field];
    if (!object(part) || ![part.own, part.collaboration, part.total].every((n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000)
      || Number(part.own) + Number(part.collaboration) !== part.total) return false;
    total += Number(part.total);
  }
  return total === score;
}

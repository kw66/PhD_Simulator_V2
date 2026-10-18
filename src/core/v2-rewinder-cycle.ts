import type { AccountProfile } from "./v2-types";

/** Settled attempts, including complete academic chapters; event rewinds do not advance it. */
export function normalizeRewinderCycleNumber(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 1;
}

export function getNextRewinderCycleNumber(account: AccountProfile): number {
  const settled = account.roleProgress.rewinder.playedRuns;
  return Number.isSafeInteger(settled) && settled >= 0
    ? Math.min(Number.MAX_SAFE_INTEGER, settled + 1) : 1;
}

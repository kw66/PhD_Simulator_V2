import { getAiModelById } from "./v2-ai-shop";
import { createAchievementRunProgress, type AchievementRunProgress } from "./v2-achievement-runtime-types";
import { usesGameplayRulesFrom } from "./v2-rule-context";
import type { DispatchPayload, GameActionId, GameState } from "./v2-types";

function satisfy(run: AchievementRunProgress, id: string): void {
  if (!run.satisfied.includes(id)) run.satisfied.push(id);
}

function recordPaidAiMonth(state: GameState, run: AchievementRunProgress): void {
  if (state.totalMonths < 1) return;
  const paid = Object.values(state.aiShopState.subscriptions).some(subscription => subscription.active
    && subscription.lastRenewalTotalMonths === state.totalMonths
    && (getAiModelById(subscription.modelId)?.price ?? 0) > 0);
  if (!paid) return;
  const months = new Set(run.sets["unlock-paid-ai-months"] ?? []);
  months.add(String(state.totalMonths));
  run.sets["unlock-paid-ai-months"] = [...months];
  if (Array.from(months).some(month => Array.from({ length: 6 }, (_, offset) =>
    months.has(String(Number(month) - offset))).every(Boolean))) satisfy(run, "unlock:genius-reversed");
}

/** Observe actual committed behavior, without requiring a successful graduation. */
export function observeRoleUnlockAchievements(
  previous: GameState, next: GameState, run: AchievementRunProgress,
  actionId?: GameActionId, payload?: DispatchPayload,
): void {
  if (!usesGameplayRulesFrom("20261028-r59")) return;
  if (next.selectedRoleId === "genius") {
    recordPaidAiMonth(previous, run);
    recordPaidAiMonth(next, run);
  }
  if (next.selectedRoleId === "teacher-child") {
    const years = new Set<number>();
    const giftedYears = new Set<number>();
    for (const record of next.eventHistory) {
      if (record.chainId !== "teachers-day") continue;
      if (record.stages.some(stage => /^teachers-day-message-y\d+-m\d+$/u.test(stage.selectedChoiceId))) {
        years.add(record.completedAtYear);
      }
      if (record.stages.some(stage => /^teachers-day-(?:gift-|stamp-)/u.test(stage.selectedChoiceId))) {
        giftedYears.add(record.completedAtYear);
      }
    }
    if ([1, 2, 3, 4, 5, 6].every(year => years.has(year) && !giftedYears.has(year))) {
      satisfy(run, "unlock:teacher-child-reversed");
    }
  }
  if (next.selectedRoleId === "social" && actionId === "end-relationship" && payload?.relationshipId) {
    const removed = previous.fellowProgressState.find(fellow => fellow.id === payload.relationshipId);
    if (removed && removed.research > previous.player.research
      && !next.fellowProgressState.some(fellow => fellow.id === removed.id)) satisfy(run, "unlock:social-reversed");
  }
  if (next.selectedRoleId === "chosen" && previous.degree === "master" && next.degree === "phd"
    && previous.totalMonths > 30) {
    const researchedEarly = Object.entries(run.counters).some(([key, value]) => {
      const month = /^research-actions:(\d+)$/u.exec(key)?.[1];
      return month !== undefined && Number(month) >= 1 && Number(month) <= 30 && value > 0;
    });
    if (!researchedEarly) satisfy(run, "unlock:chosen-reversed");
  }
}

/** Sample after the outgoing month's settlements and before next month's income/renewals. */
export function recordRoleUnlockMonthEnd(state: GameState): GameState {
  if (!usesGameplayRulesFrom("20261028-r59") || state.phase !== "playing"
    || state.selectedRoleId !== "rich" || state.totalMonths < 1) return state;
  const progress = state.achievementProgress ?? createAchievementRunProgress();
  if (progress.counters["unlock-reserve-last-month"] === state.totalMonths) return state;
  const run = structuredClone(progress);
  const previousMonth = run.counters["unlock-reserve-last-month"];
  run.counters["unlock-reserve-streak"] = state.player.money >= 50
    ? (previousMonth === state.totalMonths - 1 ? run.counters["unlock-reserve-streak"] ?? 0 : 0) + 1
    : 0;
  run.counters["unlock-reserve-last-month"] = state.totalMonths;
  if (run.counters["unlock-reserve-streak"] >= 6) satisfy(run, "unlock:rich-reversed");
  return { ...state, achievementProgress: run };
}

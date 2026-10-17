import { describe, expect, it } from "vitest";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { consumeActiveOperation, getActiveOperationAllowance, getAiModelForTotalMonths } from "../src/core/v2-ai-shop";
import { advanceBuffDurations } from "../src/core/v2-buffs";
import { observeEventAchievements } from "../src/core/v2-achievement-events";
import { createAchievementRunProgress } from "../src/core/v2-achievement-runtime-types";
import { createStudyFatigueEvent, isStudyFatigueEligible, settleScheduledActionBuffs } from "../src/core/v2-study-fatigue";
import { createRandomEventById, isRandomEventEligible } from "../src/core/v2-random-event-router";
import { applyResearchOperation, createResearchPaper } from "../src/core/v2-research-operation";
import type { Buff, GameState } from "../src/core/v2-types";
import { renderApp } from "../src/app/v2-render";
import { withGameplayRuleset } from "../src/core/v2-rule-context";

function state(): GameState {
  const s = createInitialState();
  return { ...s, phase: "playing", year: 1, month: 12, totalMonths: 4, playerName: "学生", selectedAdvisorName: "导师",
    eventQueue: [], sanCap: 30, player: { ...s.player, san: 10, research: 6, social: 1, money: 30 },
    achievementProgress: createAchievementRunProgress() };
}

function choose(s: GameState, index = 0): GameState {
  const event = s.eventQueue[0]!;
  return dispatchAction(s, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[index]!.id });
}

function finish(option: number): { before: GameState; after: GameState } {
  const before = state();
  const event = createStudyFatigueEvent(before);
  const queued = { ...before, eventQueue: [createEventQueueItem(event, 0)] };
  const after = choose(choose(choose(queued), option));
  return { before, after };
}

describe("厌倦学习", () => {
  it("quotes social resistance in the friends option while preserving old replay copy", () => {
    const initial = state();
    initial.player.social = 18;
    const decision = createStudyFatigueEvent(initial).choices[0]!.effects.enqueueEvents![0]!;
    expect(decision.choices[2]!.outcome).toContain("社交 +0.4（抵抗0.6）");
    const legacy = withGameplayRuleset("20261017-r3", () => createStudyFatigueEvent(initial));
    expect(legacy.choices[0]!.effects.enqueueEvents![0]!.choices[2]!.outcome).toContain("社交 +1");
  });

  it.each([[0, "科研 -0.4（抵抗0.6）"], [3, "科研 -1（抵抗1）"]])("shows resisted research in current and historical results without rewriting the saved event: %i", (option, expected) => {
    const initial = state();
    const before = { ...initial, player: { ...initial.player, research: 18 } };
    const queued = { ...before, eventQueue: [createEventQueueItem(createStudyFatigueEvent(before), 0)] };
    const result = choose(choose(queued), Number(option));
    const source = JSON.stringify(result);
    const event = result.eventQueue[0]!;
    expect(renderApp(result, undefined, { isEventContentOpen: true, activeEventId: event.id })).toContain(expected);
    expect(JSON.stringify(result)).toBe(source);
    const completed = choose(result);
    expect(renderApp(completed, undefined, { isEventContentOpen: true, activeEventHistoryId: completed.eventHistory.at(-1)!.id })).toContain(expected);
  });

  it("requires three completed consecutive months of the player's research, not ordinary resting", () => {
    let s = state();
    for (const month of [1, 2, 3]) s = consumeActiveOperation({ ...s, totalMonths: month, actionState: { ...s.actionState, used: 0 } }, "idea");
    s = { ...s, totalMonths: 4 };
    expect(isStudyFatigueEligible(s)).toBe(true);
    expect(isRandomEventEligible(s, 19)).toBe(true);
    expect(isStudyFatigueEligible({ ...s, totalMonths: 3 })).toBe(false);
    expect(isStudyFatigueEligible({ ...s, totalMonths: 5 })).toBe(false);
    let rest = state();
    for (const month of [1, 2, 3]) rest = consumeActiveOperation({ ...rest, totalMonths: month, actionState: { ...rest.actionState, used: 0 } }, "rest");
    expect(isStudyFatigueEligible({ ...rest, totalMonths: 4 })).toBe(false);
  });

  it("does not count failed research or fellow-only study and remembers successful paper operations", () => {
    const initial = state();
    expect(applyResearchOperation(initial, "missing", "idea").achievementProgress?.counters["research-actions:4"]).toBeUndefined();
    const drafted = createResearchPaper(initial, 0);
    const research = applyResearchOperation(drafted, drafted.papers[0]!.id, "idea", () => 0.5);
    expect(research.achievementProgress?.counters["research-actions:4"]).toBe(1);
    expect(isStudyFatigueEligible({ ...initial, totalMonths: 10 })).toBe(false);
  });

  it.each([
    [0, -0.8, 6, 0, 0, 0],
    [1, -0.8, 0, 3, 0, 0],
    [2, -0.8, 0, 0, 1, 0],
    [3, -1.8, 0, 0, 0, 3],
  ])("settles option %s with shared resistance and exactly one future penalty", (option, research, san, cap, social, money) => {
    const { before, after } = finish(option);
    expect(after.player.research - before.player.research).toBeCloseTo(research);
    expect(after.player.san - before.player.san).toBe(san);
    expect(after.sanCap - before.sanCap).toBe(cap);
    expect(after.player.social - before.player.social).toBe(social);
    expect(after.player.money - before.player.money).toBe(money);
    expect(after.actionState.limit).toBe(before.actionState.limit);
    expect(after.buffs.filter(buff => buff.source === "厌倦学习")).toHaveLength(1);
    const nextMonth = settleScheduledActionBuffs({ ...after, totalMonths: 5 });
    expect(nextMonth.actionState.limit).toBe(0);
    expect(settleScheduledActionBuffs(nextMonth).actionState.limit).toBe(0);
    const following = settleScheduledActionBuffs({ ...nextMonth, totalMonths: 6, buffs: advanceBuffDurations(nextMonth.buffs) });
    expect(following.actionState.limit).toBe(1);
    expect(advanceBuffDurations(following.buffs).filter(buff => buff.source === "厌倦学习")).toHaveLength(0);
    expect(isStudyFatigueEligible(after)).toBe(false);
  });

  it("clamps ordinary actions at zero and restores only the amount actually removed", () => {
    const buff: Buff = { id: "break", name: "休整", source: "厌倦学习", timing: "monthly", remainingMonths: 2,
      monthlyActionLimitDelta: -1, actionLimitAtTotalMonths: 5 };
    const s = state();
    for (const limit of [0, 1, 2]) {
      const next = settleScheduledActionBuffs({ ...s, totalMonths: 5, buffs: [buff], actionState: { ...s.actionState, limit } });
      expect(next.actionState.limit).toBe(Math.max(0, limit - 1));
      expect(settleScheduledActionBuffs({ ...next, totalMonths: 6 }).actionState.limit).toBe(limit);
    }
  });

  it("retains and records the AI action during the reduced-action month", () => {
    const { after } = finish(0);
    const s = settleScheduledActionBuffs({ ...after, totalMonths: 5 });
    for (const slot of ["gpt", "deepseek", "doubao"] as const) {
      s.aiShopState.subscriptions[slot] = { ...s.aiShopState.subscriptions[slot], active: true,
        modelId: getAiModelForTotalMonths(s.totalMonths, slot).id };
    }
    expect(getActiveOperationAllowance(s, "rest").allowed).toBe(false);
    expect(getActiveOperationAllowance(s, "idea").usesAiResearchBonus).toBe(true);
    const used = consumeActiveOperation(s, "idea");
    expect(used.actionState.used).toBe(0);
    expect(used.actionState.aiResearchBonusUsed).toBe(true);
    expect(used.achievementProgress?.counters["research-actions:5"]).toBe(1);
    expect(getActiveOperationAllowance(used, "idea").allowed).toBe(false);
  });

  it("keeps the scheduled month and its applied penalty through serialization", () => {
    const { after } = finish(0);
    const next = settleScheduledActionBuffs({ ...after, totalMonths: 5 });
    const saved: GameState = JSON.parse(JSON.stringify(next));
    expect(settleScheduledActionBuffs(saved).actionState.limit).toBe(0);
    expect(settleScheduledActionBuffs({ ...saved, totalMonths: 6 }).actionState.limit).toBe(1);
  });

  it("requires three distinct completed episodes, never counts opening the preview twice", () => {
    let s = state();
    const run = createAchievementRunProgress();
    expect(createRandomEventById(19, s, () => 0.5).event?.title).toBe("厌倦学习");
    observeEventAchievements(s, s, run);
    expect(run.counters["study-fatigue"]).toBeUndefined();
    for (let n = 1; n <= 3; n++) {
      const next = { ...s, eventHistory: [...s.eventHistory, { id: `burnout:${n}`, chainId: "random-19", source: "random" as const,
        completedAtYear: n, completedAtMonth: 12, completedAtTotalMonths: n * 12,
        stages: [{ title: "厌倦学习", description: "", choices: [], selectedChoiceId: `random-19-travel-${n}` }] }] };
      observeEventAchievements(s, next, run);
      observeEventAchievements(s, next, run);
      expect(run.counters["study-fatigue"]).toBe(n);
      expect(run.satisfied.includes("global:study-fatigue")).toBe(n >= 3);
      s = next;
    }
  });
});

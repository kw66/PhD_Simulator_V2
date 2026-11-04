import { describe, expect, it } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createAchievementRunProgress } from "../src/core/v2-achievement-runtime-types";
import { observeAchievements, settleRunAchievements } from "../src/core/v2-achievement-runtime";
import { getNextIdeaUnlockBonus, recordRoleUnlockMonthEnd } from "../src/core/v2-achievement-role-unlocks";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { applyMonthStartSubscriptions } from "../src/core/v2-monthly-effects";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { tryAddRelationship } from "../src/core/v2-relationship-rules";
import { createTeachersDayEvent } from "../src/core/v2-fixed-events-teachers-day";
import { getCalendarForTotalMonths } from "../src/core/v2-progression";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { Buff, GameState, RoleId } from "../src/core/v2-types";

function started(role: RoleId): GameState {
  const state = createStartedGameState(role);
  return { ...state, totalMonths: 1, year: 1, month: 1, selectedAdvisorName: "导师", playerName: "学生",
    blockLinearEvents: true, eventQueue: [], availableRandomEvents: [], pendingRandomEvents: [],
    player: { ...state.player, san: 100, money: 100, favor: 12 }, sanCap: 100,
    advisorProgressState: { ...state.advisorProgressState, funding: 10000 },
    achievementProgress: createAchievementRunProgress() };
}
function atMonth(state: GameState, totalMonths: number): GameState {
  return { ...state, ...getCalendarForTotalMonths(totalMonths), totalMonths,
    actionState: { ...state.actionState, used: 0, aiResearchBonusUsed: false } };
}
function choose(state: GameState, choiceId?: string): GameState {
  const event = state.eventQueue[0]!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choiceId ?? event.choices[0]!.id });
}
function fullSocial(): GameState {
  const state = started("social");
  const fellow = createCustomFellowProgressProfile({ type: "junior", gender: "female", startTotalMonths: 1, research: 1, affinity: 1 });
  return { ...state, relationshipState: tryAddRelationship(state.relationshipState, "junior").nextState,
    fellowProgressState: [fellow] };
}
function recruitment(state: GameState): GameState {
  const rolls: number[] = [];
  const built = createRandomEventById(14, state, () => { rolls.push(0.5); return 0.5; });
  return { ...state, eventQueue: [createEventQueueItem({ ...built.event!, randomReplay: { eventId: 14, serial: state.totalRandomEventCount, rolls } }, 1)] };
}
function ideaBuff(id: string, bonus: number, timing: Buff["timing"] = "next-action", remainingMonths: number | null = null): Buff {
  return { id, name: id, source: "test", timing, remainingMonths, actionEffects: { idea: { bonus } } };
}

describe("r60 reversed-role unlocks", () => {
  it("retains six years of Teachers' Day greetings and settles after a non-graduation ending", () => {
    let state = started("teacher-child");
    for (let year = 1; year <= 6; year++) {
      state = atMonth(state, (year - 1) * 12 + 1);
      state = { ...state, eventQueue: [createEventQueueItem(createTeachersDayEvent(state, () => 0.5), 1)] };
      state = choose(state);
      state = choose(state, state.eventQueue[0]!.choices.find(choice => choice.label === "发祝福")!.id);
      expect(state.achievementProgress?.satisfied).not.toContain("unlock:teacher-child-reversed");
      state = choose(state);
      expect(state.achievementProgress?.satisfied.includes("unlock:teacher-child-reversed")).toBe(year === 6);
    }
    expect(state.totalMonths).toBe(61);
    expect(state.phase).toBe("playing");
    const settled = settleRunAchievements(createDefaultAccountProfile(), dispatchAction(state, "quit-game"));
    expect(settled.account.roleProgress["teacher-child-reversed"].unlocked).toBe(true);
  });

  it("totals successful paid AI subscriptions across slots, renewals and model changes", () => {
    let state = atMonth(started("genius"), 11);
    for (const aiSlotId of ["gpt", "claude"] as const) {
      state = dispatchAction(state, "buy-ai-month", { aiSlotId });
      state = dispatchAction(state, "toggle-ai-subscription", { aiSlotId });
    }
    expect(state.achievementProgress?.counters["unlock-paid-ai-spending"]).toBe(4);
    const beforeRenewal = state;
    state = applyMonthStartSubscriptions(atMonth(state, 12)).nextState;
    // The runtime observes the committed transition, including automatic renewals.
    state = observeAchievements(beforeRenewal, state);
    expect(state.achievementProgress?.counters["unlock-paid-ai-spending"]).toBe(8);
    const beforeUpdate = state;
    state = observeAchievements(beforeUpdate, applyMonthStartSubscriptions(atMonth(state, 13)).nextState);
    expect(state.aiShopState.subscriptions.gpt.active).toBe(false);
    expect(state.achievementProgress?.counters["unlock-paid-ai-spending"]).toBe(8);
    for (const aiSlotId of ["gpt", "claude"] as const) {
      state = dispatchAction(state, "buy-ai-month", { aiSlotId });
      state = dispatchAction(state, "toggle-ai-subscription", { aiSlotId });
    }
    expect(state.achievementProgress?.counters["unlock-paid-ai-spending"]).toBe(12);
    for (let month = 14; month <= 18; month++) {
      const before = state;
      state = observeAchievements(before, applyMonthStartSubscriptions(atMonth(state, month)).nextState);
    }
    expect(state.achievementProgress?.counters["unlock-paid-ai-spending"]).toBe(32);
    expect(state.achievementProgress?.satisfied).toContain("unlock:genius-reversed");
    expect(state.achievementProgress?.sets["unlock-paid-ai-months"]).toBeUndefined();
    const settled = settleRunAchievements(createDefaultAccountProfile(), dispatchAction(state, "quit-game"));
    expect(settled.account.roleProgress["genius-reversed"].unlocked).toBe(true);
  });

  it("counts reimbursed paid subscriptions at model price but excludes free, duplicate and failed purchases", () => {
    let state = started("genius");
    state = { ...state, player: { ...state.player, money: 0 },
      achievementProgress: { ...state.achievementProgress!, counters: { "unlock-paid-ai-spending": 28 } },
      eventSupport: { ...state.eventSupport, aiCostsCoveredUntilTotalMonths: 1 } };
    state = dispatchAction(state, "buy-ai-month", { aiSlotId: "doubao" });
    expect(state.achievementProgress?.counters["unlock-paid-ai-spending"]).toBe(28);
    state = dispatchAction(state, "buy-ai-month", { aiSlotId: "gpt" });
    expect(state.player.money).toBe(0);
    expect(state.achievementProgress?.counters["unlock-paid-ai-spending"]).toBe(30);
    expect(state.achievementProgress?.satisfied).toContain("unlock:genius-reversed");
    state = dispatchAction(state, "buy-ai-month", { aiSlotId: "gpt" });
    expect(state.achievementProgress?.counters["unlock-paid-ai-spending"]).toBe(30);
    const before = atMonth({ ...state, eventSupport: { ...state.eventSupport, aiCostsCoveredUntilTotalMonths: null } }, 2);
    const failed = dispatchAction(before, "buy-ai-month", { aiSlotId: "claude" });
    expect(failed.achievementProgress?.counters["unlock-paid-ai-spending"]).toBe(30);
    expect(observeAchievements(failed, failed).achievementProgress?.counters["unlock-paid-ai-spending"]).toBe(30);
  });

  it("unlocks from a committed capacity failure without the overflow talent, never from preview", () => {
    let state = recruitment(fullSocial());
    expect(state.roleTalents?.levels["overflow-social"] ?? 0).toBe(0);
    state = choose(state);
    const decision = getResolvableQueuedEvent(state, state.eventQueue[0]!);
    expect(state.achievementProgress?.satisfied).not.toContain("unlock:social-reversed");
    state = choose(state, decision.choices.find(choice => choice.id.includes("-idea-"))!.id);
    expect(state.achievementProgress?.satisfied).not.toContain("unlock:social-reversed");
    getResolvableQueuedEvent(state, state.eventQueue[0]!);
    expect(state.achievementProgress?.satisfied).not.toContain("unlock:social-reversed");
    state = choose(state);
    expect(state.fellowProgressState).toHaveLength(1);
    expect(state.achievementProgress?.satisfied).toContain("unlock:social-reversed");
  });

  it("does not count ordinary rejection, successful recruitment, or capacity freed before confirmation", () => {
    let rejected = choose(recruitment(fullSocial()));
    rejected = choose(rejected, rejected.eventQueue[0]!.choices.find(choice => choice.id.includes("-decline-"))!.id);
    rejected = choose(rejected);
    expect(rejected.achievementProgress?.satisfied).not.toContain("unlock:social-reversed");
    let success = choose(recruitment(started("social")));
    success = choose(success, success.eventQueue[0]!.choices.find(choice => choice.id.includes("-idea-"))!.id);
    success = choose(success);
    expect(success.fellowProgressState).toHaveLength(1);
    expect(success.achievementProgress?.satisfied).not.toContain("unlock:social-reversed");
    let reopened = choose(recruitment(fullSocial()));
    reopened = choose(reopened, reopened.eventQueue[0]!.choices.find(choice => choice.id.includes("-idea-"))!.id);
    reopened = dispatchAction(reopened, "end-relationship", { relationshipId: reopened.fellowProgressState[0]!.id });
    reopened = choose(reopened);
    expect(reopened.fellowProgressState).toHaveLength(1);
    expect(reopened.achievementProgress?.satisfied).not.toContain("unlock:social-reversed");
  });

  it.each([29, 30])("checks rich cash before a successful work action (cash=%s)", money => {
    const base = started("rich");
    const worked = dispatchAction({ ...base, player: { ...base.player, money } }, "part-time-work");
    expect(worked.partTimeWorkCount).toBe(1);
    expect(worked.achievementProgress?.satisfied.includes("unlock:rich-reversed")).toBe(money >= 30);
  });

  it("does not count failed work or monthly reserve sampling", () => {
    const base = started("rich");
    for (const state of [{ ...base, player: { ...base.player, san: 0 } },
      { ...base, actionState: { ...base.actionState, used: base.actionState.limit } }]) {
      const worked = dispatchAction(state, "part-time-work");
      expect(worked.partTimeWorkCount).toBe(0);
      expect(worked.achievementProgress?.satisfied).not.toContain("unlock:rich-reversed");
    }
    expect(recordRoleUnlockMonthEnd(base)).toBe(base);
    const passive = observeAchievements(base, { ...base, partTimeWorkCount: 1 }, "resolve-event");
    expect(passive.achievementProgress?.satisfied).not.toContain("unlock:rich-reversed");
  });

  it("sums only active next-idea bonus buffs and uses the exact 20-point threshold", () => {
    const base = started("chosen");
    const irrelevant = [ideaBuff("permanent", 100, "permanent"), ideaBuff("monthly", 100, "monthly", 1),
      ideaBuff("expired", 100, "next-action", 0),
      { ...ideaBuff("other", 0), actionEffects: { idea: { multiplier: 2, extraActions: 100 }, writing: { bonus: 100 } } }];
    let next = observeAchievements(base, { ...base, buffs: [...irrelevant, ideaBuff("first", 12), ideaBuff("second", 7.9)] });
    expect(getNextIdeaUnlockBonus(next)).toBe(19.9);
    expect(next.achievementProgress?.satisfied).not.toContain("unlock:chosen-reversed");
    next = observeAchievements(next, { ...next, buffs: [...irrelevant, ideaBuff("first", 12), ideaBuff("second", 8)] });
    expect(getNextIdeaUnlockBonus(next)).toBe(20);
    expect(next.achievementProgress?.satisfied).toContain("unlock:chosen-reversed");
    expect(next.degree).toBe("master");
  });

  it("does not unlock chosen from previewed event rewards before their final confirmation", () => {
    let state = started("chosen");
    state = { ...state, buffs: [ideaBuff("first", 12)], eventQueue: [createEventQueueItem({
      id: "bonus-choice", chainId: "bonus", stage: "act2", source: "fixed", title: "bonus", description: "",
      blocking: true, deadlineMonths: 0, choices: [{ id: "take", label: "take", outcome: "", effects: {
        addBuffs: [ideaBuff("second", 8)], enqueueEvents: [{ id: "bonus-result", chainId: "bonus", stage: "result", source: "fixed",
          title: "result", description: "", blocking: true, deadlineMonths: 0, choices: [{ id: "confirm", label: "confirm", outcome: "", effects: {} }] }] } }],
    }, 1)] };
    state = choose(state);
    expect(getNextIdeaUnlockBonus(state)).toBe(12);
    expect(state.achievementProgress?.satisfied).not.toContain("unlock:chosen-reversed");
    state = choose(state);
    expect(state.achievementProgress?.satisfied).toContain("unlock:chosen-reversed");
  });

  it("does not grant the new unlocks to a different source role or to historical r59 runs", () => {
    const normal = started("normal");
    expect(dispatchAction(normal, "part-time-work").achievementProgress?.satisfied).not.toContain("unlock:rich-reversed");
    expect(observeAchievements(normal, { ...normal, buffs: [ideaBuff("large", 20)] }).achievementProgress?.satisfied)
      .not.toContain("unlock:chosen-reversed");
    withGameplayRuleset("20261028-r59", () => {
      const rich = started("rich");
      expect(dispatchAction(rich, "part-time-work").achievementProgress?.satisfied).not.toContain("unlock:rich-reversed");
      const chosen = started("chosen");
      expect(observeAchievements(chosen, { ...chosen, buffs: [ideaBuff("large", 20)] }).achievementProgress?.satisfied)
        .not.toContain("unlock:chosen-reversed");
      let social = choose(recruitment(fullSocial()));
      social = choose(social, social.eventQueue[0]!.choices.find(choice => choice.id.includes("-idea-"))!.id);
      social = choose(social);
      expect(social.achievementProgress?.satisfied).not.toContain("unlock:social-reversed");
    });
  });
});

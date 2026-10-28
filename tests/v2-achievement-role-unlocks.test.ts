import { describe, expect, it } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createAchievementRunProgress } from "../src/core/v2-achievement-runtime-types";
import { observeAchievements, settleRunAchievements } from "../src/core/v2-achievement-runtime";
import { recordRoleUnlockMonthEnd } from "../src/core/v2-achievement-role-unlocks";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { createAiShopState } from "../src/core/v2-ai-shop";
import { applyMonthStartSubscriptions } from "../src/core/v2-monthly-effects";
import { createTeachersDayEvent } from "../src/core/v2-fixed-events-teachers-day";
import { createPhdDecisionEvent } from "../src/core/v2-phd-decision-event";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { getCalendarForTotalMonths } from "../src/core/v2-progression";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { GameState, RoleId } from "../src/core/v2-types";

function started(role: RoleId): GameState {
  const state = createStartedGameState(role);
  return { ...state, totalMonths: 1, year: 1, month: 1, selectedAdvisorName: "导师", playerName: "学生",
    blockLinearEvents: true, eventQueue: [], availableRandomEvents: [], pendingRandomEvents: [],
    player: { ...state.player, san: 100, money: 100, favor: 12 }, sanCap: 100,
    advisorProgressState: { ...state.advisorProgressState, funding: 10000 },
    achievementProgress: createAchievementRunProgress() };
}

function atMonth(state: GameState, month: number): GameState {
  return { ...state, ...getCalendarForTotalMonths(month), totalMonths: month, eventQueue: [],
    actionState: { ...state.actionState, used: 0, aiResearchBonusUsed: false } };
}

function choose(state: GameState, choiceId?: string): GameState {
  const event = state.eventQueue[0]!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choiceId ?? event.choices[0]!.id });
}

function greeting(state: GameState, year: number, gift = false): GameState {
  state = atMonth(state, (year - 1) * 12 + 1);
  state = { ...state, eventQueue: [createEventQueueItem(createTeachersDayEvent(state, () => 0.5), 1)] };
  state = choose(state);
  state = choose(state, state.eventQueue[0]!.choices.find(choice => gift ? choice.label === "送邮票" : choice.label === "发祝福")!.id);
  // Deciding alone has not committed the event's result yet.
  expect(state.achievementProgress?.satisfied).not.toContain("unlock:teacher-child-reversed");
  return choose(state);
}

function transfer(state: GameState, month = 33): GameState {
  state = { ...atMonth(state, month), totalResearchScore: 3 };
  state = { ...state, eventQueue: [createEventQueueItem(createPhdDecisionEvent(state), 1)] };
  state = choose(state);
  state = choose(state, "transfer-phd");
  expect(state.degree).toBe("master");
  return choose(state);
}

describe("r59 behavioral reversed-role unlocks", () => {
  it("counts six paid-model months across brands and reimbursement, then settles even without graduation", () => {
    let state = started("genius");
    for (let month = 1; month <= 6; month += 1) {
      state = { ...atMonth(state, month), aiShopState: createAiShopState(),
        eventSupport: { ...state.eventSupport, aiCostsCoveredUntilTotalMonths: month === 3 ? month : null } };
      const beforeMoney = state.player.money;
      state = dispatchAction(state, "buy-ai-month", { aiSlotId: month % 2 ? "gpt" : "gemini" });
      if (month === 3) expect(state.player.money).toBe(beforeMoney);
      expect(state.achievementProgress?.satisfied.includes("unlock:genius-reversed")).toBe(month === 6);
      const repeated = dispatchAction(state, "buy-ai-month", { aiSlotId: month % 2 ? "gpt" : "gemini" });
      expect(repeated.achievementProgress?.sets["unlock-paid-ai-months"]).toHaveLength(month);
      state = repeated;
    }
    const ended = dispatchAction(state, "quit-game");
    expect(ended.ending).toBe("quit");
    const settled = settleRunAchievements(createDefaultAccountProfile(), ended);
    expect(settled.account.roleProgress["genius-reversed"].unlocked).toBe(true);
  });

  it("does not count free AI, failed payments, or nonconsecutive paid months", () => {
    let free = started("genius");
    for (let month = 1; month <= 6; month += 1) {
      free = { ...atMonth(free, month), aiShopState: createAiShopState() };
      free = dispatchAction(free, "buy-ai-month", { aiSlotId: "doubao" });
    }
    expect(free.achievementProgress?.satisfied).not.toContain("unlock:genius-reversed");
    let state = started("genius");
    for (let month = 1; month <= 7; month += 1) {
      state = { ...atMonth(state, month), aiShopState: createAiShopState(), player: { ...state.player, money: month === 4 ? 0 : 10 } };
      state = dispatchAction(state, "buy-ai-month", { aiSlotId: "gpt" });
    }
    expect(state.achievementProgress?.sets["unlock-paid-ai-months"]).toEqual(["1", "2", "3", "5", "6", "7"]);
    expect(state.achievementProgress?.satisfied).not.toContain("unlock:genius-reversed");
  });

  it("counts automatic renewal and permits buying the updated model in the same month", () => {
    let state = atMonth(started("genius"), 8);
    state = dispatchAction(state, "buy-ai-month", { aiSlotId: "gpt" });
    state = dispatchAction(state, "toggle-ai-subscription", { aiSlotId: "gpt" });
    for (let month = 9; month <= 13; month += 1) {
      const before = atMonth(state, month);
      state = observeAchievements(before, applyMonthStartSubscriptions(before).nextState);
    }
    expect(state.aiShopState.subscriptions.gpt.active).toBe(false);
    expect(state.achievementProgress?.satisfied).not.toContain("unlock:genius-reversed");
    state = dispatchAction(state, "buy-ai-month", { aiSlotId: "gpt" });
    expect(state.achievementProgress?.satisfied).toContain("unlock:genius-reversed");
  });

  it("requires six actual Teachers' Day greetings and does not require an ending", () => {
    let state = started("teacher-child");
    for (let year = 1; year <= 6; year += 1) state = greeting(state, year);
    expect(state.phase).toBe("playing");
    expect(state.totalMonths).toBe(61);
    expect(state.achievementProgress?.satisfied).toContain("unlock:teacher-child-reversed");
    const settled = settleRunAchievements(createDefaultAccountProfile(), dispatchAction(state, "quit-game"));
    expect(settled.account.roleProgress["teacher-child-reversed"].unlocked).toBe(true);
  });

  it("a gifted Teachers' Day prevents the six-year no-gift achievement", () => {
    let state = started("teacher-child");
    for (let year = 1; year <= 6; year += 1) state = greeting(state, year, year === 3);
    expect(state.eventHistory.filter(record => record.chainId === "teachers-day")).toHaveLength(6);
    expect(state.achievementProgress?.satisfied).not.toContain("unlock:teacher-child-reversed");
  });

  it.each([0, 1, 2])("counts only actively removing a strictly stronger fellow (research=%s)", research => {
    let state = started("social");
    const fellow = createCustomFellowProgressProfile({ type: "peer", gender: "female", startTotalMonths: 1, research, affinity: 1 });
    state = { ...state, player: { ...state.player, research: 1 }, fellowProgressState: [fellow] };
    const natural = observeAchievements(state, { ...state, fellowProgressState: [] });
    expect(natural.achievementProgress?.satisfied).not.toContain("unlock:social-reversed");
    const removed = dispatchAction(state, "end-relationship", { relationshipId: fellow.id });
    expect(removed.fellowProgressState).toHaveLength(0);
    expect(removed.achievementProgress?.satisfied.includes("unlock:social-reversed")).toBe(research > 1);
  });

  it("requires six consecutive month-end reserves, not purchases, previews or repeated samples", () => {
    let state = started("rich");
    for (let month = 1; month <= 8; month += 1) {
      state = { ...atMonth(state, month), player: { ...state.player, money: month === 2 ? 49.9 : 50 } };
      state = recordRoleUnlockMonthEnd(state);
      const sampled = recordRoleUnlockMonthEnd(state);
      expect(sampled).toBe(state);
      expect(state.achievementProgress?.satisfied.includes("unlock:rich-reversed")).toBe(month === 8);
    }
    expect(state.achievementProgress?.counters["unlock-reserve-streak"]).toBe(6);
  });

  it("samples the outgoing month before next-month AI charges", () => {
    let state = atMonth(started("rich"), 3);
    state = dispatchAction(state, "buy-ai-month", { aiSlotId: "gpt" });
    state = dispatchAction(state, "toggle-ai-subscription", { aiSlotId: "gpt" });
    state = { ...state, player: { ...state.player, money: 50 } };
    state = dispatchAction(state, "next-month");
    expect(state.totalMonths).toBe(4);
    expect(state.player.money).toBeLessThan(50);
    expect(state.achievementProgress?.counters["unlock-reserve-streak"]).toBe(1);
  });

  it.each([30, 31])("allows research only after the first 30 months (active month %s)", month => {
    let state = atMonth(started("chosen"), month);
    state = dispatchAction(state, "create-paper", { paperSlotIndex: 0 });
    const paperId = state.papers[0]!.id;
    state = dispatchAction(state, "research-paper", { paperId, paperActionType: "idea" });
    expect(state.achievementProgress?.counters[`research-actions:${month}`]).toBe(1);
    state = transfer(state);
    expect(state.degree).toBe("phd");
    expect(state.achievementProgress?.satisfied.includes("unlock:chosen-reversed")).toBe(month === 31);
  });

  it("ignores failed research and does not require zero papers or zero research score", () => {
    let state = atMonth(started("chosen"), 30);
    state = dispatchAction(state, "create-paper", { paperSlotIndex: 0 });
    const paperId = state.papers[0]!.id;
    state = { ...state, player: { ...state.player, san: 0 } };
    state = dispatchAction(state, "research-paper", { paperId, paperActionType: "idea" });
    expect(state.achievementProgress?.counters["research-actions:30"] ?? 0).toBe(0);
    state = transfer({ ...state, player: { ...state.player, san: 20 } });
    expect(state.achievementProgress?.satisfied).toContain("unlock:chosen-reversed");
  });

  it("does not count early transfer or mere transition to a graduation ending", () => {
    const early = transfer(started("chosen"), 21);
    expect(early.degree).toBe("phd");
    expect(early.achievementProgress?.satisfied).not.toContain("unlock:chosen-reversed");
    const base = started("rich");
    const ended = observeAchievements(base, { ...base, phase: "finished", ending: "master" });
    expect(ended.achievementProgress?.satisfied).not.toContain("unlock:rich-reversed");
  });

  it("preserves r58 graduation rules without adding new behavior evidence", () => {
    withGameplayRuleset("20261027-r58", () => {
      const base = started("rich");
      expect(recordRoleUnlockMonthEnd(base)).toBe(base);
      const ended = observeAchievements(base, { ...base, phase: "finished", ending: "master" });
      expect(ended.achievementProgress?.satisfied).toContain("unlock:rich-reversed");
      expect(ended.achievementProgress?.counters["unlock-reserve-streak"]).toBeUndefined();
    });
  });
});

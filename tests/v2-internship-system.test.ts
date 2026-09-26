import { describe, expect, it } from "vitest";

import {
  activateInternship,
  activateRemoteInternship,
  advanceInternshipMonth,
  createInternshipState,
  getInternshipExperimentEffect,
  getInternshipMonthlyIncome,
  getInternshipMonthlyStats,
  getInternshipStatus,
  hasOngoingInternship,
  increaseInternshipExperimentMultiplier,
} from "../src/core/v2-internship-system";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { applyChoiceEffectsToState } from "../src/core/v2-engine-event-resolution-state";
import { buildInternshipInviteContext, createInternshipInviteAct1 } from "../src/core/v2-internship-events";
import { createAdvisorTalkRandomEvent } from "../src/core/v2-random-events-lab-advisor-talk";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import type { GameState, PendingEvent } from "../src/core/v2-types";

function playingState(): GameState {
  const initial = createInitialState();
  return { ...initial, phase: "playing", totalMonths: 11, month: 11, year: 1,
    player: { ...initial.player, favor: 6, san: 20, money: 20 }, eventQueue: [] };
}

function queueEvent(state: GameState, event: PendingEvent): GameState {
  return { ...state, eventQueue: [createEventQueueItem(event, 1)] };
}

function resolveFirst(state: GameState, choiceId?: string): GameState {
  const event = state.eventQueue[0]!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choiceId ?? event.choices[0]!.id });
}

describe("v2 internship system", () => {
  it("preserves the six-month conference internship", () => {
    const state = activateInternship();

    expect(state).toEqual({
      active: true,
      kind: "conference6",
      remainingMonths: 6,
      experimentMultiplier: 1.25,
      experimentBonus: 0,
      experimentMoneyDiscount: 0,
    });
  });

  it("grows active internship multiplier by 0.05 per enterprise follow-up", () => {
    const nextState = increaseInternshipExperimentMultiplier(activateInternship());

    expect(nextState.experimentMultiplier).toBe(1.3);
  });

  it("uses the audited monthly income formula", () => {
    expect(getInternshipMonthlyIncome(2, 1200)).toBe(3);
    expect(getInternshipMonthlyIncome(100, 10000)).toBe(6);
  });

  it("exposes pure scheduled, three effective months and expired remote benefits", () => {
    const state = { ...playingState(), internshipState: activateRemoteInternship(11) };
    const before = structuredClone(state);
    expect(getInternshipStatus(state)).toEqual({ kind: "remote3", pending: true, active: false, remainingMonths: 3 });
    expect(hasOngoingInternship(state)).toBe(true);
    for (const totalMonths of [11, 12, 13, 14, 15]) {
      const current = { ...state, totalMonths };
      const effective = totalMonths >= 12 && totalMonths <= 14;
      expect(getInternshipStatus(current).active).toBe(effective);
      expect(getInternshipExperimentEffect(current)).toEqual(effective
        ? { bonus: 4, multiplier: 1, moneyDiscount: 1 }
        : { bonus: 0, multiplier: 1, moneyDiscount: 0 });
      expect(getInternshipMonthlyStats(current)).toEqual(effective ? { san: -3, money: 1 } : { san: 0, money: 0 });
      expect(advanceInternshipMonth(current).active).toBe(totalMonths <= 14);
    }
    expect(advanceInternshipMonth({ ...state, totalMonths: 14 }).remainingMonths).toBe(1);
    expect(advanceInternshipMonth({ ...state, totalMonths: 15 })).toEqual(createInternshipState());
    expect(state).toEqual(before);
    expect(increaseInternshipExperimentMultiplier(state.internshipState)).toBe(state.internshipState);
  });

  it.each([false, true])("starts remote only on final confirmation with replay=%s", (replay) => {
    let state = playingState();
    const event = createAdvisorTalkRandomEvent(state, () => 0);
    if (replay) event.randomReplay = { eventId: 5, serial: state.totalRandomEventCount, rolls: Array(10).fill(0) };
    state = resolveFirst(queueEvent(state, event));
    const choice = state.eventQueue[0]!.choices.find((entry) => entry.label === "提出远程实习")!;
    state = resolveFirst(state, choice.id);
    expect(state.internshipState.active).toBe(false);
    expect(state.eventQueue[0]?.deferredStatePatch).toBeUndefined();
    const before = state.player;
    const result = state.eventQueue[0]!;
    state = resolveFirst(state);
    expect(state.internshipState).toEqual(activateRemoteInternship(11));
    expect(state.player).toEqual(before);
    const repeated = dispatchAction(state, "resolve-event", { eventId: result.id, eventChoiceId: result.choices[0]!.id });
    expect(repeated.internshipState).toEqual(state.internshipState);
  });

  it.each(["scheduled", "remote", "conference"] as const)("rejects stale approvals over %s internships", (kind) => {
    const initial = playingState();
    const ongoing = kind === "conference"
      ? { ...activateInternship(), remainingMonths: 2, experimentMultiplier: 1.4 }
      : activateRemoteInternship(kind === "scheduled" ? 11 : 10);
    for (const replay of [false, true]) {
      for (const source of ["advisor", "conference"]) {
        const event = source === "advisor"
          ? createAdvisorTalkRandomEvent(initial, () => 0)
          : createInternshipInviteAct1(buildInternshipInviteContext(initial));
        if (replay && source === "advisor") event.randomReplay = { eventId: 5, serial: 0, rolls: Array(10).fill(0) };
        let state = resolveFirst(queueEvent(initial, event));
        const choice = state.eventQueue[0]!.choices.find((entry) => source === "advisor" ? entry.label === "提出远程实习" : entry.id === "accept")!;
        state = resolveFirst(state, choice.id);
        state = resolveFirst({ ...state, internshipState: ongoing });
        expect(state.internshipState).toEqual(ongoing);
        expect(state.eventQueue[0]?.description).toContain("已有实习安排，本次不新增、不延期");
        state = resolveFirst(state);
        expect(state.log[0]?.text).toContain("原实习保持不变");
        expect(state.log[0]?.text).not.toMatch(/每月金币|未来3个月/);
        expect(state.internshipState).toEqual(ongoing);
        const talk = createAdvisorTalkRandomEvent(state, () => 0);
        expect(talk.choices[0]!.effects.enqueueEvents![0]!.choices[2]?.disabledReason).toBeDefined();
      }
    }
  });

  it("rebases a delayed approval to confirmation month and rechecks favor", () => {
    const initial = playingState();
    let state = resolveFirst(queueEvent(initial, createAdvisorTalkRandomEvent(initial, () => 0)));
    state = resolveFirst(state, state.eventQueue[0]!.choices[2]!.id);
    expect(resolveFirst({ ...state, totalMonths: 13, month: 1, year: 2 }).internshipState).toEqual(activateRemoteInternship(13));
    const denied = resolveFirst({ ...state, player: { ...state.player, favor: 5 } });
    expect(denied.internshipState.active).toBe(false);
    expect(denied.eventQueue[0]?.description).toContain("导师好感不足，本次未确认远程实习");
    expect(resolveFirst(denied).log[0]?.text).toContain("未确认远程实习");
  });

  it.each(["ongoing", "blocked"] as const)("keeps a denied %s internship in its own chain when another result has the same close choice", (reason) => {
    const initial = playingState();
    let state = resolveFirst(queueEvent(initial, createInternshipInviteAct1(buildInternshipInviteContext(initial))));
    state = resolveFirst(state, "accept");
    const approval = state.eventQueue[0]!;
    expect(approval.choices[0]?.id).toBe("close");
    const unrelated = createEventQueueItem({
      id: "unrelated-result",
      title: "其他事件",
      description: "其他事件的结果。",
      source: "fixed",
      blocking: true,
      deadlineMonths: 0,
      chainId: "unrelated",
      stage: "result",
      completionLog: "其他事件已完成。",
      choices: [{ id: "close", label: "继续", outcome: "其他事件已完成。", effects: {} }],
    }, 1);
    state = {
      ...state,
      eventQueue: [unrelated, { ...approval, queueOrder: 2 }],
      internshipState: reason === "ongoing" ? activateRemoteInternship(state.totalMonths) : state.internshipState,
      conferenceCareerState: { ...state.conferenceCareerState, permanentlyBlockedInternship: reason === "blocked" },
    };
    const expectedOutcome = reason === "ongoing"
      ? "已有实习安排，本次不新增、不延期，原实习保持不变。"
      : "企业实习机会已关闭，本次未开始实习。";
    const denied = dispatchAction(state, "resolve-event", { eventId: approval.id, eventChoiceId: "close" });
    const failure = denied.eventQueue.find((event) => event.id === `${approval.id}-unavailable`)!;
    expect(failure).toMatchObject({ chainId: approval.chainId, completionLog: expectedOutcome });
    expect(denied.eventQueue.find((event) => event.id === unrelated.id)).toEqual(unrelated);
    expect(denied.internshipState).toEqual(state.internshipState);
    expect(denied.eventHistory).toEqual(state.eventHistory);
    expect(denied.log).toEqual(state.log);

    const completed = dispatchAction(denied, "resolve-event", { eventId: failure.id, eventChoiceId: failure.choices[0]!.id });
    expect(completed.eventQueue).toEqual([unrelated]);
    expect(completed.internshipState).toEqual(state.internshipState);
    expect(completed.log[0]?.text).toContain(expectedOutcome);
    expect(completed.log[0]?.text).not.toContain("你接受了");
    const history = completed.eventHistory.at(-1)!;
    expect(history.chainId).toBe(approval.chainId);
    expect(completed.eventHistory).toHaveLength(state.eventHistory.length + 1);
    const resultStages = history.stages.slice(approval.history!.length);
    expect(resultStages).toHaveLength(2);
    for (const stage of resultStages) {
      expect(stage.description).toContain(expectedOutcome);
      expect(stage.title).not.toContain("实习已确认");
      expect(stage.choices.find((choice) => choice.id === stage.selectedChoiceId)?.outcome).toBe(expectedOutcome);
    }
    const repeated = dispatchAction(completed, "resolve-event", { eventId: approval.id, eventChoiceId: "close" });
    expect(repeated.eventHistory).toEqual(completed.eventHistory);
    expect(repeated.internshipState).toEqual(completed.internshipState);
    const unrelatedCompleted = resolveFirst(completed);
    expect(unrelatedCompleted.eventHistory.at(-1)?.chainId).toBe(unrelated.chainId);
    expect(unrelatedCompleted.log[0]?.text).toContain("其他事件已完成。");
  });

  it("blocks a fresh approval at a year boundary without extending the existing placement", () => {
    const initial = playingState();
    const ongoing = activateRemoteInternship(11);
    const state = { ...initial, totalMonths: 13, month: 1, year: 2, internshipState: ongoing };
    const event = createAdvisorTalkRandomEvent(state, () => 0);
    const decisionState = resolveFirst(queueEvent(state, event));
    const choice = decisionState.eventQueue[0]!.choices.find((entry) => entry.label === "提出远程实习")!;
    expect(choice.disabledReason).toBeDefined();
    const unchanged = resolveFirst(decisionState, choice.id);
    expect(unchanged.internshipState).toEqual(ongoing);
    expect(unchanged.eventQueue[0]?.stage).toBe("act2");
    const accepted = applyChoiceEffectsToState(state, { id: "stale", label: "实习", outcome: "", effects: {
      internshipStateUpdates: activateRemoteInternship(13),
    } }).nextState;
    expect(accepted.internshipState).toEqual(ongoing);
  });

  it("preserves conference acceptance and blocks stale closed enterprise offers", () => {
    const initial = playingState();
    const event = createInternshipInviteAct1(buildInternshipInviteContext(initial));
    let state = resolveFirst(queueEvent(initial, event));
    expect(state.eventQueue[0]!.choices.find((choice) => choice.id === "accept")?.outcome).toContain("6 个月");
    state = resolveFirst(state, "accept");
    expect(state.internshipState.active).toBe(false);
    expect(resolveFirst(state).internshipState).toEqual(activateInternship());
    const blocked = { ...state, conferenceCareerState: { ...state.conferenceCareerState, permanentlyBlockedInternship: true } };
    const denied = resolveFirst(blocked);
    expect(denied.internshipState.active).toBe(false);
    expect(denied.eventQueue[0]?.description).toContain("企业实习机会已关闭");
    expect(resolveFirst(denied).log[0]?.text).toContain("本次未开始实习");
  });

  it("does not restore an expired placement from stale networking effects", () => {
    const initial = playingState();
    const choice = { id: "enterprise", label: "企业交流", outcome: "", effects: {
      triggerInternshipInvite: true,
      internshipStateUpdates: increaseInternshipExperimentMultiplier(activateInternship()),
    } };
    const resolved = applyChoiceEffectsToState(initial, choice).nextState;
    expect(resolved.internshipState).toEqual(initial.internshipState);
    const current = { ...initial, internshipState: { ...activateInternship(), remainingMonths: 2, experimentMultiplier: 1.4 } };
    expect(applyChoiceEffectsToState(current, choice).nextState.internshipState).toEqual({ ...current.internshipState, experimentMultiplier: 1.45 });
  });
});

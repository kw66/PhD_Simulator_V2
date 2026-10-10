import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceFellowResearch, ensureFellowPapers } from "../src/core/v2-fellow-research";
import { applyMonthlyEffects, previewNextMonthEffects, resolveMonthlyEffects } from "../src/core/v2-monthly-effects";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { getPaperScoreBreakdown } from "../src/core/v2-paper-collaboration";
import { renderApp } from "../src/app/v2-render";
import type { GameState } from "../src/core/v2-types";

function makeState(): GameState {
  const base = createStartedGameState("normal");
  return {
    ...base, year: 1, month: 6, totalMonths: 6, eventQueue: [], buffs: [],
    player: { ...base.player, san: 15, research: 2, social: 0 },
    papers: [{ ...createDraftPaper(1, 1, () => 0), idea: 10, experiment: 10, writing: 10 }],
    fellowProgressState: [], fellowPapers: [],
    relationshipState: { ...base.relationshipState, juniorCount: 0, peerCount: 0, seniorCount: 0, occupiedSlots: 0 },
  };
}

function withMentoring(state = makeState()): GameState {
  return ensureFellowPapers({
    ...state,
    relationshipState: { ...state.relationshipState, juniorCount: 1, occupiedSlots: 1 },
    fellowProgressState: [createCustomFellowProgressProfile({
      type: "junior", gender: "female", name: "林青", startTotalMonths: state.totalMonths,
      research: 4, affinity: 6, longTermMentoring: true,
    })],
  }, () => 0);
}

function nextMonth(state: GameState): GameState {
  return { ...state, totalMonths: state.totalMonths + 1, month: state.month % 12 + 1 };
}

describe.each([10, 11, 14])("long-term cooperation event %s", (eventId) => {
  it("commits mentoring without social rewards only on act-three confirmation, once", () => {
    const base = makeState();
    const intro = createRandomEventById(eventId, base, () => 0).event!;
    const decision = intro.choices[0]!.effects.enqueueEvents![0]!;
    const queued = createEventQueueItem(decision, base.totalMonths);
    const chosen = dispatchAction({ ...base, eventQueue: [queued] }, "resolve-event", {
      eventId: queued.id, eventChoiceId: queued.choices.find((choice) => choice.label === "长期合作")!.id,
    });
    expect(chosen.fellowProgressState).toHaveLength(0);
    expect(chosen.player.social).toBe(0);
    const result = chosen.eventQueue[0]!;
    const payload = { eventId: result.id, eventChoiceId: result.choices[0]!.id };
    const committed = dispatchAction(chosen, "resolve-event", payload);
    expect(committed.fellowProgressState).toHaveLength(1);
    expect(committed.fellowProgressState[0]).toMatchObject({ type: eventId === 10 ? "peer" : eventId === 11 ? "senior" : "junior", longTermMentoring: true });
    expect(committed.player.research).toBe(base.player.research);
    expect(committed.externalPublications).toEqual(base.externalPublications);
    expect(committed.fellowPapers).toHaveLength(1);
    const next = advanceFellowResearch(applyMonthlyEffects(nextMonth(committed)).nextState, () => 0);
    expect(next.fellowProgressState[0]!.taskProgress).toBe(2);
    expect(previewNextMonthEffects(committed).items.find((item) => item.id.startsWith("fellow-mentoring-"))?.name).toBe("长期合作");
    expect(committed.player.social).toBe(0);
    expect(committed.player.san).toBe(base.player.san);
    expect(committed.buffs).toEqual([]);
    expect(dispatchAction(committed, "resolve-event", payload).fellowProgressState).toEqual(committed.fellowProgressState);
  });

  it("does not create a mentoring cost when the fellow slots are full", () => {
    const base = makeState();
    base.relationshipState = { ...base.relationshipState, occupiedSlots: 4, juniorCount: 4, unlockedSlots: 4 };
    const intro = createRandomEventById(eventId, base, () => 0).event!;
    const decision = intro.choices[0]!.effects.enqueueEvents![0]!;
    const longTerm = decision.choices.find((choice) => choice.label === "长期合作")!;
    const result = longTerm.effects.enqueueEvents![0]!;
    expect(result.choices[0]!.effects.fellowAdditions).toBeUndefined();
    expect(result.choices[0]!.effects.addBuffs).toBeUndefined();
    expect(longTerm.outcome).toBe("条件：人际栏已满｜结果：无事发生。");
    expect(longTerm.outcome).not.toMatch(/同学槽位|永久写作|SAN|≥|</u);
    const resolved = dispatchAction({ ...base, eventQueue: [createEventQueueItem(result, 6)] }, "resolve-event", {
      eventId: result.id, eventChoiceId: result.choices[0]!.id,
    });
    expect(resolved.player).toEqual(base.player);
    expect(resolved.buffs).toEqual(base.buffs);
    expect(resolved.fellowProgressState).toEqual(base.fellowProgressState);
    const html = renderApp({ ...base, eventQueue: [createEventQueueItem(result, 6)] }, undefined, { isEventContentOpen: true, activeEventId: result.id });
    expect(html).toContain("人际栏已满");
    expect(html).toContain("无事发生");
    expect(html).not.toContain("永久写作 +4");
  });

  it.each([0, 6])("settles dinner once without adding a fellow at social %s", (social) => {
    const base = makeState();
    base.player = { ...base.player, social, money: 10 };
    base.relationshipState = { ...base.relationshipState, occupiedSlots: 4, juniorCount: 4, unlockedSlots: 5 };
    const intro = createRandomEventById(14, base, () => 0).event!;
    const decision = intro.choices[0]!.effects.enqueueEvents![0]!;
    const dinner = decision.choices.find((choice) => choice.label === "请客吃饭")!;
    expect(dinner.outcome).toContain(social === 0 ? "社交 +1" : "社交 +0.8");
    const chosen = dispatchAction({ ...base, eventQueue: [createEventQueueItem(decision, 6)] }, "resolve-event", {
      eventId: decision.id, eventChoiceId: dinner.id,
    });
    expect(chosen.player).toEqual(base.player);
    const result = chosen.eventQueue[0]!;
    const payload = { eventId: result.id, eventChoiceId: result.choices[0]!.id };
    const settled = dispatchAction(chosen, "resolve-event", payload);
    expect(settled.player.money).toBe(8);
    expect(settled.player.social).toBe(social === 0 ? 1 : social + 0.8);
    expect(settled.fellowProgressState).toEqual(base.fellowProgressState);
    expect(settled.buffs).toEqual(base.buffs);
    expect(dispatchAction(settled, "resolve-event", payload).player).toEqual(settled.player);
  });

  it("replays the long-term choice into a short-term choice without leaving a monthly cost", () => {
    const chainId = `random-${eventId}`;
    let state = dispatchAction(makeState(), "debug-trigger-event", { eventId: chainId });
    state = dispatchAction(state, "debug-toggle-event-replay", { debugEventReplayEnabled: true });
    const resolve = (current: GameState, choiceIndex: number) => {
      const event = current.eventQueue.find((entry) => entry.chainId === chainId)!;
      return dispatchAction(current, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[choiceIndex]!.id });
    };
    state = resolve(state, 0);
    const choices = state.eventQueue.find((event) => event.chainId === chainId)!.choices;
    const shortChoiceId = choices[2]!.id;
    state = resolve(state, choices.findIndex((choice) => choice.label === "长期合作"));
    const result = state.eventQueue.find((event) => event.chainId === chainId)!;
    state = dispatchAction(state, "debug-replay-event", { eventId: result.id, eventHistoryIndex: 1, eventChoiceId: shortChoiceId });
    state = resolve(state, 0);
    expect(state.fellowProgressState).toHaveLength(1);
    expect(state.fellowProgressState[0]!.longTermMentoring).toBe(false);
    expect(previewNextMonthEffects(state).items.some((item) => item.id.startsWith("fellow-mentoring-"))).toBe(false);
  });

  it("previews the first payment for next month and advances twice without double settlement", () => {
    const state = withMentoring();
    expect(resolveMonthlyEffects(state).items.some((item) => item.id.startsWith("fellow-mentoring-"))).toBe(false);
    expect(advanceFellowResearch(state, () => 0).fellowProgressState[0]!.taskProgress).toBe(0);
    const preview = previewNextMonthEffects(state);
    expect(preview.items.find((item) => item.id.startsWith("fellow-mentoring-"))?.stats).toEqual({ san: -1 });
    const monthly = applyMonthlyEffects(nextMonth(state));
    expect(monthly.resolution.totals).toEqual(preview.totals);
    const advanced = advanceFellowResearch(monthly.nextState, () => 0);
    expect(advanced.fellowProgressState[0]!.taskProgress).toBe(12);
    expect(advanced.fellowProgressState[0]!.monthlyActivity).toContain("协作进度 +12（长期合作，推进2次）");
    expect(advanceFellowResearch(advanced, () => 0)).toBe(advanced);
  });

  it("combines both advances, carries overflow, and grants help on a full bar", () => {
    const state = withMentoring();
    state.fellowProgressState[0]!.taskProgress = 95;
    const advanced = advanceFellowResearch(nextMonth(state), () => 0);
    expect(advanced.fellowProgressState[0]!.taskProgress).toBe(7);
    expect(getPaperScoreBreakdown(advanced.papers[0]!, "experiment").collaboration).toBe(4);
    expect(advanced.fellowProgressState[0]!.helpedPlayerCount).toBe(1);
    expect(advanced.fellowProgressState[0]!.helpedFellowCount).toBe(1);
  });

  it("keeps mentoring bound to the fellow and stops it only when cooperation ends", () => {
    const state = withMentoring();
    const relationshipId = state.fellowProgressState[0]!.id;
    const removed = dispatchAction(state, "end-relationship", { relationshipId });
    expect(removed.fellowProgressState).toHaveLength(0);
    expect(previewNextMonthEffects(removed).items.some((item) => item.id.startsWith("fellow-mentoring-"))).toBe(false);
  });

  it("charges per mentored fellow and never grants a scheduled paper", () => {
    const state = withMentoring();
    state.fellowProgressState.push({ ...state.fellowProgressState[0]!, id: "second-junior", name: "陈明" });
    const next = { ...state, totalMonths: 18 };
    const settled = applyMonthlyEffects(next);
    expect(settled.resolution.items.filter((item) => item.id.startsWith("fellow-mentoring-"))).toHaveLength(2);
    expect(settled.nextState.externalPublications).toHaveLength(0);
  });

  it("shows the permanent mentoring mark and actual monthly advance in the card tooltip", () => {
    const state = withMentoring();
    const html = renderApp(state, undefined, { activePlayTab: "relationship" });
    expect(html).toContain("长期合作");
    expect(html).toContain("rel-mentoring-mark");
    expect(html).not.toContain('data-action="stop-fellow-mentoring"');
    expect(html).toContain("每月自动推进+12");
  });
});

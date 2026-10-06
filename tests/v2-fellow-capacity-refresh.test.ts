import { describe, expect, it } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { enqueueEventQueueItem } from "../src/core/v2-event-queue";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import { renderApp } from "../src/app/v2-render";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import type { GameState } from "../src/core/v2-types";

function fullState(eventId: number): GameState {
  const base = createStartedGameState("normal");
  const profiles = ["林青", "陈明", "赵晴", "周宁"].map((name, index) => createCustomFellowProgressProfile({
    type: "peer", gender: "female", name, startTotalMonths: index + 1, research: 4, affinity: 1,
  }));
  const state: GameState = { ...base, year: 1, month: 6, totalMonths: 6, eventQueue: [], buffs: [],
    player: { ...base.player, san: 20, research: 6, social: 18 },
    relationshipState: { ...base.relationshipState, unlockedSlots: 5, occupiedSlots: 4, peerCount: 4 },
    fellowProgressState: profiles,
  };
  const rolls: number[] = [];
  const root = createRandomEventById(eventId, state, () => { rolls.push(0.9); return 0.9; }).event!;
  return enqueueEventQueueItem(state, { ...root, randomReplay: { eventId, serial: state.totalRandomEventCount, rolls } });
}

function resolve(state: GameState, choiceIndex: number): GameState {
  const event = state.eventQueue[0]!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[choiceIndex]!.id });
}

describe.each([10, 11, 14])("fellow capacity hint and refresh for event %s", (eventId) => {
  it.each([2, 3])("confirms full-capacity choice %s without costs or rewards", (choiceIndex) => {
    const decision = resolve(fullState(eventId), 0);
    const pending = resolve(decision, choiceIndex);
    const result = pending.eventQueue[0]!;
    expect(result.title).toContain(eventId === 14 && choiceIndex === 2 ? "暂缓指导" : "暂缓合作");
    expect(result.description.split("机制结算")[1]?.trim()).toBe("条件：人际栏已满｜结果：无事发生。");
    expect(result.description).not.toMatch(/忙了几天|核对完这一轮|嗓子发干|过了一遍/u);
    const html = renderApp(pending, undefined, { isEventContentOpen: true, activeEventId: result.id });
    const conditions = /class="event-settlement-row is-condition">([\s\S]*?)<\/div>/u.exec(html)?.[1];
    const results = /class="event-settlement-row is-result">([\s\S]*?)<\/div>/u.exec(html)?.[1];
    expect(conditions).toContain("人际栏已满");
    expect(results).toContain("无事发生");
    expect(results).not.toMatch(/人际栏|SAN|金币|写作/u);
    const confirmed = resolve(pending, 0);
    expect(confirmed.player).toEqual(pending.player);
    expect(confirmed.fellowProgressState).toEqual(pending.fellowProgressState);
    expect(confirmed.buffs).toEqual(pending.buffs);
    expect(confirmed.relationshipState).toEqual(pending.relationshipState);
  });

  it.each([2, 3])("removes stale rewards if capacity fills before confirming choice %s", (choiceIndex) => {
    const full = fullState(eventId);
    const open = { ...full, relationshipState: { ...full.relationshipState, occupiedSlots: 3, peerCount: 3 },
      fellowProgressState: full.fellowProgressState.slice(1) };
    const pending = resolve(resolve(open, 0), choiceIndex);
    expect(pending.eventQueue[0]!.description).not.toContain("人际栏已满");
    const filled = { ...pending, relationshipState: full.relationshipState, fellowProgressState: full.fellowProgressState };
    const refreshed = getResolvableQueuedEvent(filled, filled.eventQueue[0]!);
    expect(refreshed.description).toContain("条件：人际栏已满｜结果：无事发生。");
    const confirmed = resolve(filled, 0);
    expect(confirmed.player).toEqual(pending.player);
    expect(confirmed.fellowProgressState).toEqual(full.fellowProgressState);
    expect(confirmed.buffs).toEqual(pending.buffs);
  });

  it.each([2, 3])("updates pending result %s after making room and charges only once", (choiceIndex) => {
    const initial = fullState(eventId);
    const decision = resolve(initial, 0);
    expect(decision.eventQueue[0]!.description).toContain("小提示：可先关闭事件");
    const pending = resolve(decision, choiceIndex);
    expect(pending.player.san).toBe(initial.player.san);
    expect(pending.fellowProgressState).toHaveLength(4);
    expect(pending.eventQueue[0]!.description).toContain("去人际栏停止合作腾出位置");
    const pendingHtml = renderApp(pending, undefined, { isEventContentOpen: true, activeEventId: pending.eventQueue[0]!.id });
    expect(pendingHtml).toContain('class="event-description-note"');
    expect(pendingHtml).toContain("结果会按当前空位更新");
    const removedId = initial.fellowProgressState[0]!.id;
    const freed = dispatchAction(pending, "end-relationship", { relationshipId: removedId });
    const result = freed.eventQueue[0]!;
    expect(freed.fellowProgressState).toHaveLength(3);
    expect(freed.player.san).toBe(initial.player.san);
    expect(result.description).not.toContain("人际栏已满");
    expect(result.description).not.toContain("去人际栏停止合作腾出位置");
    const role = eventId === 10 ? "同门" : eventId === 11 ? "师姐" : "师妹";
    expect(result.description).toContain(`${role} +1`);
    const confirmed = resolve(freed, 0);
    expect(confirmed.fellowProgressState).toHaveLength(4);
    expect(confirmed.fellowProgressState.some((profile) => profile.id === removedId)).toBe(false);
    expect(confirmed.fellowProgressState.at(-1)!.longTermMentoring).toBe(choiceIndex === 3);
    expect(confirmed.player.san).toBe(choiceIndex === 2 ? 16 : 20);
    const duplicate = dispatchAction(confirmed, "resolve-event", { eventId: result.id, eventChoiceId: result.choices[0]!.id });
    expect(duplicate.fellowProgressState).toEqual(confirmed.fellowProgressState);
    expect(duplicate.player.san).toBe(confirmed.player.san);
  });

  it("updates the decision before choosing after a fellow is removed", () => {
    const decision = resolve(fullState(eventId), 0);
    const freed = dispatchAction(decision, "end-relationship", { relationshipId: decision.fellowProgressState[0]!.id });
    expect(freed.eventQueue[0]!.description).not.toContain("人际栏已满");
    expect(freed.eventQueue[0]!.description).not.toContain("可先关闭事件");
    expect(freed.eventQueue[0]!.choices[3]!.effects.fellowAdditions).toHaveLength(1);
  });

  it("does not add the capacity hint to unrelated choices", () => {
    const decision = resolve(fullState(eventId), 0);
    for (const choiceIndex of [0, 1]) {
      const result = resolve(decision, choiceIndex).eventQueue[0]!;
      expect(result.description).not.toContain("去人际栏停止合作腾出位置");
    }
  });
});

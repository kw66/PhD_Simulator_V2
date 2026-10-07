import { describe, expect, it } from "vitest";
import { renderEventLayoutSamples } from "../src/app/v2-render-play";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { collectRandomEventsForMonth } from "../src/core/v2-event-scheduler";
import { createRandomEventById, getRandomEventAppearanceCondition, isRandomEventEligible } from "../src/core/v2-random-event-router";
import { activatePendingRandomEvents } from "../src/core/v2-paper-competition-waiting";
import { createMentorAssignEvent } from "../src/core/v2-fixed-events-mentor-assign";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import type { GameState, Paper } from "../src/core/v2-types";

describe("event candidate eligibility and presentation", () => {
  it.each([0, 0.9])("uses the junior's gender for both mentoring rewards at roll %s", (roll) => {
    const initial = createInitialState();
    const label = roll < 0.5 ? "师弟" : "师妹";
    for (const full of [false, true]) {
      const state = { ...initial, relationshipState: { ...initial.relationshipState, occupiedSlots: full ? 4 : 0, unlockedSlots: 5 } };
      const root = createRandomEventById(14, state, () => roll).event!;
      const decision = root.choices[0]!.effects.enqueueEvents![0]!;
      for (const choice of decision.choices.slice(2)) {
        expect(choice.outcome).not.toMatch(/师弟师妹人数|新增师弟师妹/u);
        if (full) {
          expect(choice.outcome).toBe("条件：人际栏已满｜结果：无事发生。");
          expect(choice.effects.san).toBeUndefined();
          expect(choice.outcome).not.toContain(`${label} +1`);
          expect(choice.effects.fellowAdditions).toBeUndefined();
        } else {
          expect(choice.outcome).toContain(`${label} +1`);
          expect(choice.effects.fellowAdditions?.[0]?.gender).toBe(roll < 0.5 ? "male" : "female");
          expect(choice.effects.enqueueEvents![0]!.description).toContain(`${label} +1`);
        }
      }
    }
  });

  it("shows the actual appearance condition in the first scene of every deferred random event", () => {
    const base = { ...createInitialState(), phase: "playing" as const };
    const scoredDraft = { ...createDraftPaper(1, 1), idea: 1 };
    const cases: Array<[number, GameState]> = [
      [8, { ...base, advisorProgressState: { ...base.advisorProgressState, funding: 21 } }],
      [10, { ...base, player: { ...base.player, social: 6 } }],
      [11, { ...base, player: { ...base.player, research: 6 } }],
      [12, { ...base, papers: [scoredDraft] }],
      [14, { ...base, papers: [{ ...scoredDraft, status: "published" as const }] }],
      [16, { ...base, papers: [scoredDraft] }],
      [17, { ...base, papers: [scoredDraft] }],
      [18, { ...base, papers: [{ ...scoredDraft, experiment: 1 }] }],
    ];

    for (const [eventId, state] of cases) {
      const condition = getRandomEventAppearanceCondition(eventId);
      const event = createRandomEventById(eventId, state, () => 0.25).event;
      expect(condition).not.toBeNull();
      expect(event?.stage).toBe("act1");
      expect(event?.description).toContain(`备注：出现条件：${condition}`);
    }
  });

  it.each([10, 11])("defers relationship event %s until its own attribute reaches six", (eventId) => {
    const attribute = eventId === 10 ? "social" : "research";
    const other = eventId === 10 ? "research" : "social";
    const base = createInitialState();
    const state = { ...base, phase: "playing" as const, year: 2, month: 5, totalMonths: 17,
      player: { ...base.player, [attribute]: 5, [other]: 20 },
      availableRandomEvents: [eventId], usedRandomEvents: [], pendingRandomEvents: [],
    };
    expect(isRandomEventEligible(state, eventId)).toBe(false);
    const drawn = collectRandomEventsForMonth(state, () => 0.7);
    expect(drawn.events).toHaveLength(0);
    expect(drawn.nextState.pendingRandomEvents).toEqual([{ eventId, serial: 1 }]);
    expect(activatePendingRandomEvents(drawn.nextState, () => 0).eventQueue).toHaveLength(0);
    const ready = { ...drawn.nextState, player: { ...state.player, [attribute]: 6, [other]: 0 } };
    expect(isRandomEventEligible(ready, eventId)).toBe(true);
    const revealed = activatePendingRandomEvents(ready, () => 0);
    expect(revealed.pendingRandomEvents).toEqual([]);
    expect(revealed.eventQueue).toHaveLength(1);
    expect(revealed.eventQueue[0]!.description).toContain(eventId === 10 ? "社交能力 ≥ 6" : "科研能力 ≥ 6");
    expect(activatePendingRandomEvents(revealed, () => 0).eventQueue).toHaveLength(1);
  });

  it.each([
    ["no paper", [], false],
    ["empty draft", [createDraftPaper(1, 1)], false],
    ["scored draft", [{ ...createDraftPaper(1, 1), idea: 1 }], true],
    ["experiment only", [{ ...createDraftPaper(1, 1), experiment: 1 }], true],
    ["writing only", [{ ...createDraftPaper(1, 1), writing: 1 }], true],
    ["conference review", [{ ...createDraftPaper(1, 1), idea: 10, status: "reviewing" }], false],
    ["journal revision", [{ ...createDraftPaper(1, 1), idea: 10, status: "journal-reviewing" }], false],
    ["published", [{ ...createDraftPaper(1, 1), idea: 10, status: "published" }], false],
  ] as [string, Paper[], boolean][])("gates authorship disputes: %s", (_, papers, eligible) => {
    const state = {
      ...createInitialState(), phase: "playing" as const, papers,
      availableRandomEvents: [12], usedRandomEvents: [16],
    };
    const result = collectRandomEventsForMonth(state, () => 0.7);
    expect(result.events.some((event) => event.chainId === "random-12")).toBe(eligible);
    expect(result.nextState.usedRandomEvents.includes(12)).toBe(eligible);
    if (!eligible) {
      expect(result.nextState.availableRandomEvents).not.toContain(12);
      expect(result.nextState.pendingRandomEvents).toEqual([{ eventId: 12, serial: 1 }]);
      expect(result.nextState.usedRandomEvents).not.toContain(12);
    }
  });

  it("reveals a drawn conditional event when its prerequisite later appears", () => {
    const initial = {
      ...createInitialState(),
      phase: "playing" as const,
      availableRandomEvents: [12],
      usedRandomEvents: [],
      papers: [],
    };
    const hidden = collectRandomEventsForMonth(initial, () => 0.7);
    expect(hidden.events).toHaveLength(0);
    expect(hidden.nextState.pendingRandomEvents).toEqual([{ eventId: 12, serial: 1 }]);
    expect(hidden.nextState.usedRandomEvents).not.toContain(12);

    const eligible = {
      ...hidden.nextState,
      papers: [{ ...createDraftPaper(1, 1), idea: 1 }],
    };
    const revealed = dispatchAction(eligible, "select-paper", { paperId: eligible.papers[0]!.id });
    expect(revealed.eventQueue.some((event) => event.chainId === "random-12")).toBe(true);
    expect(revealed.usedRandomEvents).toContain(12);
    expect(revealed.pendingRandomEvents).toEqual([]);
  });

  it("keeps candidate descriptions in act two and reveals selected attributes in act three", () => {
    const base = { ...createInitialState(), phase: "playing" as const, year: 3, month: 1, totalMonths: 25 };
    const intro = createMentorAssignEvent(base);
    const decision = intro.choices[0]!.effects.enqueueEvents![0]!;
    const candidates = decision.choices.map((choice) => choice.effects.fellowAdditions![0]!);
    expect(candidates.every((candidate) => candidate.academicYear === 1 && candidate.research >= 2 && candidate.research <= 5)).toBe(true);
    expect(new Set(decision.choices.map((choice) => choice.label)).size).toBe(4);
    const descriptions = ["从头学起", "尝试复现", "基础实验", "独立复现实验"];
    for (const choice of decision.choices) {
      const candidate = choice.effects.fellowAdditions![0]!;
      expect(decision.description).toContain(`**${choice.label}**`);
      expect(decision.description).toContain(descriptions[candidate.research - 2]);
      expect(choice.effects.fellowAdditions?.[0]).toMatchObject({ research: candidate.research, affinity: candidate.affinity });
      expect(choice.outcome).toMatch(/^师[弟妹] \+1$/);
      const result = choice.effects.enqueueEvents![0]!;
      expect(result.description.split("机制结算\n")[1]).toContain(choice.outcome);
      expect(result.description).toContain(`科研能力 ${candidate.research}/20，默契度 ${candidate.affinity}/20`);
    }
    const queued = createEventQueueItem(decision, 1);
    const preview = renderEventLayoutSamples(queued, null)[0]!.html;
    expect(preview).not.toContain("event-candidate-card");
    expect(preview).not.toContain("科研能力");
    expect(preview).not.toContain("默契度");
    expect(preview.match(/class="event-choice-btn event-action-btn"/g)).toHaveLength(4);
    let state = dispatchAction({ ...base, eventQueue: [queued] }, "resolve-event", {
      eventId: queued.id, eventChoiceId: queued.choices[2]!.id,
    });
    const result = state.eventQueue[0]!;
    expect(state.fellowProgressState).toHaveLength(0);
    expect(renderEventLayoutSamples(result, null).at(-1)!.html).toContain(`科研能力 ${candidates[2]!.research}/20`);
    state = dispatchAction(state, "resolve-event", { eventId: result.id, eventChoiceId: result.choices[0]!.id });
    const record = state.eventHistory.find((entry) => entry.chainId === "mentor-assign")!;
    expect(record.stages[0]!.choices[2]!.label).toBe(decision.choices[2]!.label);
    const history = renderEventLayoutSamples(null, record)[0]!.html;
    expect(history).not.toContain("event-candidate-card");
    expect(history).toContain("is-selected");
    expect(history).not.toContain('data-action="resolve-event"');
    expect(state.fellowProgressState[0]).toMatchObject({ research: candidates[2]!.research, affinity: candidates[2]!.affinity });
  });
});

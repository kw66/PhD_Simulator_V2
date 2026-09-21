import { describe, expect, it } from "vitest";
import { renderEventLayoutSamples } from "../src/app/v2-render-play";
import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { collectRandomEventsForMonth } from "../src/core/v2-event-scheduler";
import { createMentorAssignEvent } from "../src/core/v2-fixed-events-mentor-assign";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import type { Paper } from "../src/core/v2-types";

describe("event candidate eligibility and presentation", () => {
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
    if (!eligible) expect(result.nextState.availableRandomEvents).toContain(12);
  });

  it("keeps candidate attributes and cards through selection and history replay", () => {
    const base = { ...createInitialState(), phase: "playing" as const, year: 3, month: 1, totalMonths: 25 };
    const intro = createMentorAssignEvent(base);
    const decision = intro.choices[0]!.effects.enqueueEvents![0]!;
    const candidates = decision.choices.map((choice) => choice.fellowCandidate!);
    expect(candidates.map((candidate) => candidate.research).sort()).toEqual([0, 1, 2, 3]);
    expect(new Set(decision.choices.map((choice) => choice.label)).size).toBe(4);
    const descriptions = ["从头学起", "尝试复现", "基础实验", "独立复现实验"];
    for (const choice of decision.choices) {
      const candidate = choice.fellowCandidate!;
      expect(candidate.description).toContain(descriptions[candidate.research]);
      expect(choice.effects.fellowAdditions?.[0]).toMatchObject({ research: candidate.research, affinity: candidate.affinity });
      expect(choice.outcome).toMatch(/^师[弟妹]\+1$/);
      const result = choice.effects.enqueueEvents![0]!;
      expect(result.description.split("机制结算\n")[1]).toBe(choice.outcome);
    }
    const queued = createEventQueueItem(decision, 1);
    const preview = renderEventLayoutSamples(queued, null)[0]!.html;
    expect(preview.match(/event-candidate-card/g)).toHaveLength(4);
    expect(preview).toContain("科研能力");
    expect(preview).toContain("默契度");
    let state = dispatchAction({ ...base, eventQueue: [queued] }, "resolve-event", {
      eventId: queued.id, eventChoiceId: queued.choices[2]!.id,
    });
    const result = state.eventQueue[0]!;
    state = dispatchAction(state, "resolve-event", { eventId: result.id, eventChoiceId: result.choices[0]!.id });
    const record = state.eventHistory.find((entry) => entry.chainId === "mentor-assign")!;
    expect(record.stages[0]!.choices[2]!.fellowCandidate).toEqual(candidates[2]);
    const history = renderEventLayoutSamples(null, record)[0]!.html;
    expect(history.match(/event-candidate-card/g)).toHaveLength(4);
    expect(history).toContain("is-selected");
    expect(history).not.toContain('data-action="resolve-event"');
    expect(state.fellowProgressState[0]).toMatchObject({ research: candidates[2]!.research, affinity: candidates[2]!.affinity });
  });
});

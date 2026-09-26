import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import type { PendingEvent } from "../src/core/v2-types";

function makeState(research: number, favor: number) {
  const state = createStartedGameState("normal");
  return { ...state, totalMonths: 6, month: 6, year: 1, selectedAdvisorName: "林老师",
    player: { ...state.player, research, favor, social: favor, san: 20, money: 20 },
    papers: [{ ...createDraftPaper(6, 0, () => 0), idea: 10, experiment: 10, writing: 10 }],
  };
}

function collectCopy(event: PendingEvent): string[] {
  return [event.description, ...event.choices.flatMap((choice) => [choice.outcome,
    ...(choice.effects.enqueueEvents ?? []).flatMap(collectCopy)])];
}

describe("event narrative hints", () => {
  it.each([2, 8])("keeps hidden thresholds and random odds out of event copy at attribute %i", (level) => {
    for (const eventId of [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]) {
      const event = createRandomEventById(eventId, makeState(level, level), () => 0.25).event;
      expect(event, `event ${eventId}`).not.toBeNull();
      expect(collectCopy(event!).join("\n"), `event ${eventId}`).not.toMatch(
        /透明概率|胜率\s*\d|（\d+(?:\.\d+)?%）|(?:科研|社交|导师好感)\s*[<>≥≤]/u,
      );
    }
  });

  it("varies the advisor talk's two paragraphs independently with research and familiarity", () => {
    const decisions = [
      [2, 2], [8, 2], [2, 8], [8, 8],
    ].map(([research, favor]) => {
      const event = createRandomEventById(5, makeState(research!, favor!), () => 0.25).event!;
      return event.choices[0]!.effects.enqueueEvents![0]!;
    });
    const paragraphs = decisions.map((event) => event.description.split(/\n\s*\n/u));
    paragraphs.forEach((parts) => expect(parts).toHaveLength(2));
    expect(paragraphs[0]![0]).not.toBe(paragraphs[1]![0]);
    expect(paragraphs[0]![1]).toBe(paragraphs[1]![1]);
    expect(paragraphs[0]![0]).toBe(paragraphs[2]![0]);
    expect(paragraphs[0]![1]).not.toBe(paragraphs[2]![1]);
    expect(paragraphs[3]).toEqual([paragraphs[1]![0], paragraphs[2]![1]]);
    expect(decisions[0]!.choices[0]!.effects.favor).toBe(-1);
    expect(decisions[1]!.choices[0]!.effects.temporaryActionEffectUpdates?.idea?.bonus).toBeGreaterThan(0);
    expect(decisions[0]!.choices[1]!.effects.favor).toBe(-1);
    expect(decisions[2]!.choices[1]!.effects.research).toBe(1);
  });
});

import { describe, expect, it } from "vitest";
import { generatePaperTopic, getPaperHeatTier, PAPER_TOPIC_CATALOG } from "../src/core/v2-paper-topics";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDraftPaper, rerollPaperTopic } from "../src/core/v2-paper-rules";

describe("annual research direction heat", () => {
  it("binds heat to direction and year across random titles, inheritance, and rerolls", () => {
    for (let year = 2023; year <= 2029; year++) {
      const active = PAPER_TOPIC_CATALOG.filter(topic => topic.tiers[year - 2023] !== null);
      active.forEach((topic, index) => {
        const selected = generatePaperTopic(year, () => (index + .5) / active.length);
        for (const roll of [0, .2, .7, .999]) {
          const inherited = generatePaperTopic(year, () => roll, { topicId: topic.id });
          expect(inherited.heatMultiplier).toBe(selected.heatMultiplier);
          expect(inherited.prepublicationDecayRate).toBe(selected.prepublicationDecayRate);
        }
      });
    }
    const state = createStartedGameState("normal");
    const paper = createDraftPaper(1, 0, () => 0, 2023);
    const rerolled = rerollPaperTopic({ ...state, year: 1, month: 1, papers: [paper] }, paper.id, () => 0);
    expect(rerolled.papers[0]!.heatMultiplier).toBe(paper.heatMultiplier);
  });

  it("uses the current year's heat rather than copying a fellow's original heat", () => {
    const original = generatePaperTopic(2023, () => 0, { topicId: "image-classification" });
    const next = generatePaperTopic(2028, () => .9, original);
    expect(next.topicId).toBe(original.topicId);
    expect(getPaperHeatTier(original.heatMultiplier)).toBe("steady");
    expect(getPaperHeatTier(next.heatMultiplier)).toBe("cold");
    expect(next.prepublicationDecayRate).toBeCloseTo(next.heatMultiplier * .1);
  });

  it("excludes inactive directions and clamps unsupported calendar years", () => {
    expect(generatePaperTopic(2023, () => 0, { topicId: "agentic-science" }).topicId).not.toBe("agentic-science");
    expect(generatePaperTopic(2026, () => 0, { topicId: "agentic-science" }).topicId).toBe("agentic-science");
    expect(generatePaperTopic(1900, () => 0)).toEqual(generatePaperTopic(2023, () => 0));
    expect(generatePaperTopic(2100, () => 0)).toEqual(generatePaperTopic(2029, () => 0));
    expect(generatePaperTopic(NaN, () => 0)).toEqual(generatePaperTopic(2023, () => 0));
  });

  it("preserves r22 heat-first selection, inherited heat rolls, explicit overrides and random draw count", () => {
    withGameplayRuleset("20261022-r22", () => {
      let draws = 0;
      const random = () => { draws++; return 0; };
      expect(generatePaperTopic(2023, random)).toMatchObject({ topicId: "video-generation", heatMultiplier: .5 });
      expect(draws).toBe(5);
      expect(generatePaperTopic(2023, () => .999, { topicId: "image-classification" }).heatMultiplier).toBe(1.5);
      expect(generatePaperTopic(2023, () => 0, { topicId: "image-classification", heatMultiplier: 1.2 }).heatMultiplier).toBe(1.2);
    });
  });
});

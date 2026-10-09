import { describe, expect, it } from "vitest";
import { createConferenceDecisionAct1 } from "../src/core/v2-conference-events";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";

function createDecision(favor: number) {
  const state = createStartedGameState("normal");
  const root = createConferenceDecisionAct1({
    id: "conference-result-format",
    conferenceName: "CVPR",
    conferenceYear: 2031,
    city: "测试城",
    country: "测试国",
    region: "asia",
    grade: "A",
    paperCount: 1,
    paperIds: ["paper-result-format"],
  }, { ...state, favor, social: 8, research: 8 }, () => 0.5);
  return root.choices[0]!.effects.enqueueEvents![0]!;
}

describe("conference result resistance suffix", () => {
  it.each([
    [8, -1.5, "导师好感 -1.5（抵抗0.5）"],
    [12, -1.25, "导师好感 -1.25（抵抗0.75）"],
    [0, -2, "导师好感 -2"],
  ] as const)("shows the settled advisor cost at favor %s in previews and results", (favor, cost, text) => {
    const choice = createDecision(favor).choices.find((candidate) => candidate.id === "advisor")!;
    const result = choice.effects.enqueueEvents![0]!;
    expect(choice.outcome).toBe(`${text}，科研经费 -4。`);
    expect(result.description).toContain(`结果：${text}，科研经费 -4`);
    expect(result.completionLog).toContain(`${text}，科研经费 -4`);
    expect(result.choices[0]!.effects.favor).toBe(cost);
    expect(result.choices[0]!.effects.advisorProgressStateDeltas).toEqual({ funding: -4 });
  });

  it("keeps money and free proxy settlement free of resistance suffixes", () => {
    const decision = createDecision(18);
    for (const [mode, text] of [["self", "金币 -4"], ["proxy", "无额外费用"]]) {
      const choice = decision.choices.find((candidate) => candidate.id === mode)!;
      const result = choice.effects.enqueueEvents![0]!;
      expect(choice.outcome).toBe(`${text}。`);
      expect(result.description).toContain(`结果：${text}`);
      expect(result.description).not.toContain("抵抗");
      expect(result.completionLog).not.toContain("抵抗");
    }
  });
});

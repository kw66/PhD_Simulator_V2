import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { createDraftPaper, rerollPaperTopic } from "../src/core/v2-paper-rules";
import { getPreferredPaperTopicId } from "../src/core/v2-player-paper-topic";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import { withGameRandom } from "../src/core/v2-game-random";
import type { Degree, Paper } from "../src/core/v2-types";

function paper(id: string, topicId: string, score = 0, status: Paper["status"] = "draft"): Paper {
  return { ...createDraftPaper(1, 0, () => 0, 2023, { topicId }), id, idea: score, status };
}
const a = "image-classification";
const b = "object-detection";
const preferred = (papers: Paper[], externalPublications: Paper[] = [], degree: Degree = "phd") =>
  getPreferredPaperTopicId({ papers, externalPublications, degree });

describe("player paper direction continuity", () => {
  it("starts randomly, then follows the first card when all scores are zero", () => {
    expect(preferred([])).toBeUndefined();
    expect(preferred([paper("first", a), paper("second", b)])).toBe(a);
  });

  it("ranks published support by score rather than count and ignores higher-scoring drafts", () => {
    expect(preferred([paper("draft", a, 9000)], [paper("a1", a, 10, "published"),
      paper("b1", b, 60, "published"), paper("a2", a, 10, "published")])).toBe(b);
  });

  it("uses only each direction's strongest two or three papers according to the current degree", () => {
    const papers = [paper("a1", a, 40, "published"), paper("a2", a, 40, "published"),
      paper("a3", a, 40, "published"), paper("b1", b, 50, "published"), paper("b2", b, 50, "published")];
    expect(preferred([], papers, "master")).toBe(b);
    expect(preferred([], papers, "phd")).toBe(a);
    expect(preferred([], [...papers, paper("a4", a, 40, "published")], "master")).toBe(b);
  });

  it("uses accepted scores, excludes duplicate IDs and coauthored work, and evaluates journal revisions", () => {
    const duplicate = paper("a1", a, 20, "published");
    const papers = [duplicate, { ...paper("b1", b, 1, "published"), submittedIdea: 30 },
      { ...paper("a2", a, 1000, "published"), nonFirstAuthor: true },
      { ...paper("a3", a, 1000, "published"), leadAuthorId: "fellow-1" }];
    expect(preferred([duplicate], papers)).toBe(b);
    papers[1] = { ...papers[1]!, journalTarget: "nature", submittedIdea: 300 };
    expect(preferred([duplicate], papers)).toBe(a);
  });

  it("compares top current card scores without publications and preserves creation order on ties", () => {
    expect(preferred([paper("a1", a, 8), paper("b1", b, 15), paper("a2", a, 8)])).toBe(a);
    expect(preferred([paper("a1", a, 8), paper("b1", b, 16), paper("a2", a, 8)])).toBe(a);
    expect(preferred([paper("a1", a, 8), paper("b1", b, 17)])).toBe(b);
    expect(preferred([paper("a1", a, 8)], [{ ...paper("grant", b, 999, "published"), topicId: "collaboration" }])).toBe(a);
  });

  it.each(["master", "phd"] as const)("returns to random exploration only when support guarantees A for %s", degree => {
    const count = degree === "master" ? 2 : 3;
    const score = degree === "master" ? 100 : 167;
    const papers = Array.from({ length: count }, (_, index) => paper(`a${index}`, a, score, "published"));
    expect(preferred([], papers, degree)).toBeUndefined();
    expect(preferred([], papers.slice(0, -1), degree)).toBe(a);
    const uneven = papers.map((p, index) => ({ ...p, idea: index === 0 ? score * count : 0 }));
    expect(preferred([], uneven, degree)).toBe(a);
    expect(preferred([], papers.map(p => ({ ...p, idea: score - 1 })), degree)).toBe(a);
  });

  it("inherits direction and annual heat, generates a matching title, and permits random rerolls", () => {
    const state = createStartedGameState("normal");
    const first = paper("first", a);
    Object.assign(state, { month: 1, totalMonths: 1, papers: [{ ...first, paperSlotIndex: 0 }], eventQueue: [], randomState: { seed: 123, cursor: 0 } });
    state.player.research = 6;
    const next = dispatchAction(state, "create-paper", { paperSlotIndex: 1 });
    const created = next.papers[1]!;
    expect(created.topicId).toBe(a);
    expect(created.topicLabel).toBe("图像分类");
    expect(created.title).toMatch(/Classification|Recognition/);
    expect(created.heatMultiplier).toBe(first.heatMultiplier);
    expect(created.prepublicationDecayRate).toBeCloseTo(created.heatMultiplier * .1);
    const rerolled = rerollPaperTopic(next, created.id, () => 0.999);
    expect(rerolled.papers[1]!.topicId).toBe("self-supervised");
    const progressed = { ...next, papers: next.papers.map(p => p.id === created.id ? { ...p, idea: 1 } : p) };
    expect(rerollPaperTopic(progressed, created.id, () => 0)).toBe(progressed);
  });

  it("preserves the previous random creation behavior and cursor in r15 replays", () => {
    const state = createStartedGameState("normal");
    Object.assign(state, { month: 1, totalMonths: 1, papers: [{ ...paper("first", a), paperSlotIndex: 0 }], eventQueue: [], randomState: { seed: 123, cursor: 0 } });
    state.player.research = 6;
    const old = withGameplayRuleset("20261022-r15", () => dispatchAction(state, "create-paper", { paperSlotIndex: 1 }));
    const expected = withGameplayRuleset("20261022-r15", () => withGameRandom(state, () => ({ ...state, papers: [...state.papers, createDraftPaper(state.totalMonths, 0)] })));
    expect(old.papers[1]).toEqual({ ...expected.papers[1], paperSlotIndex: 1 });
    expect(old.randomState).toEqual(expected.randomState);
    expect(old.papers[1]!.topicId).not.toBe(a);
  });
});

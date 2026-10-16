import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDraftPaper, prepareConferenceSubmission } from "../src/core/v2-paper-rules";
import { capturePaperDiagnostics, captureResearchContext } from "../src/core/v2-paper-diagnostics";
import { collectRunStatistics } from "../src/core/v2-run-statistics";
import { applyResearchOperation } from "../src/core/v2-research-operation";
import { validStatisticsContext } from "../src/app/v2-statistics-context";

function state() {
  const base = createStartedGameState("normal");
  return { ...base, conferenceLocationSeed: 123, eventQueue: [], totalMonths: 3,
    player: { ...base.player, san: 20, research: 12 },
    papers: [{ ...createDraftPaper(1, 0, () => 0), idea: 15, experiment: 10, writing: 5,
      collaborationScores: { idea: 10, experiment: 5, writing: 3 } }] };
}

describe("paper audit evidence", () => {
  it("captures the submitted own/collaboration split even when later totals change", () => {
    const before = state();
    const paper = prepareConferenceSubmission(before.papers[0]!, "A", 3, 1);
    const submitted = collectRunStatistics(before, { ...before, papers: [paper] });
    const context = capturePaperDiagnostics({ ...submitted, totalMonths: 6, player: { ...before.player, research: 2 } },
      { ...submitted.papers[0]!, idea: 99, collaborationScores: { idea: 90 } }, true);
    expect(context.scores).toEqual({ idea: { own: 5, collaboration: 10, total: 15 },
      experiment: { own: 5, collaboration: 5, total: 10 }, writing: { own: 2, collaboration: 3, total: 5 } });
    expect(context.submission?.attributes.research).toBe(12);
    expect(context.submission?.totalMonths).toBe(3);
    expect(validStatisticsContext(context, 30)).toBe(true);
    expect(validStatisticsContext(context, 31)).toBe(false);
  });

  it("retains consumed reading bonuses at operation time without keeping personal text", () => {
    const before = state();
    before.buffs = [{ id: "read-paper-idea-3-80", name: "private", source: "private", timing: "next-action", remainingMonths: null,
      actionEffects: { idea: { bonus: 360 } } }];
    const after = applyResearchOperation(before, before.papers[0]!.id, "idea", () => 0.5);
    expect(after.buffs).toHaveLength(0);
    const paper = after.papers[0]!;
    expect(paper.researchDiagnostics?.lastOperations?.idea).toMatchObject({ previousOwn: 5, nextOwn: 375, bonus: 360, executions: 1 });
    before.buffs[0]!.actionEffects!.idea!.bonus = 0;
    const context = capturePaperDiagnostics(after, paper);
    expect(context.lastOperations.idea?.context.buffs[0]?.actionEffects?.idea?.bonus).toBe(360);
    expect(JSON.stringify(context)).not.toContain("private");
    expect(validStatisticsContext(context, paper.idea + paper.experiment + paper.writing)).toBe(true);
  });

  it("compresses repeated buff sources while preserving count and exact effects", () => {
    const before = state();
    before.buffs = Array.from({ length: 80 }, (_, i) => ({ id: `read-${i}`, name: "", source: "", timing: "next-action" as const,
      remainingMonths: null, actionEffects: { idea: { bonus: 1 + Math.floor(i / 10) } } }));
    const context = captureResearchContext(before);
    expect(context.buffs).toHaveLength(8);
    expect(context.buffs.reduce((n, row) => n + row.count * row.actionEffects!.idea!.bonus!, 0)).toBe(360);
  });

  it("keeps publication evidence branch local and immutable after later changes", () => {
    const before = state();
    const paper = { ...before.papers[0]!, status: "published" as const, journalTarget: "pami" as const,
      submittedYear: 1, submittedMonth: 2, acceptedTotalMonths: 3 };
    const after = collectRunStatistics(before, { ...before, externalPublications: [paper] });
    const payload = after.pendingRunStatistics![0]!.payload;
    expect(payload).toMatchObject({ p_score: 30, p_context: { roleId: "normal", scores: { idea: { collaboration: 10 } } } });
    before.player.research = 99;
    expect(payload.p_context).toMatchObject({ attributes: { research: 12 } });
    expect(collectRunStatistics(before, before).pendingRunStatistics).toBeUndefined();
    expect(validStatisticsContext(payload.p_context, payload.p_score)).toBe(true);
  });

  it("rejects malformed diagnostics and keeps old queue rows valid", () => {
    const context = capturePaperDiagnostics(state(), state().papers[0]!);
    expect(validStatisticsContext(undefined, 30)).toBe(true);
    expect(validStatisticsContext({ ...context, runKey: '[123,"genius"]' }, 30)).toBe(false);
    expect(validStatisticsContext({ ...context, extra: "a".repeat(65_536) }, 30)).toBe(false);
    expect(validStatisticsContext({ ...context, scores: { ...context.scores, idea: { total: 15, own: 15, collaboration: 10 } } }, 30)).toBe(false);
  });
});

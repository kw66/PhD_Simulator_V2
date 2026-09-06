import { describe, expect, it } from "vitest";

import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { renderApp } from "../src/app/v2-render";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { applyPrepublicationPaperDecay, createDraftPaper, discardDraftPaper, withdrawPaper } from "../src/core/v2-paper-rules";
import { applyResearchOperation } from "../src/core/v2-research-operation";
import {
  getJournalScore,
  getJournalRevisionScore,
  JOURNAL_DEFINITIONS,
  resolveReadyJournalPapers,
  submitJournalPaper,
} from "../src/core/v2-journal-system";
import { settlePublishedPaperCitations } from "../src/core/v2-publication-system";

function playingState() {
  const started = dispatchAction(createInitialState(), "start-game", { roleId: "normal" });
  return {
    ...started,
    year: 1,
    month: 1,
    totalMonths: 1,
    eventQueue: [],
    player: { ...started.player, san: 20, research: 20 },
  };
}

describe("v2 journal system", () => {
  it("uses the geometric journal score and the configured thresholds", () => {
    expect(getJournalScore({ idea: 0, experiment: 80, writing: 80 })).toBe(0);
    expect(getJournalScore({ idea: 40, experiment: 40, writing: 40 })).toBe(120);
    expect(JOURNAL_DEFINITIONS.nature).toMatchObject({ submissionScore: 150, acceptanceScore: 500 });
    expect(JOURNAL_DEFINITIONS.nmi).toMatchObject({ submissionScore: 100, acceptanceScore: 250 });
    expect(JOURNAL_DEFINITIONS.pami).toMatchObject({ submissionScore: 75, acceptanceScore: 125 });
  });

  it("submits a paper into journal revision without a review deadline", () => {
    const state = playingState();
    const paper = { ...createDraftPaper(1, 0), idea: 40, experiment: 40, writing: 40 };
    const submitted = submitJournalPaper({ ...state, papers: [paper], selectedPaperId: paper.id }, paper.id, "nmi");

    expect(submitted.papers[0]).toMatchObject({
      status: "journal-reviewing",
      journalTarget: "nmi",
      reviewMonthsLeft: 0,
      submittedIdea: 40,
      submittedExperiment: 40,
      submittedWriting: 40,
    });
    expect(submitted.log[0]?.text).toContain("送审子刊NMI");
  });

  it("renders journal entries with both thresholds and enables eligible submissions", () => {
    const state = playingState();
    const paper = { ...createDraftPaper(1, 0), idea: 40, experiment: 40, writing: 40 };
    const html = renderApp({ ...state, papers: [paper], selectedPaperId: paper.id }, createDefaultAccountProfile());
    expect(html).toContain("送审分150");
    expect(html).toContain("达标分500");
    expect(html).toContain('data-action="submit-journal-paper"');
    expect(html).toContain('data-journal-target="nmi"');
  });

  it("keeps journal revision scores from decaying and stacks later work", () => {
    const state = playingState();
    const paper = { ...createDraftPaper(1, 0), idea: 40, experiment: 40, writing: 40 };
    const submitted = submitJournalPaper({ ...state, papers: [paper], selectedPaperId: paper.id }, paper.id, "nmi");
    const decayed = applyPrepublicationPaperDecay(submitted);
    expect(decayed.papers[0]).toMatchObject({ idea: 40, experiment: 40, writing: 40 });

    const researched = applyResearchOperation(decayed, paper.id, "idea", () => 0);
    expect(researched.papers[0]?.idea).toBeGreaterThan(40);
    expect(getJournalRevisionScore({
      idea: researched.papers[0]?.idea ?? 40,
      experiment: 45,
      writing: 42,
      submittedIdea: 40,
      submittedExperiment: 40,
      submittedWriting: 40,
    })).toBe(getJournalScore(paper) + (researched.papers[0]?.idea ?? 40) - 40 + 5 + 2);
  });

  it("automatically archives a journal paper when it reaches the acceptance score", () => {
    const state = playingState();
    const paper = { ...createDraftPaper(1, 0), heatMultiplier: 1, idea: 42, experiment: 42, writing: 42 };
    const submitted = dispatchAction({ ...state, papers: [paper], selectedPaperId: paper.id }, "submit-journal-paper", {
      paperId: paper.id,
      journalTarget: "pami",
    });

    expect(submitted.papers).toHaveLength(0);
    expect(submitted.totalResearchScore).toBe(state.totalResearchScore + 5);
    expect(submitted.externalPublications[0]).toMatchObject({ status: "published", journalTarget: "pami" });
    expect(submitted.externalPublications[0]?.conferenceHandled).toBe(true);
    expect(submitted.externalPublications[0]?.publication).toMatchObject({
      journalTarget: "pami",
      influence: 0.5,
      citationDebuffMultiplier: 1,
      effectiveScore: 126,
    });
    const html = renderApp(submitted, createDefaultAccountProfile());
    expect(html).not.toMatch(/data-promotion-id=.*arxiv/);
    expect(html).toMatch(/data-promotion-id=.*github/);
    expect(html).toMatch(/data-promotion-id=.*xiaohongshu/);
  });

  it("treats post-submission journal work as additive revision score", () => {
    const state = playingState();
    const paper = { ...createDraftPaper(1, 0), idea: 40, experiment: 40, writing: 40 };
    const submitted = submitJournalPaper({ ...state, papers: [paper], selectedPaperId: paper.id }, paper.id, "nmi");
    const revised = {
      ...submitted,
      papers: submitted.papers.map((entry) => ({ ...entry, experiment: 170 })),
    };
    const resolved = resolveReadyJournalPapers(revised).state;

    expect(resolved.papers).toHaveLength(0);
    expect(resolved.externalPublications[0]?.publication?.effectiveScore).toBe(250);
  });

  it("settles journal citations monthly with the configured 0.05 base rate", () => {
    const state = playingState();
    const paper = { ...createDraftPaper(1, 0), heatMultiplier: 1, idea: 42, experiment: 42, writing: 42 };
    const submitted = submitJournalPaper({ ...state, papers: [paper], selectedPaperId: paper.id }, paper.id, "pami");
    const firstMonth = settlePublishedPaperCitations(submitted).state;
    expect(firstMonth.externalPublications[0]?.publication).toMatchObject({
      effectiveScore: 126,
      citations: 3,
      monthsSincePublish: 1,
    });
    let settled = firstMonth;
    for (let month = 0; month < 4; month += 1) {
      settled = settlePublishedPaperCitations(settled).state;
    }
    expect(settled.externalPublications[0]?.publication?.influence).toBe(0.5);
    expect(settled.externalPublications[0]?.publication?.monthsSincePublish).toBe(5);
    expect(settled.externalPublications[0]?.publication?.citations).toBeGreaterThan(0);
  });

  it("withdraws journal revision and restores the submission-time scores", () => {
    const state = playingState();
    const paper = { ...createDraftPaper(1, 0), idea: 40, experiment: 40, writing: 40 };
    const submitted = submitJournalPaper({ ...state, papers: [paper], selectedPaperId: paper.id }, paper.id, "nmi");
    const modified = {
      ...submitted,
      papers: submitted.papers.map((entry) => entry.id === paper.id
        ? { ...entry, idea: 51, experiment: 47, writing: 44 }
        : entry),
    };
    const withdrawn = withdrawPaper(modified, paper.id);
    expect(withdrawn.papers).toHaveLength(1);
    expect(withdrawn.papers[0]).toMatchObject({
      status: "draft",
      journalTarget: null,
      idea: 40,
      experiment: 40,
      writing: 40,
      submittedIdea: null,
      submittedExperiment: null,
      submittedWriting: null,
    });
    expect(withdrawn.log[0]?.text).toContain("从子刊NMI撤回");
    expect(withdrawn.log[0]?.text).toContain("恢复投稿时分数 120");

    const discarded = discardDraftPaper(submitted, paper.id);
    expect(discarded.papers).toHaveLength(1);
    expect(discarded.log[0]?.text).toContain("正在期刊修改中，请使用撤稿");
  });

  it("shows journal revision progress in the header and uses a withdrawal action", () => {
    const state = playingState();
    const paper = { ...createDraftPaper(1, 0), idea: 40, experiment: 40, writing: 40 };
    const submitted = submitJournalPaper({ ...state, papers: [paper], selectedPaperId: paper.id }, paper.id, "nmi");
    const html = renderApp({ ...submitted, month: 4, totalMonths: 4 }, createDefaultAccountProfile());
    expect(html).toContain('is-journal-reviewing');
    expect(html).toContain("子刊NMI 修改中");
    expect(html).toContain("已修改 3 月 · ");
    expect(html).toContain('class="paper-journal-score" aria-label="期刊修改分数 120/250">120/250</span>');
    expect(html).toContain(`data-action="withdraw-paper" data-paper-id="${paper.id}"`);
    expect(html).not.toContain(`data-action="discard-paper" data-paper-id="${paper.id}"`);
    const journalCard = html.match(/<article class="paper-card[^>]*is-journal-reviewing[\s\S]*?<\/article>/u)?.[0] ?? "";
    expect(journalCard).not.toContain('class="paper-score-strip"');
    expect(journalCard).not.toContain("当前期刊分");
    expect(html).toContain(`data-action="research-paper" data-paper-id="${paper.id}" data-paper-action-type="idea"`);
  });
});

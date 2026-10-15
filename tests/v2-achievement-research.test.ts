import { describe, expect, it } from "vitest";
import { evaluateResearchAchievements, observeResearchAchievements } from "../src/core/v2-achievement-research";
import { createAchievementRunProgress } from "../src/core/v2-achievement-runtime-types";
import { createInitialState } from "../src/core/v2-engine-state-factory";
import { applyPrepublicationPaperDecay, createDraftPaper, submitPaper, withdrawPaper } from "../src/core/v2-paper-rules";
import { submitJournalPaper } from "../src/core/v2-journal-system";
import { dispatchAction } from "../src/core/v2-engine";
import { resolveDuePaperReviews } from "../src/core/v2-publication-system";
import type { GameState, Paper, PaperReviewerReport } from "../src/core/v2-types";

function state(papers: Paper[] = []): GameState {
  return { ...createInitialState(), phase: "playing", playerName: "张同学", selectedAdvisorName: "李老师", papers };
}

function paper(id: string, overrides: Partial<Paper> = {}): Paper {
  return { ...createDraftPaper(1, 0, () => 0.1), id, idea: 10, experiment: 10, writing: 10, ...overrides };
}

function published(id: string, overrides: Partial<Paper> = {}): Paper {
  return paper(id, { status: "published", target: "A", acceptedTotalMonths: 1, acceptedOrder: 1,
    submittedMonth: 1, submittedYear: 1, ...overrides });
}

describe("research achievement evidence", () => {
  it("integrates real dispatch: five journals require five submissions and explicit acceptances", () => {
    let current: GameState = { ...state(Array.from({ length: 5 }, (_, i) => paper(`dispatch-${i}`, { idea: 100, experiment: 100, writing: 100 }))),
      totalMonths: 1, month: 1, eventQueue: [], availableRandomEvents: [], pendingRandomEvents: [],
      player: { san: 20, research: 5, favor: 5, social: 5, money: 100 },
      advisorProgressState: { ...state().advisorProgressState, funding: 100 },
    };
    for (let index = 0; index < 5; index++) {
      current = dispatchAction(current, "submit-journal-paper", { paperId: `dispatch-${index}`, journalTarget: "pami" });
    }
    expect(current.achievementProgress?.sets["research:submissions"]).toHaveLength(5);
    expect(current.achievementProgress?.satisfied).not.toContain("global:perfect-start");
    expect(current.externalPublications).toHaveLength(0);
    for (let index = 4; index >= 0; index--) {
      current = dispatchAction(current, "submit-journal-paper", { paperId: `dispatch-${index}`, journalTarget: "pami" });
      if (index > 0) expect(current.achievementProgress?.satisfied).not.toContain("global:perfect-start");
    }
    expect(current.achievementProgress?.satisfied).toContain("global:perfect-start");
    expect(current.achievementProgress?.sets["research:accepted-submissions"]).toHaveLength(5);
    current = dispatchAction(current, "submit-journal-paper", { paperId: "dispatch-0", journalTarget: "pami" });
    expect(current.achievementProgress?.sets["research:submissions"]).toHaveLength(5);
    expect(current.achievementProgress?.sets["research:accepted-submissions"]).toHaveLength(5);
  });

  it("a prepared review preview grants no publication or reviewer achievements before confirmation", () => {
    let current: GameState = { ...state([paper("preview", { idea: 100, experiment: 100, writing: 100 })]), totalMonths: 1, month: 1,
      availableRandomEvents: [], pendingRandomEvents: [], player: { san: 20, research: 5, favor: 5, social: 5, money: 100 },
      advisorProgressState: { ...state().advisorProgressState, funding: 100 } };
    current = dispatchAction(current, "submit-paper", { paperId: "preview", paperTarget: "A" });
    const prepared = resolveDuePaperReviews({ ...current, papers: current.papers.map(p => ({ ...p, reviewMonthsLeft: 0 })) }, () => 0.9).state;
    const run = structuredClone(prepared.achievementProgress!);
    observeResearchAchievements(current, prepared, run);
    expect(prepared.papers[0]!.status).toBe("reviewing");
    expect(run.sets["research:accepted-submissions"] ?? []).toHaveLength(0);
    expect(run.satisfied).not.toContain("global:highbrow");
    expect(run.satisfied).not.toContain("global:lucky-review");
    expect(run.satisfied).not.toContain("global:best-paper");
  });

  it("records time decay to one for all fields, without granting for initialized low scores", () => {
    let current = state([paper("dry", { idea: 2, experiment: 3, writing: 4, prepublicationDecayRate: 0.5 })]);
    current = applyPrepublicationPaperDecay(current);
    expect(current.achievementProgress?.satisfied).not.toContain("global:air-dried");
    current = applyPrepublicationPaperDecay(current);
    expect(current.achievementProgress?.satisfied).toContain("global:air-dried");
    expect(applyPrepublicationPaperDecay(state([paper("already-one", { idea: 1, experiment: 1, writing: 1 })]))
      .achievementProgress?.satisfied ?? []).not.toContain("global:air-dried");
    expect(applyPrepublicationPaperDecay(state([paper("partly-initial", { idea: 1, experiment: 2, writing: 2 })]))
      .achievementProgress?.satisfied ?? []).not.toContain("global:air-dried");
  });

  it("does not confuse score changes, published papers or zero-decay talents with natural drying", () => {
    const before = state([paper("loss", { idea: 5, experiment: 5, writing: 5 })]);
    const after = state([paper("loss", { idea: 1, experiment: 1, writing: 1 })]);
    const run = createAchievementRunProgress();
    observeResearchAchievements(before, after, run);
    expect(run.satisfied).not.toContain("global:air-dried");
    expect(applyPrepublicationPaperDecay(state([published("p", { idea: 2, experiment: 2, writing: 2 })])).papers[0]?.idea).toBe(2);
    const noDecay = applyPrepublicationPaperDecay(state([paper("zero", { idea: 2, experiment: 2, writing: 2, prepublicationDecayRate: 0 })]));
    expect(noDecay.achievementProgress?.satisfied ?? []).not.toContain("global:air-dried");
  });

  it("uses own score for high-score challenges and total score for Nobel", () => {
    const current = state([paper("collab", { idea: 400, experiment: 400, writing: 200,
      collaborationScores: { idea: 380, experiment: 380, writing: 180 } })]);
    const ids = evaluateResearchAchievements(current, createAchievementRunProgress());
    expect(ids).toContain("global:nobel-beginning");
    expect(ids).not.toContain("global:high-score-paper-i");
    current.papers[0]!.collaborationScores = { idea: 300, experiment: 350, writing: 200 };
    expect(evaluateResearchAchievements(current, createAchievementRunProgress())).toEqual(expect.arrayContaining(["global:high-score-paper-i", "global:high-score-paper-ii"]));
  });

  it("does not attribute a collaborator's prior rejections or lead-author score to the player", () => {
    const run = createAchievementRunProgress();
    const coauthor = state([published("coauthor", { idea: 100, experiment: 100, writing: 100, nonFirstAuthor: true, rejectionCount: 10 })]);
    observeResearchAchievements(state(), coauthor, run);
    expect(run.satisfied).not.toContain("global:never-give-up");
    expect(run.satisfied).not.toContain("global:tasteless");
    expect(run.satisfied).not.toContain("global:high-score-paper-i");
    expect(run.satisfied).not.toContain("global:highbrow");
    const uninvolved = { ...state(), fellowPapers: [published("fellow", { idea: 400, experiment: 400, writing: 400, leadAuthorId: "fellow-1" })] };
    expect(evaluateResearchAchievements(uninvolved, run)).not.toContain("global:nobel-beginning");
  });

  it("counts actual recorded authors, deduplicates the player and advisor", () => {
    const current = state([paper("authors", { collaborators: [
      { id: "player", name: "张同学" }, { id: "advisor", name: "李老师" },
      ...["甲", "乙", "丙", "丁"].map(name => ({ id: name, name })),
    ] })]);
    expect(evaluateResearchAchievements(current, createAchievementRunProgress())).toContain("global:author-six");
    current.papers[0]!.collaborators!.pop();
    expect(evaluateResearchAchievements(current, createAchievementRunProgress())).not.toContain("global:author-six");
  });

  it("keeps master-only publications after transfer and does not count doctoral publications", () => {
    const run = createAchievementRunProgress();
    const master = state([published("a1"), published("a2"), published("a3"), ...Array.from({ length: 5 }, (_, i) => published(`c${i}`, { target: "C" }))]);
    observeResearchAchievements(state(), master, run);
    expect(run.satisfied).toEqual(expect.arrayContaining(["global:three-a-master", "global:c-paper-king"]));
    const phd = { ...master, degree: "phd" as const };
    const newRun = createAchievementRunProgress();
    observeResearchAchievements(state(), phd, newRun);
    expect(newRun.satisfied).not.toContain("global:three-a-master");
    expect(newRun.satisfied).not.toContain("global:c-paper-king");
  });

  it("uses acceptance ordering for cooperation before first authorship", () => {
    const current = state([published("first", { acceptedOrder: 2 }), published("co", { nonFirstAuthor: true, acceptedOrder: 1 })]);
    const run = createAchievementRunProgress();
    expect(evaluateResearchAchievements(current, run)).toContain("global:collaboration-before-first");
    current.papers[0]!.acceptedOrder = 0;
    expect(evaluateResearchAchievements(current, run)).not.toContain("global:collaboration-before-first");
  });

  it("only counts settled reviews and keeps rejection evidence after the draft is discarded", () => {
    const run = createAchievementRunProgress();
    const reports: PaperReviewerReport[] = Array.from({ length: 3 }, () => ({ reviewer: "大牛", reviewerType: "expert", focus: "idea", effectiveScore: 1, decision: "Reject", reviewScore: -1, improvementAction: "idea", improvementAmount: 10 }));
    const rejected = state([paper("rejected", { rejectionCount: 3, lastReview: { reports, accepted: false, totalReviewScore: -3, borderlineChance: null } })]);
    observeResearchAchievements(state(), rejected, run);
    observeResearchAchievements(rejected, rejected, run);
    expect(run.counters["research:rejected:rejected"]).toBe(3);
    expect(run.satisfied).toEqual(expect.arrayContaining(["global:tasteless", "global:back-from-the-brink"]));
    expect(run.satisfied).not.toContain("global:turn-the-tide");
    observeResearchAchievements(rejected, state(), run);
    expect(evaluateResearchAchievements(state(), run)).toContain("global:tasteless");
  });

  it("requires actual PC acceptance at -1, and recognizes three kind reviewers", () => {
    const reports: PaperReviewerReport[] = Array.from({ length: 3 }, () => ({ reviewer: "心软", reviewerType: "kind", focus: "balanced", effectiveScore: 1, decision: "Borderline", reviewScore: 0 }));
    const current = state([published("pc", { lastReview: { reports, totalReviewScore: -1, accepted: true, borderlineChance: 0.2 } })]);
    expect(evaluateResearchAchievements(current, createAchievementRunProgress())).toEqual(expect.arrayContaining(["global:turn-the-tide", "global:lucky-review"]));
  });

  it("waits for each of the first five submissions to succeed, including manually accepted journals", () => {
    const run = createAchievementRunProgress();
    let current = state(Array.from({ length: 5 }, (_, i) => paper(`p${i}`, { idea: 100, experiment: 100, writing: 100 })));
    for (const p of current.papers) {
      const next = submitJournalPaper(current, p.id, "pami");
      observeResearchAchievements(current, next, run);
      current = next;
    }
    expect(run.satisfied).not.toContain("global:perfect-start");
    for (const id of ["p4", "p3", "p2", "p1", "p0"]) {
      const next = submitJournalPaper(current, id, "pami");
      observeResearchAchievements(current, next, run);
      current = next;
    }
    expect(run.sets["research:submissions"]).toHaveLength(5);
    expect(run.satisfied).toContain("global:perfect-start");
  });

  it("a withdrawal among the first five prevents perfect-start", () => {
    const run = createAchievementRunProgress();
    const initial = state([paper("withdraw")]);
    const submitted = submitPaper(initial, "withdraw", "C");
    observeResearchAchievements(initial, submitted, run);
    const withdrawn = withdrawPaper(submitted, "withdraw");
    observeResearchAchievements(submitted, withdrawn, run);
    const firstKey = run.sets["research:submissions"]![0]!;
    run.sets["research:submissions"] = [firstKey, "2", "3", "4", "5"];
    run.sets["research:accepted-submissions"] = [...run.sets["research:submissions"]];
    expect(evaluateResearchAchievements(withdrawn, run)).not.toContain("global:perfect-start");
  });

  it("counts consecutive conference years by venue, includes coauthored papers, deduplicates mirrors", () => {
    const current = state([published("y1", { submittedYear: 1 }), published("y2", { submittedYear: 2, nonFirstAuthor: true }), published("y3", { submittedYear: 3 })]);
    current.externalPublications = [current.papers[0]!];
    expect(evaluateResearchAchievements(current, createAchievementRunProgress())).toContain("global:conference-three-years");
    expect(evaluateResearchAchievements(current, createAchievementRunProgress())).not.toContain("global:double-hit");
    current.papers.push(published("same-year", { submittedYear: 3 }));
    expect(evaluateResearchAchievements(current, createAchievementRunProgress())).toContain("global:double-hit");
    current.papers = current.papers.filter(p => p.id !== "y2");
    expect(evaluateResearchAchievements(current, createAchievementRunProgress())).not.toContain("global:conference-three-years");
  });

  it("requires thesis result confirmation and all-A reports", () => {
    const current = state();
    current.thesis.review = { submitted: true, reason: null, reports: [{ weights: [1], effectiveScore: 500, grade: "A", score: 500, comment: "好" }], passed: true, excellent: true, degree: "phd", title: "论文", researchPoints: [] };
    expect(evaluateResearchAchievements(current, createAchievementRunProgress())).not.toContain("global:excellent-phd-thesis");
    current.thesis.reviewResolved = true;
    expect(evaluateResearchAchievements(current, createAchievementRunProgress())).toContain("global:excellent-phd-thesis");
    current.thesis.review.reports[0]!.grade = "B";
    expect(evaluateResearchAchievements(current, createAchievementRunProgress())).not.toContain("global:excellent-phd-thesis");
  });

  it("checks pre-transfer score for young genius", () => {
    const before = { ...state(), totalResearchScore: 7 };
    const run = createAchievementRunProgress();
    observeResearchAchievements(before, { ...before, degree: "phd" }, run);
    expect(run.satisfied).toContain("global:young-genius");
    const late = createAchievementRunProgress();
    observeResearchAchievements({ ...before, totalResearchScore: 6 }, { ...before, degree: "phd" }, late);
    expect(late.satisfied).not.toContain("global:young-genius");
  });

  it("requires two eligible PhD refusals in different years", () => {
    const run = createAchievementRunProgress();
    const refusal = (year: number): GameState["eventHistory"][number] => ({ id: `refusal-${year}`, chainId: "phd-decision", source: "fixed", completedAtYear: year, completedAtMonth: 10, completedAtTotalMonths: 12 * year - 2,
      stages: [{ title: "不转博", description: "", choices: [], selectedChoiceId: "continue-master" }] });
    const initial = { ...state(), totalResearchScore: 2 };
    const yearTwo = { ...initial, eventHistory: [refusal(2)] };
    observeResearchAchievements(initial, yearTwo, run);
    observeResearchAchievements(initial, yearTwo, run);
    expect(run.sets["research:qualified-phd-refusals"]).toHaveLength(1);
    const yearThree = { ...yearTwo, eventHistory: [...yearTwo.eventHistory, refusal(3)] };
    observeResearchAchievements(yearTwo, yearThree, run);
    expect(run.satisfied).not.toContain("global:clear-minded");
    const qualified = { ...yearTwo, totalResearchScore: 10 };
    observeResearchAchievements(qualified, { ...qualified, eventHistory: yearThree.eventHistory }, run);
    expect(run.satisfied).toContain("global:clear-minded");
  });

  it("journal titles, Best Paper and full publicity use actual publication metadata", () => {
    const run = createAchievementRunProgress();
    const current = state([published("nature", { journalTarget: "nature", target: null }),
      published("nature-coauthor", { journalTarget: "nature", target: null, nonFirstAuthor: true }),
      published("nmi", { journalTarget: "nmi", target: null }),
      published("best", { publication: { citations: 0, effectiveScore: 150, citationDebuffMultiplier: 1, acceptType: "Best Paper", promotions: { arxiv: true, github: true, xiaohongshu: true, quantum: false } } }),
    ]);
    expect(evaluateResearchAchievements(current, run)).toEqual(expect.arrayContaining(["global:nature-child", "global:nature-summit", "global:future-academician", "global:best-paper"]));
    expect(evaluateResearchAchievements(current, run)).not.toContain("global:all-publicity");
    current.papers[3]!.publication!.promotions!.quantum = true;
    expect(evaluateResearchAchievements(current, run)).toContain("global:all-publicity");
    current.papers[0]!.nonFirstAuthor = true;
    expect(evaluateResearchAchievements(current, run)).not.toContain("global:nature-summit");
  });

  it("total publication and citation challenges do not require a good ending, academic-star does", () => {
    const run = createAchievementRunProgress();
    const current = { ...state(Array.from({ length: 10 }, (_, i) => published(`paper${i}`, { nonFirstAuthor: true }))), ending: "poor" as const, totalCitations: 10000 };
    current.papers.push(published("c", { target: "C", publication: { citations: 100, effectiveScore: 40, citationDebuffMultiplier: 1 } }));
    expect(evaluateResearchAchievements(current, run)).toEqual(expect.arrayContaining(["global:paper-machine", "global:collaboration-ten", "global:thousand-citations", "global:ten-thousand-citations"]));
    expect(evaluateResearchAchievements(current, run)).not.toContain("global:academic-star");
    expect(evaluateResearchAchievements(current, run)).not.toContain("global:cannot-be-buried");
    current.papers.at(-1)!.publication!.citations = 101;
    expect(evaluateResearchAchievements({ ...current, ending: "phd" }, run)).toEqual(expect.arrayContaining(["global:academic-star", "global:cannot-be-buried"]));
  });
});

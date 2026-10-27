import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { deriveReplayResults, getReplayResults } from "../src/app/v2-replay-results";
import { createInitialState } from "../src/core/v2-engine";
import { parseReplayRecording } from "../src/core/v2-local-replay";
import { replayStateDigest } from "../src/core/v2-run-replay";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { attachPaperPublication } from "../src/core/v2-publication-rules";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import type { Paper } from "../src/core/v2-types";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import manifest from "../src/app/v2-official-replay-manifest.json";

describe("replay result facts", () => {
  it("derives final metrics and caps from a verified official run", async () => {
    const recording = parseReplayRecording(await readFile("public/official-replays/normal-phd-10.json", "utf8"));
    const before = JSON.stringify(recording);
    const result = await getReplayResults(recording);
    const entry = manifest.find(item => item.id === recording.id)!;
    expect(result.researchScore).toBe(entry.score);
    expect(result.money).toBe(entry.metrics.money);
    expect(result.attributes).toEqual(entry.metrics.attributes);
    expect(result.outcomes).toEqual(entry.metrics.outcomes);
    expect(result.talentPoints).toBe(entry.metrics.talentPoints);
    expect(JSON.stringify(recording)).toBe(before);
  });

  it("reads unfinished metrics without modifying the state or settling achievements", () => {
    const state = createInitialState();
    state.runAchievementIds = ["global:academic-star"];
    const before = replayStateDigest(state);
    const result = deriveReplayResults(state);
    expect(result.attributes).toHaveLength(4);
    expect(result.money).toBe(state.player.money);
    expect(replayStateDigest(state)).toBe(before);
    expect(state.runAchievementIds).toEqual(["global:academic-star"]);
  });

  it("counts allocated talent costs under the recording's rules instead of available budgets", () => {
    const state = createInitialState();
    state.roleTalents = { levels: { "first-month-drive": 1, "first-month-drive-plus": 5, diligence: 3 } };
    expect(deriveReplayResults(state).talentPoints).toBe(10);
    state.roleTalents.levels = { "first-month-drive": 1 };
    expect(deriveReplayResults(state).talentPoints).toBe(2);
    expect(withGameplayRuleset("20261016-r1", () => deriveReplayResults(state).talentPoints)).toBe(1);
    state.roleTalents.levels = {};
    expect(deriveReplayResults(state).talentPoints).toBe(0);
    delete state.roleTalents;
    expect(deriveReplayResults(state).talentPoints).toBeNull();
  });

  it.each(["rewinder", "research-captain", "cursed-frail", "special-finite-life", "special-fading-genius", "cursed-debt"] as const)("does not invent ordinary talent point counts for %s", roleId => {
    const state = createInitialState();
    state.selectedRoleId = roleId;
    state.roleTalents = { levels: { "first-month-drive": 1, "illness-surface": 1 } };
    expect(deriveReplayResults(state).talentPoints).toBeNull();
  });

  it("counts ending-page publications once, including coauthors and journal metadata", () => {
    const state = createInitialState();
    const paper = (id: string, patch: Partial<Paper> = {}): Paper => attachPaperPublication({
      ...createDraftPaper(1, 0, () => 0), id, status: "published", target: "A", ...patch,
    });
    const a = paper("a");
    const nature = paper("nature", { journalTarget: "nature", target: "A" });
    const nmi = paper("nmi", { journalTarget: "nmi" });
    const pami = paper("pami", { journalTarget: "pami" });
    delete pami.journalTarget; // Older publications can keep venue only in metadata.
    state.papers = [a, nature, paper("draft", { status: "draft" })];
    state.externalPublications = [a, nature, nmi, pami,
      paper("b-coauthor", { target: "B", nonFirstAuthor: true, leadAuthorId: "fellow" }),
      paper("c", { target: "C" }), paper("someone-else", { leadAuthorId: "fellow" }),
      paper("reviewing", { status: "reviewing" })];
    state.totalCitations = 1234;
    expect(deriveReplayResults(state).outcomes).toMatchObject({
      totalCitations: 1234, publications: { A: 1, B: 1, C: 1, nature: 1, nmi: 1, pami: 1 },
    });
  });

  it("derives relationships, current lab funding, revealed grades and retained job offers", () => {
    const state = createInitialState();
    state.selectedAdvisorName = "林老师";
    state.relationshipState.advisorCount = 1;
    state.advisorProgressState.awards = [{ id: "youth", awardedYear: 2023, startYear: 2024, endYear: 2026 }];
    state.advisorProgressState.funding = 42.5;
    state.advisorProgressState.cumulativeFunding = 500;
    state.loverState.active = true;
    state.conferenceEncounterState.bigBullCooperation = true;
    state.internshipCount = 2;
    state.fellowProgressState = [createCustomFellowProgressProfile({
      type: "peer", gender: "female", name: "同学", research: 4, affinity: 5, startTotalMonths: 1,
    })];
    state.careerOffers = { academic: { type: "academic", jobId: "academic-world-professor",
      name: "世界名校长聘教授", threshold: 1100, score: 1200 } };
    state.thesis.review = { submitted: true, reason: null, passed: true, excellent: false,
      degree: "phd", title: "论文", researchPoints: [],
      reports: (["A", "B", "B", "C", "D"] as const).map(grade => ({ grade,
        weights: [1], effectiveScore: 100, score: 80, comment: "意见" })),
    };
    // Pending review grades must not leak before the result has been revealed.
    expect(deriveReplayResults(state).outcomes.thesisGrades).toBeNull();
    expect(deriveReplayResults(state).outcomes.thesisStatus).toBe("pending");
    state.thesis.reviewResolved = true;
    const before = structuredClone(state);
    expect(deriveReplayResults(state).outcomes).toMatchObject({
      lover: true, jointTraining: true, internships: 2, fellows: 1, funding: 42.5,
      advisorRank: "副教授", job: "世界名校 · 人工智能学院 · 长聘教授",
      thesisGrades: { A: 1, B: 2, C: 1, D: 1 },
      thesisStatus: "revealed",
    });
    expect(state).toEqual(before);
    state.conferenceEncounterState.bigBullCooperation = false;
    state.conferenceEncounterState.jointTrainingReward = { mentorId: "mentor", mentorName: "联培老师", ideaBonus: 1, writingBonus: 1, capBonus: 1 };
    expect(deriveReplayResults(state).outcomes.jointTraining).toBe(true);
  });

  it("distinguishes actual absent outcomes from an unavailable blind review", () => {
    expect(deriveReplayResults(createInitialState()).outcomes).toMatchObject({
      lover: false, jointTraining: false, internships: 0, job: null, fellows: 0,
      advisorRank: null, thesisGrades: null,
      thesisStatus: "not-submitted",
    });
  });
});

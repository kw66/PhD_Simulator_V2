import { describe, expect, it } from "vitest";
import { evaluateEndingChallenges } from "../src/core/v2-achievement-ending-challenges";
import { evaluateEndingResearchAchievements } from "../src/core/v2-achievement-research";
import { settleRunAchievements } from "../src/core/v2-achievement-runtime";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { createGrantedPublishedPaper } from "../src/core/v2-publication-rules";
import { recordLabFinance } from "../src/core/v2-lab-finance-ledger";
import { replayStateDigest } from "../src/core/v2-run-replay";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { GameState, Paper, ResolvedEventRecord, ResolvedEventStage } from "../src/core/v2-types";

const noConference = "global:no-first-conference-graduation";
const spending = "global:advisor-spending-thousand";
const rejected = "global:career-rejections-six";
function ending(): GameState {
  return { ...createStartedGameState("normal"), phase: "finished", ending: "master" };
}
function paper(index: number, changes: Partial<Paper> = {}): Paper {
  return { ...createGrantedPublishedPaper(1, index, { target: "A", acceptedScore: 60 }), ...changes };
}
function stage(selectedChoiceId: string): ResolvedEventStage {
  return { title: "", description: "", selectedChoiceId, choices: [{ id: selectedChoiceId, label: "", outcome: "" }] };
}
function application(index: number, result = "confirm", applied = true): ResolvedEventRecord {
  return { id: `result-${index}`, chainId: `career-recruitment-${index}`, source: "career",
    completedAtTotalMonths: index, completedAtYear: 3, completedAtMonth: index,
    stages: [stage("internet"), stage(applied ? "apply-internet-development" : "rest"), stage(result)] };
}

describe("settlement-only final challenges", () => {
  it.each(["master", "phd"] as const)("allows %s graduation without first-author conferences, including zero publications", degree => {
    const state = { ...ending(), degree, ending: degree };
    expect(evaluateEndingResearchAchievements(state)).not.toContain(noConference);
    expect(withGameplayRuleset("20261027-r58", () => evaluateEndingResearchAchievements(state))).toContain(noConference);
    const first = paper(1, { journalTarget: "pami" });
    const metadataOnly = paper(2);
    metadataOnly.publication = { ...metadataOnly.publication!, journalTarget: "nature" };
    state.papers = [first, paper(3, { status: "reviewing" })];
    state.externalPublications = [first, metadataOnly, paper(4, { nonFirstAuthor: true }), paper(5, { leadAuthorId: "fellow-1" })];
    expect(evaluateEndingResearchAchievements(state)).not.toContain(noConference);
    expect(withGameplayRuleset("20261027-r58", () => evaluateEndingResearchAchievements(state))).toContain(noConference);
    state.externalPublications.push(paper(6));
    expect(evaluateEndingResearchAchievements(state)).not.toContain(noConference);
  });

  it("does not award graduation challenges for failure endings or unfinished play", () => {
    expect(evaluateEndingResearchAchievements({ ...ending(), ending: "quit" })).not.toContain(noConference);
    expect(evaluateEndingResearchAchievements({ ...ending(), phase: "playing", ending: null })).not.toContain(noConference);
  });

  it("derives all lab spending from cumulative receipts and balance, including fellow spending and overdrafts", () => {
    let state = ending();
    const transaction = (category: Parameters<typeof recordLabFinance>[1], amount: number): void => {
      state = recordLabFinance({ ...state, advisorProgressState: { ...state.advisorProgressState,
        funding: state.advisorProgressState.funding + amount } }, category, amount);
    };
    transaction("grant-income", 1000);
    transaction("student-wages", -500);
    transaction("student-experiment", -499.9);
    expect(evaluateEndingChallenges(state)).not.toContain(spending);
    transaction("conference-registration", -0.1);
    expect(evaluateEndingChallenges(state)).toContain(spending);
    transaction("horizontal-income", 200);
    transaction("labor", -400);
    expect(state.advisorProgressState.funding).toBeLessThan(0);
    expect(evaluateEndingChallenges(state)).toContain(spending);
    expect(evaluateEndingChallenges({ ...ending(), player: { ...state.player, money: -1000 } })).not.toContain(spending);
  });

  it("requires six completed failed applications and ignores duplicates, rest, pending applications and declined offers", () => {
    const state = ending();
    state.eventHistory = Array.from({ length: 5 }, (_, index) => application(index));
    state.eventHistory.push(application(0), { ...application(0), id: "duplicate-id" }, application(6, "confirm", false),
      application(7, "decline-offer"), application(8, "keep-offer"), application(9, "accept-offer"), application(10, "replace-offer"),
      { ...application(11), stages: [stage("internet"), stage("apply-internet-development")] });
    expect(evaluateEndingChallenges(state)).not.toContain(rejected);
    state.eventHistory.push(application(12));
    expect(evaluateEndingChallenges(state)).toContain(rejected);
    expect(evaluateEndingChallenges({ ...state, phase: "playing", ending: null })).toEqual([]);
  });

  it("settles existing records without changing replay evidence, rewards once and excludes special roles", () => {
    const state = ending();
    state.advisorProgressState.cumulativeFunding = 1030;
    state.eventHistory = Array.from({ length: 6 }, (_, index) => application(index));
    const digest = replayStateDigest(state);
    const settled = settleRunAchievements(createDefaultAccountProfile(), state, "2026-10-17T01:00:00Z");
    expect(settled.state.runAchievementIds).toEqual(expect.arrayContaining([spending, rejected]));
    expect(settled.state.runAchievementIds).not.toContain(noConference);
    expect(Object.values(settled.account.roleProgress).every(role => role.exp === 10)).toBe(true);
    expect(replayStateDigest(state)).toBe(digest);
    expect(state.achievementProgress?.satisfied ?? []).not.toEqual(expect.arrayContaining([noConference, spending, rejected]));
    const again = settleRunAchievements(settled.account, state, "2026-10-18T01:00:00Z");
    expect(Object.values(again.account.roleProgress).every(role => role.exp === 10)).toBe(true);
    const special = settleRunAchievements(createDefaultAccountProfile(), { ...state, selectedRoleId: "research-captain" });
    expect(special.state.runAchievementIds).not.toEqual(expect.arrayContaining([noConference, spending, rejected]));
  });
});

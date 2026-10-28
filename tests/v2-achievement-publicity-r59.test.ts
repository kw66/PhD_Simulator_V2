import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { submitJournalPaper } from "../src/core/v2-journal-system";
import { applyPaperPromotion } from "../src/core/v2-publication-actions";
import { getApplicablePaperPromotions } from "../src/core/v2-paper-promotion-eligibility";
import { evaluateResearchAchievements } from "../src/core/v2-achievement-research";
import { createAchievementRunProgress } from "../src/core/v2-achievement-runtime-types";
import { withGameplayRuleset } from "../src/core/v2-rule-context";
import type { GameState, Paper } from "../src/core/v2-types";

function journal(): GameState {
  const initial = createStartedGameState("normal");
  const paper = { ...createDraftPaper(1, 0, () => 0.5), idea: 50, experiment: 50, writing: 50 };
  let state: GameState = { ...initial, totalMonths: 1, month: 1, papers: [paper],
    player: { ...initial.player, money: 100, san: 20 }, advisorProgressState: { ...initial.advisorProgressState, funding: 100 } };
  state = submitJournalPaper(state, paper.id, "pami");
  return submitJournalPaper(state, paper.id, "pami");
}
function achieved(state: GameState): boolean {
  return evaluateResearchAchievements(state, createAchievementRunProgress()).includes("global:all-publicity");
}
function published(state: GameState): Paper {
  return state.externalPublications[0]!;
}

describe("r59 applicable publicity and author identities", () => {
  it("completes a genuinely published journal without an impossible arXiv promotion", () => {
    let state = journal();
    const paper = published(state);
    expect(paper.status).toBe("published");
    expect(getApplicablePaperPromotions(paper)).toEqual(["github", "xiaohongshu", "quantum"]);
    for (const promotion of ["github", "xiaohongshu", "quantum"] as const) {
      expect(achieved(state)).toBe(false);
      state = applyPaperPromotion(state, paper.id, promotion);
    }
    expect(achieved(state)).toBe(true);
    expect(withGameplayRuleset("20261027-r58", () => achieved(state))).toBe(false);
  });

  it("does not forgive a missing applicable promotion when money or SAN is insufficient", () => {
    let state = journal();
    const id = published(state).id;
    state = applyPaperPromotion(state, id, "github");
    state = { ...state, player: { ...state.player, san: 0, money: 0 } };
    state = applyPaperPromotion(state, id, "xiaohongshu");
    state = applyPaperPromotion(state, id, "quantum");
    expect(published(state).publication?.promotions?.xiaohongshu).not.toBe(true);
    expect(published(state).publication?.promotions?.quantum).not.toBe(true);
    expect(getApplicablePaperPromotions(published(state))).toHaveLength(3);
    expect(achieved(state)).toBe(false);
  });

  it("uses the actual conference exposure window and retains completed arXiv", () => {
    const base = published(journal());
    const conference: Paper = { ...base, journalTarget: undefined, target: "A", conferenceHandled: false,
      publication: { ...base.publication!, journalTarget: undefined, monthsSincePublish: 0,
        preprintExposed: false, posterExposed: false,
        promotions: { arxiv: false, github: true, xiaohongshu: true, quantum: false } } };
    const state = { ...journal(), externalPublications: [conference] };
    expect(achieved(state)).toBe(false);
    conference.publication!.monthsSincePublish = 3;
    expect(getApplicablePaperPromotions(conference)).toEqual(["github", "xiaohongshu"]);
    expect(achieved(state)).toBe(true);
    conference.publication!.promotions!.arxiv = true;
    conference.publication!.preprintExposed = true;
    expect(getApplicablePaperPromotions(conference)).toContain("arxiv");
    expect(achieved(state)).toBe(true);
  });

  it("does not treat drafts or non-first-author publications as vacuous success", () => {
    const state = journal();
    published(state).nonFirstAuthor = true;
    expect(getApplicablePaperPromotions(published(state))).toEqual([]);
    expect(achieved(state)).toBe(false);
    published(state).nonFirstAuthor = false;
    published(state).status = "draft";
    expect(achieved(state)).toBe(false);
  });

  it("counts distinct identities even when old saves contain the same name", () => {
    const state = journal();
    state.playerName = state.selectedAdvisorName = "同名";
    published(state).collaborators = Array.from({ length: 4 }, (_, index) => ({ id: `fellow-${index}`, name: "同名" }));
    const ids = () => evaluateResearchAchievements(state, createAchievementRunProgress());
    expect(ids()).toContain("global:author-six");
    expect(withGameplayRuleset("20261027-r58", ids)).not.toContain("global:author-six");
    published(state).collaborators!.push({ id: "fellow-0", name: "改名" });
    published(state).collaborators!.splice(1, 1);
    expect(ids()).not.toContain("global:author-six");
  });
});

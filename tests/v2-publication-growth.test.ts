import { describe, expect, it } from "vitest";

import { renderApp } from "../src/app/v2-render";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { attachPaperPublication } from "../src/core/v2-publication-rules";
import { getConferencePublicationRewardPreview } from "../src/core/v2-publication-system";
import {
  applyPublicationTalentRewards,
  getPublicationTalentChecklist,
} from "../src/core/v2-publication-talent";
import type { Paper, PaperAcceptType, PaperTarget } from "../src/core/v2-types";

function publishedPaper(target: PaperTarget, acceptType: PaperAcceptType, nonFirstAuthor = false): Paper {
  return attachPaperPublication({
    ...createDraftPaper(1, 0, () => 0),
    target,
    nonFirstAuthor,
    status: "published",
  }, 1, acceptType);
}

function publishedJournal(journalTarget: "nature" | "nmi" | "pami", nonFirstAuthor = false): Paper {
  return attachPaperPublication({
    ...createDraftPaper(1, 0, () => 0),
    target: null,
    journalTarget,
    nonFirstAuthor,
    status: "published",
  }, 1);
}

function getTalentCard(html: string, id: string): string {
  return html.match(new RegExp(`<article\\b[^>]*data-talent-item-id="${id}"[\\s\\S]*?</article>`))?.[0] ?? "";
}

describe("v2 publication growth transparency", () => {
  it("previews all conference awards without adding research ability rewards", () => {
    const state = createStartedGameState("normal");
    const expected = {
      A: { Poster: [6, 2], Spotlight: [6, 2], Oral: [8, 3], "Best Paper Candidate": [12, 4], "Best Paper": [12, 4] },
      B: { Poster: [3, 1], Spotlight: [3, 1], Oral: [4, 1], "Best Paper Candidate": [5, 2], "Best Paper": [5, 2] },
      C: { Poster: [2, 0], Spotlight: [2, 0], Oral: [2, 0], "Best Paper Candidate": [3, 1], "Best Paper": [3, 1] },
    } as const;

    for (const target of ["A", "B", "C"] as const) {
      for (const acceptType of ["Poster", "Spotlight", "Oral", "Best Paper Candidate", "Best Paper"] as const) {
        const [sanReward, favorReward] = expected[target][acceptType];
        expect(getConferencePublicationRewardPreview(state, target, acceptType)).toEqual({
          baseSanReward: sanReward,
          baseFavorReward: favorReward,
          rewardReductionCount: 0,
          sanReward,
          favorReward,
        });
      }
    }
  });

  it("counts higher-ranked first-author publications across both lists, not drafts, coauthors or journals", () => {
    const state = createStartedGameState("normal");
    state.papers = [publishedPaper("A", "Poster"), publishedPaper("A", "Oral"), createDraftPaper(1, 1)];
    state.externalPublications = [
      publishedPaper("B", "Best Paper"),
      publishedPaper("C", "Poster"),
      publishedPaper("A", "Best Paper", true),
      { ...publishedPaper("A", "Best Paper"), target: null, journalTarget: "nature" },
    ];
    const snapshot = structuredClone(state);

    expect(getConferencePublicationRewardPreview(state, "A", "Oral")).toMatchObject({
      rewardReductionCount: 1, sanReward: 7, favorReward: 3,
    });
    expect(getConferencePublicationRewardPreview(state, "A", "Poster")).toMatchObject({
      rewardReductionCount: 2, sanReward: 4, favorReward: 1,
    });
    expect(getConferencePublicationRewardPreview(state, "B", "Poster")).toMatchObject({
      rewardReductionCount: 3, sanReward: 1, favorReward: 0,
    });
    expect(getConferencePublicationRewardPreview(state, "C", "Poster").rewardReductionCount).toBe(4);
    expect(state).toEqual(snapshot);
  });

  it("preserves pending-batch reductions and lower bounds without applying SAN caps or favor resistance in previews", () => {
    const state = createStartedGameState("normal");
    state.player.san = state.sanCap;
    state.player.favor = 20;

    expect(getConferencePublicationRewardPreview(state, "A", "Poster", 2)).toMatchObject({
      rewardReductionCount: 2, sanReward: 4, favorReward: 1,
    });
    expect(getConferencePublicationRewardPreview(state, "A", "Poster", 100)).toMatchObject({
      rewardReductionCount: 100, sanReward: 1, favorReward: 0,
    });
  });

  it("renders the publication talent checklist in its own tab", () => {
    const state = createStartedGameState("normal");
    const html = renderApp(state, createDefaultAccountProfile(), { activePlayTab: "talent", activeTalentTab: "publication" });
    const publicationList = html;

    expect(html).toContain('data-ui-talent-tab="publication"');
    expect(publicationList.match(/data-talent-item-id="publication-talent-/g)).toHaveLength(12);
    expect(publicationList).toContain("首发论文");
    expect(publicationList).toContain("SAN+2 ｜ 好感+1 ｜ 社交+0 ｜ 科研+1 ｜ 科研上限+0");
    expect(getTalentCard(html, "publication-talent-first-paper")).not.toContain("科研分");
    expect(html).not.toContain('data-talent-item-id="conference-publication-growth"');
    expect(html).not.toContain('data-talent-item-id="journal-publication-growth"');
  });

  it("allows one first-author A Best Paper to complete every matching checklist item", () => {
    const state = createStartedGameState("normal");
    state.externalPublications = [publishedPaper("A", "Best Paper")];

    const completedIds = getPublicationTalentChecklist(state)
      .filter((item) => item.completed)
      .map((item) => item.id);
    expect(completedIds).toEqual(["first-paper", "first-a-or-journal", "first-a-best-paper"]);

    const html = renderApp(state, createDefaultAccountProfile(), { activePlayTab: "talent", activeTalentTab: "publication" });
    expect(getTalentCard(html, "publication-talent-first-paper")).toContain("✅");
    expect(getTalentCard(html, "publication-talent-first-a-or-journal")).toContain("✅");
    expect(getTalentCard(html, "publication-talent-first-a-best-paper")).toContain("✅");
  });

  it("does not count Best Paper Candidate as Best Paper", () => {
    const state = createStartedGameState("normal");
    state.externalPublications = [publishedPaper("A", "Best Paper Candidate")];

    const checklist = getPublicationTalentChecklist(state);
    expect(checklist.find((item) => item.id === "first-paper")?.completed).toBe(true);
    expect(checklist.find((item) => item.id === "first-a-or-journal")?.completed).toBe(true);
    expect(checklist.find((item) => item.id === "first-a-best-paper")?.completed).toBe(false);
    expect(checklist.find((item) => item.id === "first-coauthor-a-best-paper")?.completed).toBe(false);
  });

  it("only completes collaboration talents for a non-first-author paper", () => {
    const state = createStartedGameState("normal");
    state.externalPublications = [publishedPaper("A", "Best Paper", true)];

    const completedIds = getPublicationTalentChecklist(state)
      .filter((item) => item.completed)
      .map((item) => item.id);
    expect(completedIds).toEqual([
      "first-coauthor-paper",
      "first-coauthor-a",
      "first-coauthor-a-best-paper",
    ]);
  });

  it("completes journal, highly cited and citation milestones independently", () => {
    const state = createStartedGameState("normal");
    const nature = publishedJournal("nature");
    nature.publication = { ...nature.publication!, highlyCited: true };
    state.externalPublications = [nature];
    state.totalCitations = 100;

    const completedIds = getPublicationTalentChecklist(state)
      .filter((item) => item.completed)
      .map((item) => item.id);
    expect(completedIds).toEqual(["first-paper", "first-a-or-journal", "first-nature", "first-highly-cited", "citations-100"]);
  });

  it("grants publication talent rewards once and supports later citation milestones", () => {
    const state = createStartedGameState("normal");
    state.externalPublications = [publishedPaper("A", "Best Paper")];
    const initialPlayer = { ...state.player };
    const initialCapBonus = state.researchCapacityState.otherCapBonus;

    const afterPublication = applyPublicationTalentRewards(state);
    expect(afterPublication.player.san).toBe(Math.min(state.sanCap, initialPlayer.san + 14));
    expect(afterPublication.player.favor).toBe(initialPlayer.favor + 4);
    expect(afterPublication.player.research).toBe(initialPlayer.research + 3);
    expect(afterPublication.researchCapacityState.otherCapBonus).toBe(initialCapBonus + 1);
    expect(applyPublicationTalentRewards(afterPublication)).toEqual(afterPublication);

    const at100 = applyPublicationTalentRewards({ ...afterPublication, totalCitations: 100 });
    expect(at100.player.san).toBe(Math.min(at100.sanCap, afterPublication.player.san + 2));
    expect(at100.player.research).toBe(afterPublication.player.research + 1);

    const at1000 = applyPublicationTalentRewards({ ...at100, totalCitations: 1000 });
    expect(at1000.player.san).toBe(Math.min(at1000.sanCap, at100.player.san + 4));
    expect(at1000.player.research).toBe(at100.player.research + 1);

    const at10000 = applyPublicationTalentRewards({ ...at1000, totalCitations: 10000 });
    expect(at10000.player.san).toBe(Math.min(at10000.sanCap, at1000.player.san + 8));
    expect(at10000.player.research).toBe(at1000.player.research + 1);
    expect(at10000.researchCapacityState.otherCapBonus).toBe(at1000.researchCapacityState.otherCapBonus + 1);
  });
});

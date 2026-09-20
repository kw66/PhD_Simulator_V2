import { describe, expect, it } from "vitest";

import { renderApp } from "../src/app/v2-render";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDefaultAccountProfile } from "../src/core/v2-lobby";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { attachPaperPublication } from "../src/core/v2-publication-rules";
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
  it.each([false, true])("preserves every publication talent icon while showing completed status %s in its badge", (completed) => {
    const state = createStartedGameState("normal");
    if (completed) {
      const bestPaper = publishedPaper("A", "Best Paper");
      state.externalPublications = [
        { ...bestPaper, id: "best-paper", rejectionCount: 3, publication: { ...bestPaper.publication!, highlyCited: true } },
        { ...publishedPaper("A", "Best Paper", true), id: "coauthor-best-paper" },
        { ...publishedJournal("nmi"), id: "nmi-paper" },
        { ...publishedJournal("nature"), id: "nature-paper" },
      ];
      state.totalCitations = 10000;
    }
    const checklist = getPublicationTalentChecklist(state);
    const html = renderApp(state, createDefaultAccountProfile(), { activePlayTab: "talent", activeTalentTab: "publication" });
    for (const item of checklist) {
      const card = getTalentCard(html, `publication-talent-${item.id}`);
      expect(item.completed).toBe(completed);
      expect(card.match(/class="publication-talent-icon"/g)).toHaveLength(1);
      expect(card).toContain(`<span class="publication-talent-icon" aria-hidden="true">${item.icon}</span>`);
      expect(card).toContain(`<strong>${item.name}</strong>`);
      expect(card).toContain(`class="talent-item-tag ${completed ? "is-active" : "is-inactive"}">${completed ? "已达成" : "未达成"}</span>`);
      expect(card).not.toMatch(/publication-talent-check|>✓<|>—</);
      expect(card.indexOf('class="publication-talent-icon"')).toBeLessThan(card.indexOf(`<strong>${item.name}</strong>`));
    }
  });

  it.each(["conference", "journal"])("awards perseverance once after the same first-author %s paper survives three rejections", (venue) => {
    const state = createStartedGameState("normal");
    state.player.san = 0;
    const paper = { ...(venue === "journal" ? publishedJournal("pami") : publishedPaper("C", "Poster")), rejectionCount: 3 };
    state.externalPublications = [{ ...paper, rejectionCount: 2 }];
    const before = applyPublicationTalentRewards(state);
    const claimedBefore = before.publicationTalentState!.claimedIds;
    expect(claimedBefore).not.toContain("perseverance");
    const completed = applyPublicationTalentRewards({ ...before, externalPublications: [paper] });
    expect(completed.publicationTalentState!.claimedIds).toEqual([...claimedBefore, "perseverance"]);
    expect(completed.player.san).toBe(before.player.san + 4);
    expect(completed.player.research).toBe(before.player.research + 1);
    expect(completed.player.favor).toBe(before.player.favor);
    const repeated = { ...completed, externalPublications: [paper, { ...paper, id: "second-rejected-paper" }] };
    expect(applyPublicationTalentRewards(repeated)).toEqual(repeated);
  });

  it("does not combine rejections across papers or award perseverance for drafts and coauthored papers", () => {
    const state = createStartedGameState("normal");
    state.externalPublications = [
      { ...publishedPaper("A", "Poster", true), rejectionCount: 3 },
      { ...publishedPaper("C", "Poster"), rejectionCount: 2 },
      { ...publishedPaper("C", "Poster"), rejectionCount: 1 },
    ];
    state.papers = [{ ...createDraftPaper(1, 0), rejectionCount: 3 }];
    expect(getPublicationTalentChecklist(state).find((item) => item.id === "perseverance")?.completed).toBe(false);
  });

  it("renders the publication talent checklist in its own tab", () => {
    const state = createStartedGameState("normal");
    const html = renderApp(state, createDefaultAccountProfile(), { activePlayTab: "talent", activeTalentTab: "publication" });
    const publicationList = html;

    expect(html).toContain('data-ui-talent-tab="publication"');
    expect(publicationList.match(/data-talent-item-id="publication-talent-/g)).toHaveLength(13);
    expect(publicationList).not.toContain('data-publication-group=');
    expect(publicationList.match(/<article[^>]*publication-talent-card/g)).toHaveLength(13);
    expect(getTalentCard(html, "publication-talent-first-paper")).toContain("<strong>研究之始</strong>");
    expect(getTalentCard(html, "publication-talent-first-paper")).toContain('class="talent-item-desc publication-talent-condition">一作发表任意论文');
    expect(publicationList).toContain("学术影响·Ⅰ");
    expect(publicationList).toContain("学术影响·Ⅱ");
    expect(publicationList).toContain("学术影响·Ⅲ");
    expect(publicationList).toContain('<span>SAN</span><strong>+2</strong>');
    expect(publicationList).toContain('<span>好感</span><strong>+1</strong>');
    expect(publicationList).toContain('<span>科研</span><strong>+1</strong>');
    expect(getTalentCard(html, "publication-talent-first-paper")).toContain('<span class="publication-talent-icon" aria-hidden="true">📄</span>');
    expect(getTalentCard(html, "publication-talent-first-paper")).not.toMatch(/社交\+0|科研上限\+0/);
    expect(getTalentCard(html, "publication-talent-first-paper")).toContain('class="talent-item-tag is-inactive">未达成</span>');
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
    expect(getTalentCard(html, "publication-talent-first-paper")).toContain('<span class="publication-talent-icon" aria-hidden="true">📄</span>');
    expect(getTalentCard(html, "publication-talent-first-paper")).toContain('class="talent-item-tag is-active">已达成</span>');
    expect(getTalentCard(html, "publication-talent-first-a-or-journal")).toContain('<span class="publication-talent-icon" aria-hidden="true">🏅</span>');
    expect(getTalentCard(html, "publication-talent-first-a-best-paper")).toContain('<span class="publication-talent-icon" aria-hidden="true">🏆</span>');
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

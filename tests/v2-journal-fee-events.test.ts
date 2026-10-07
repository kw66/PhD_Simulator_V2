import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { settleJournalPublicationFees } from "../src/core/v2-lab-publication-costs";
import { JOURNAL_PUBLICATION_FEES } from "../src/core/v2-publication-fees";
import { evaluateCoreEndings } from "../src/core/v2-ending-system";
import type { GameState, JournalTarget, Paper } from "../src/core/v2-types";

function makeState(journalTarget: JournalTarget = "pami"): GameState {
  const base = createStartedGameState("normal");
  return { ...base, selectedAdvisorName: "导师", year: 1, month: 5, totalMonths: 5, eventQueue: [],
    player: { ...base.player, money: 30, favor: 12 },
    advisorProgressState: { ...base.advisorProgressState, funding: 30 },
    fellowFinanceAccounts: { "fellow-departed": { name: "离校同学", money: 50 } },
    externalPublications: [{ ...createDraftPaper(1, 0, () => 0), id: "journal-paper", journalTarget, status: "published" }],
  };
}

describe("automatic journal publication fees", () => {
  it.each([["pami", 5], ["nmi", 10], ["nature", 20]] as const)("charges %s fee %s once across all three paper arrays", (journal, fee) => {
    expect(JOURNAL_PUBLICATION_FEES[journal]).toBe(fee);
    for (const leadAuthorId of [undefined, "player", "fellow-departed"]) {
      const state = makeState(journal);
      const paper = { ...state.externalPublications[0]!, leadAuthorId, nonFirstAuthor: leadAuthorId === "fellow-departed" };
      state.papers = [{ ...paper }];
      state.externalPublications = [{ ...paper }];
      state.fellowPapers = [{ ...paper }];
      const snapshot = structuredClone(state);
      const paid = settleJournalPublicationFees(state);
      expect(paid.advisorProgressState).toMatchObject({ funding: 30 - fee, paidJournalPaperIds: [paper.id] });
      expect(paid.player).toEqual(state.player);
      expect(paid.fellowFinanceAccounts).toEqual(state.fellowFinanceAccounts);
      expect(paid.eventQueue).toEqual([]);
      expect(paid.papers).toEqual(state.papers);
      expect(paid.externalPublications).toEqual(state.externalPublications);
      expect(paid.fellowPapers).toEqual(state.fellowPapers);
      expect(paid.log.length).toBe(state.log.length + 1);
      expect(settleJournalPublicationFees(paid)).toBe(paid);
      expect(state).toEqual(snapshot);
    }
  });

  it.each([["pami", 5], ["nmi", 10], ["nature", 20]] as const)("automatically pays %s with insufficient funds and survives exactly zero", (journal, fee) => {
    for (const funding of [0, 1, fee - 0.01, fee, fee + 0.25]) {
      const state = makeState(journal);
      state.player.money = 0;
      state.advisorProgressState.funding = funding;
      state.actionState.used = state.actionState.limit;
      const paid = settleJournalPublicationFees(state);
      expect(paid.advisorProgressState.funding).toBe(Math.round((funding - fee) * 100) / 100);
      expect(paid.advisorProgressState.paidJournalPaperIds).toEqual(["journal-paper"]);
      expect(paid.player).toEqual(state.player);
      expect(paid.fellowFinanceAccounts).toEqual(state.fellowFinanceAccounts);
      expect(paid.actionState).toEqual(state.actionState);
      expect(paid.eventQueue).toEqual([]);
      expect(evaluateCoreEndings(paid)).toMatchObject(funding < fee
        ? { phase: "finished", ending: "lab-bankrupt" } : { phase: "playing", ending: null });
    }
  });

  it("reads the journal from an archived publication and preserves payment after save/load", () => {
    const state = makeState();
    state.externalPublications[0] = { ...state.externalPublications[0]!, journalTarget: null,
      publication: { journalTarget: "nature", citations: 10, effectiveScore: 200, citationDebuffMultiplier: 1 } };
    const paid = settleJournalPublicationFees(state);
    expect(paid.advisorProgressState.funding).toBe(10);
    const restored = JSON.parse(JSON.stringify(paid)) as GameState;
    expect(settleJournalPublicationFees(restored)).toBe(restored);
  });

  it("settles distinct publications in order and stops further charges after bankruptcy", () => {
    const state = makeState();
    state.advisorProgressState.funding = 5;
    state.externalPublications = ["first", "second", "third"].map((id) => ({ ...state.externalPublications[0]!, id }));
    const paid = settleJournalPublicationFees(state);
    expect(paid.advisorProgressState).toMatchObject({ funding: -5, paidJournalPaperIds: ["first", "second"] });
    expect(paid.player).toEqual(state.player);
    expect(evaluateCoreEndings(paid).ending).toBe("lab-bankrupt");
    expect(settleJournalPublicationFees(paid)).toBe(paid);
  });

  it.each([
    { status: "draft" }, { status: "journal-reviewing" }, { journalTarget: null },
    { leadAuthorId: "lover:1" }, { nonFirstAuthor: true }, { leadAuthorId: "player", nonFirstAuthor: true },
  ] satisfies Partial<Paper>[])("does not charge ineligible publication %j", (patch) => {
    const state = makeState();
    state.externalPublications = state.externalPublications.map((paper) => ({ ...paper, ...patch }));
    expect(settleJournalPublicationFees(state)).toBe(state);
  });

  it("does not charge without an advisor, after game end, or with already negative funding", () => {
    const initial = makeState();
    const cases: GameState[] = [
      { ...initial, selectedAdvisorName: null },
      { ...initial, phase: "finished" },
      { ...initial, advisorProgressState: { ...initial.advisorProgressState, funding: -0.01 } },
      { ...initial, externalPublications: [] },
    ];
    for (const state of cases) expect(settleJournalPublicationFees(state)).toBe(state);
  });
});

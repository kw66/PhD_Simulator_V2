import { describe, expect, it, vi } from "vitest";
import { renderApp } from "../src/app/v2-render";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { discardBlockingQueueEvents } from "../src/core/v2-event-queue";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceFellowResearch } from "../src/core/v2-fellow-research";
import { resolveReadyJournalPapers } from "../src/core/v2-journal-system";
import { createDraftPaper, prepareConferenceSubmission, withdrawPaper } from "../src/core/v2-paper-rules";
import { createGrantedPublishedPaper, recordPaperAcceptances } from "../src/core/v2-publication-rules";
import { resolveDuePaperReviews, settlePublishedPaperCitations } from "../src/core/v2-publication-system";
import type { GameState, Paper } from "../src/core/v2-types";

function playingState(): GameState {
  return { ...createStartedGameState("normal"), year: 1, month: 6, totalMonths: 6, eventQueue: [], buffs: [] };
}

function readyPaper(slot: number): Paper {
  const draft = { ...createDraftPaper(1, slot, () => 0), paperSlotIndex: slot, idea: 100, experiment: 100, writing: 100 };
  return { ...prepareConferenceSubmission(draft, "C", 3, 1), reviewMonthsLeft: 0 };
}

function confirmPaper(state: GameState, paperId: string): GameState {
  let next = state;
  for (let step = 0; step < 3; step += 1) {
    const event = next.eventQueue.find((entry) => entry.discardPaperUpdates?.some((update) => update.id === paperId))!;
    expect(event).toBeDefined();
    next = dispatchAction(next, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
  }
  return next;
}

function listTitles(state: GameState, sort: "year" | "citations" = "year", index = 0): string[] {
  const html = renderApp(state, undefined, { researchSortMode: sort, currentResearchPaperIndex: index });
  return [...html.matchAll(/class="research-paper-title" title="[^"]*">([^<]*)<\/strong>/g)].map((match) => match[1]!);
}

describe("publication acceptance chronology", () => {
  it("records simultaneous conference acceptances by slot, regardless of array and confirmation order", () => {
    const first = readyPaper(0);
    const last = readyPaper(2);
    let state = resolveDuePaperReviews({ ...playingState(), papers: [last, first] }, () => 0).state;
    expect(state.papers.find((paper) => paper.id === first.id)).toMatchObject({ acceptedTotalMonths: 6, acceptedOrder: 1 });
    expect(state.papers.find((paper) => paper.id === last.id)).toMatchObject({ acceptedTotalMonths: 6, acceptedOrder: 2 });
    state = confirmPaper(state, last.id);
    state = confirmPaper(state, first.id);
    expect(state.externalPublications.map((paper) => paper.acceptedOrder)).toEqual([2, 1]);
    expect(listTitles(state)).toEqual([last.title, first.title]);
  });

  it("records journal acceptances by slot and preserves stamps during citation settlement", () => {
    const papers = [2, 0].map((slot): Paper => ({ ...readyPaper(slot), status: "journal-reviewing", target: null, journalTarget: "pami" }));
    const state = resolveReadyJournalPapers({ ...playingState(), papers }).state;
    expect(state.externalPublications.map((paper) => [paper.acceptedTotalMonths, paper.acceptedOrder])).toEqual([[6, 2], [6, 1]]);
    const settled = settlePublishedPaperCitations({ ...state, totalMonths: 7 }).state;
    expect(settled.externalPublications.map((paper) => [paper.acceptedTotalMonths, paper.acceptedOrder])).toEqual([[6, 2], [6, 1]]);
  });

  it("records coauthor acceptances after other results received in the same month", () => {
    const profile = createCustomFellowProgressProfile({ type: "peer", gender: "female", research: 10, affinity: 1, startTotalMonths: 1, name: "林青" });
    const prior = createGrantedPublishedPaper(6, 0, { target: "C", acceptedScore: 20 });
    const paper = { ...readyPaper(0), leadAuthorId: profile.id, leadAuthorName: "林青", collaborators: [{ id: "player", name: "张明" }] };
    const state = advanceFellowResearch({ ...playingState(), papers: [], externalPublications: [prior], fellowProgressState: [profile], fellowPapers: [paper] }, () => 0);
    expect(state.externalPublications.find((entry) => entry.id === paper.id)).toMatchObject({ nonFirstAuthor: true, acceptedTotalMonths: 6, acceptedOrder: 2 });
  });

  it("gives later grants and debug papers fresh orders without confusing active slots with acceptances", () => {
    const pending = recordPaperAcceptances([readyPaper(0)], 6, [])[0]!;
    const granted = createGrantedPublishedPaper(6, 0, { target: "A", acceptedScore: 30 }, [pending]);
    expect(granted.acceptedOrder).toBe(2);
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      let state = { ...playingState(), papers: [pending], externalPublications: [granted] };
      state = dispatchAction(state, "debug-add-paper", { debugPaperTarget: "A", debugPaperAuthorship: "first" });
      expect(state.externalPublications.at(-1)).toMatchObject({ acceptedTotalMonths: 6, acceptedOrder: 3 });
      state = dispatchAction(state, "debug-add-paper", { debugJournalTarget: "pami", debugPaperAuthorship: "coauthor" });
      expect(state.externalPublications.at(-1)).toMatchObject({ acceptedTotalMonths: 6, acceptedOrder: 4 });
    } finally {
      random.mockRestore();
    }
  });

  it("clears a reserved acceptance when withdrawing instead of retaining it for a later submission", () => {
    const paper = readyPaper(0);
    const state = resolveDuePaperReviews({ ...playingState(), papers: [paper] }, () => 0).state;
    const withdrawn = withdrawPaper(state, paper.id);
    expect(withdrawn.papers[0]?.acceptedTotalMonths).toBeUndefined();
    expect(withdrawn.papers[0]?.acceptedOrder).toBeUndefined();
    const discarded = discardBlockingQueueEvents(state);
    expect(discarded.papers[0]?.acceptedTotalMonths).toBeUndefined();
    expect(discarded.papers[0]?.acceptedOrder).toBeUndefined();
  });

  it("starts a fresh monthly sequence while leaving recorded acceptances unchanged", () => {
    const earlier = createGrantedPublishedPaper(5, 9, { target: "C", acceptedScore: 20 });
    const paper = recordPaperAcceptances([readyPaper(0)], 6, [earlier])[0]!;
    expect(paper).toMatchObject({ acceptedTotalMonths: 6, acceptedOrder: 1 });
    expect(recordPaperAcceptances([paper], 7, [earlier])[0]).toBe(paper);
  });

  it("does not record acceptance metadata for a rejected result", () => {
    const paper = { ...readyPaper(0), submittedIdea: 0, submittedExperiment: 0, submittedWriting: 0 };
    const state = resolveDuePaperReviews({ ...playingState(), papers: [paper] }, () => 0).state;
    expect(state.papers[0]?.acceptedTotalMonths).toBeUndefined();
    expect(state.papers[0]?.acceptedOrder).toBeUndefined();
  });

  it("sorts same-year results by acceptance month then receipt order rather than citations", () => {
    const papers = [1, 2, 3].map((order) => ({
      ...createGrantedPublishedPaper(5, order - 1, { target: "C", acceptedScore: 30, title: `paper-${order}` }),
      submittedYear: 1, submittedMonth: 3,
    }));
    papers[0] = { ...papers[0]!, acceptedTotalMonths: 6, acceptedOrder: 1, nonFirstAuthor: true };
    papers[1]!.publication!.citations = 999;
    const state = { ...playingState(), papers: [], externalPublications: papers };
    expect(listTitles(state)).toEqual(["paper-1", "paper-3", "paper-2"]);
    expect(listTitles(state, "citations")[0]).toBe("paper-2");
    expect(listTitles({ ...state, externalPublications: [papers[2]!, papers[1]!, papers[0]!] })).toEqual(["paper-1", "paper-3", "paper-2"]);
  });

  it("keeps venue year as the first sorting key and applies chronology across pagination", () => {
    const papers = Array.from({ length: 7 }, (_, index) => ({
      ...createGrantedPublishedPaper(6, index, { target: "C", acceptedScore: 30, title: `paper-${index}` }),
      submittedYear: index === 0 ? 2 : 1, submittedMonth: 3,
    }));
    const state = { ...playingState(), papers: [], externalPublications: papers };
    expect(listTitles(state)).toEqual(["paper-0", "paper-6", "paper-5", "paper-4", "paper-3"]);
    expect(listTitles(state, "year", 5)).toEqual(["paper-2", "paper-1"]);
  });

  it("keeps an event-granted paper in its acceptance year after the calendar advances", () => {
    const granted = createGrantedPublishedPaper(1, 0, { target: "C", acceptedScore: 20, title: "older-grant" });
    const newer = { ...createGrantedPublishedPaper(12, 1, { target: "C", acceptedScore: 20, title: "newer-conference" }), submittedMonth: 6, submittedYear: 1 };
    const state = { ...playingState(), year: 3, month: 6, totalMonths: 30, papers: [], externalPublications: [newer, granted] };
    expect(listTitles(state)).toEqual(["newer-conference", "older-grant"]);
    const html = renderApp(state);
    const row = html.match(/<button\s+class="research-paper-row[\s\S]*?older-grant[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(row).toContain("2023");
  });
});

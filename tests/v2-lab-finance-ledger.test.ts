import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createGrantedPublishedPaper } from "../src/core/v2-publication-rules";
import { getLabFinanceMonthSummary, recordLabFinance } from "../src/core/v2-lab-finance-ledger";
import { settleConferenceRegistrationFees, settleJournalPublicationFees } from "../src/core/v2-lab-publication-costs";
import { createJournalFeeEvent } from "../src/core/v2-journal-fee-events";
import { createConferenceDecisionAct1 } from "../src/core/v2-conference-events";
import type { GameState, Paper } from "../src/core/v2-types";

function readyState(): GameState {
  const state = createStartedGameState("normal");
  return { ...state, selectedAdvisorName: "导师", totalMonths: 4, month: 4, year: 1, eventQueue: [],
    player: { ...state.player, money: 100, favor: 12 },
    advisorProgressState: { ...state.advisorProgressState, funding: 100 } };
}

function published(index: number, patch: Partial<Paper> = {}): Paper {
  return { ...createGrantedPublishedPaper(4, index, { target: "A", acceptedScore: 60 }),
    submittedMonth: 1, submittedYear: 1, conferenceHandled: false, ...patch };
}

function choose(state: GameState, chainId: string, choiceId?: string): GameState {
  const event = state.eventQueue.find((entry) => entry.chainId === chainId)!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choiceId ?? event.choices[0]!.id });
}

describe("monthly lab finance ledger", () => {
  it("aggregates actual categories, drops zeros, persists and resets for the new month", () => {
    const initial = readyState();
    let state = recordLabFinance(initial, "horizontal-income", 50);
    state = recordLabFinance(state, "labor", -2.5);
    state = recordLabFinance(state, "labor", -2.5);
    state = recordLabFinance(state, "conference-travel", -2);
    state = recordLabFinance(state, "conference-travel", 2);
    expect(getLabFinanceMonthSummary(state)).toEqual({ net: 45, items: [
      { label: "劳务费", amount: -5 }, { label: "横向收入", amount: 50 },
    ] });
    expect(initial.labFinanceLedger).toBeUndefined();
    expect(state.advisorProgressState.funding).toBe(100);
    expect(getLabFinanceMonthSummary(JSON.parse(JSON.stringify(state)))).toEqual(getLabFinanceMonthSummary(state));
    const nextMonth = { ...state, totalMonths: 5 };
    expect(getLabFinanceMonthSummary(nextMonth)).toEqual({ net: 0, items: [] });
    expect(getLabFinanceMonthSummary(recordLabFinance(nextMonth, "student-wages", -1.5))).toEqual({
      net: -1.5, items: [{ label: "学生工资", amount: -1.5 }],
    });
  });

  it("records player and fellow registration once, excluding non-first-author papers", () => {
    const initial = { ...readyState(), papers: [published(0), published(1, { nonFirstAuthor: true })],
      fellowPapers: [published(2, { leadAuthorId: "fellow-1", nonFirstAuthor: true })] };
    const state = settleConferenceRegistrationFees(initial);
    expect(state.advisorProgressState.funding).toBe(98);
    expect(getLabFinanceMonthSummary(state)).toEqual({ net: -2, items: [{ label: "论文注册", amount: -2 }] });
    expect(getLabFinanceMonthSummary(settleConferenceRegistrationFees(state))).toEqual(getLabFinanceMonthSummary(state));
  });

  it("records automatic fellow journal fees only once", () => {
    const initial = { ...readyState(), fellowPapers: [published(0, { target: null, journalTarget: "nmi", leadAuthorId: "fellow-1" })] };
    const state = settleJournalPublicationFees(initial);
    expect(state.advisorProgressState.funding).toBe(90);
    expect(getLabFinanceMonthSummary(state)).toEqual({ net: -10, items: [{ label: "期刊版面费", amount: -10 }] });
    expect(getLabFinanceMonthSummary(settleJournalPublicationFees(state))).toEqual(getLabFinanceMonthSummary(state));
  });

  it.each(["self", "advisor"] as const)("records player journal payment only after %s confirmation", (mode) => {
    let state = { ...readyState(), externalPublications: [published(0, { target: null, journalTarget: "pami" })] };
    const event = createJournalFeeEvent(state, state.externalPublications[0]!)!;
    state.eventQueue = [createEventQueueItem(event, 1)];
    state = choose(choose(state, event.chainId!), event.chainId!, mode);
    expect(getLabFinanceMonthSummary(state).items).toEqual([]);
    const confirmation = state.eventQueue.find((entry) => entry.chainId === event.chainId)!;
    state = choose(state, event.chainId!);
    expect(getLabFinanceMonthSummary(state).net).toBe(mode === "advisor" ? -5 : 0);
    expect(getLabFinanceMonthSummary(state).items).toEqual(mode === "advisor" ? [{ label: "期刊版面费", amount: -5 }] : []);
    const replay = dispatchAction(state, "resolve-event", { eventId: confirmation.id, eventChoiceId: "confirm" });
    expect(replay.labFinanceLedger).toEqual(state.labFinanceLedger);
  });

  it.each(["self", "advisor", "proxy"] as const)("records only actual lab travel on %s confirmation", (mode) => {
    let state = readyState();
    const event = createConferenceDecisionAct1({ id: "test-trip", conferenceName: "CVPR", conferenceYear: 2024,
      city: "测试城市", country: "中国", grade: "A", region: "domestic", paperCount: 1, paperIds: ["missing"],
      availableAtTotalMonths: 7 }, {
      ...state, favor: state.player.favor, research: state.player.research, social: state.player.social,
      money: state.player.money, advisorFunding: state.advisorProgressState.funding,
    }, () => 0.5);
    state.eventQueue = [createEventQueueItem(event, 1)];
    state = choose(choose(state, event.chainId!), event.chainId!, mode);
    expect(getLabFinanceMonthSummary(state).items).toEqual([]);
    state = choose(state, event.chainId!);
    expect(getLabFinanceMonthSummary(state)).toEqual(mode === "advisor"
      ? { net: -2, items: [{ label: "论文差旅", amount: -2 }] } : { net: 0, items: [] });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import type { GameState } from "../src/core/v2-types";

function makeState(month = 12): GameState {
  const base = createStartedGameState("normal");
  return {
    ...base,
    year: 1, month, totalMonths: month,
    selectedAdvisorName: "测试导师", playerName: "林青",
    availableRandomEvents: [], eventQueue: [], buffs: [],
    papers: [], externalPublications: [], fellowPapers: [],
    illnessProbability: 0,
    player: { san: 20, research: 6, social: 5, favor: 5, money: 20 },
    loverState: { ...base.loverState, active: true, name: "周明", type: "smart", startTotalMonths: month },
    loverProgressState: { ...base.loverProgressState, active: true, research: 6, intimacy: 1 },
    fellowProgressState: [6, 6, 10].map((research, index) => ({
      ...createCustomFellowProgressProfile({
        type: "peer", gender: "female", name: `同学${index}`, research,
        affinity: 1, startTotalMonths: index === 1 ? month : 1, academicYear: 1, degree: "master",
      }),
      id: `fellow-${index}`,
    })),
    relationshipState: { ...base.relationshipState, advisorCount: 1, peerCount: 3, occupiedSlots: 3 },
  };
}

function inheritanceHistory(state: GameState) {
  return state.eventHistory.filter((entry) => entry.id.startsWith("talent:inheritance:"));
}

function inheritanceLogs(state: GameState) {
  return state.log.filter((entry) => entry.id.startsWith("talent:annual-research:group:"));
}

function expectNoInheritance(state: GameState): void {
  expect(state.player.research).toBe(6);
  expect(state.fellowProgressState.map((profile) => profile.research)).toEqual([6, 6, 10]);
  expect(state.fellowProgressState.every((profile) => profile.lastAnnualGrowthTotalMonths === undefined)).toBe(true);
  expect(inheritanceHistory(state)).toEqual([]);
  expect(inheritanceLogs(state)).toEqual([]);
  expect(state.loverProgressState.research).toBe(6);
  expect(state.loverProgressState.lastAnnualGrowthTotalMonths).toBeUndefined();
  expect(state.eventHistory.some((entry) => entry.id.startsWith("talent:annual-research:lover:"))).toBe(false);
}

function expectNoPublications(state: GameState): void {
  expect([...state.papers, ...state.externalPublications, ...(state.fellowPapers ?? [])]
    .some((paper) => paper.status === "published")).toBe(false);
}

beforeEach(() => vi.spyOn(Math, "random").mockReturnValue(0.99));
afterEach(() => vi.restoreAllMocks());

describe("lab inheritance calendar through the dispatcher", () => {
  it("does not settle inheritance when July advances into August", () => {
    const august = dispatchAction(makeState(11), "next-month");

    expect(august).toMatchObject({ phase: "playing", year: 1, month: 12, totalMonths: 12 });
    expectNoInheritance(august);
    expectNoPublications(august);
  });

  it("closes the first August using one player-and-fellow snapshot and attributes all rewards to August", () => {
    const august = makeState();
    const september = dispatchAction(august, "next-month");

    expect(september).toMatchObject({ phase: "playing", year: 2, month: 1, totalMonths: 13 });
    expect(september.player.research).toBe(6 + 0.75);
    expect(september.loverProgressState).toMatchObject({ research: 6 + 2 * 0.75, lastAnnualGrowthTotalMonths: 12 });
    const loverHistory = september.eventHistory.filter((entry) => entry.id.startsWith("talent:annual-research:lover:"));
    expect(loverHistory).toHaveLength(1);
    expect(loverHistory[0]).toMatchObject({ completedAtTotalMonths: 12, completedAtMonth: 12, completedAtYear: 1 });
    expect(loverHistory[0]!.stages[0]!.talentTrigger).toMatchObject({
      recipient: "周明", effects: ["科研 +1.5（6→7.5，抵抗0.5）"], details: ["原始奖励：自然成长 +2；逐点抵抗并受科研上限限制"],
    });
    expect(september.log.some((entry) => entry.eventHistoryId === loverHistory[0]!.id)).toBe(false);
    expect(september.loverProgressState.annualResearchActivity)
      .toBe("第1学年末：科研 +1.5（6→7.5，抵抗0.5）；原始奖励：自然成长 +2");
    expect(september.loverProgressState.monthlyActivity).toContain("学习进度");
    expect(september.fellowProgressState.map((profile) => profile.research)).toEqual([8.25, 8.25, 11.5]);
    expect(september.fellowProgressState.map((profile) => profile.annualResearchGrowthTotal ?? 0)).toEqual([2.25, 2.25, 1.5]);
    expect(september.fellowProgressState.every((profile) => profile.lastAnnualGrowthTotalMonths === 12)).toBe(true);
    const history = inheritanceHistory(september);
    expect(history.map((entry) => entry.id).sort()).toEqual([
      "talent:inheritance:fellow-0:12", "talent:inheritance:fellow-1:12",
      "talent:inheritance:fellow-2:12", "talent:inheritance:player:12",
    ]);
    expect(history.every((entry) => entry.completedAtTotalMonths === 12
      && entry.completedAtYear === 1 && entry.completedAtMonth === 12)).toBe(true);
    expect(history.map((entry) => entry.stages[0]!.talentTrigger)).toEqual([
      ...["同学0", "同学1"].map((recipient) => expect.objectContaining({
        recipient, reason: "第1学年结束，结算年度科研成长", effects: ["科研 +2.25（6→8.25，抵抗0.75）"],
        details: ["原始奖励：自然成长 +2，实验室传承 +1，合计 +3；合并后逐点抵抗并受科研上限限制"],
      })),
      expect.objectContaining({ recipient: "同学2", effects: ["科研 +1.5（10→11.5，抵抗0.5）"] }),
      expect.objectContaining({ recipient: "你·林青", reason: "第1学年结束，结算年度科研成长", effects: ["科研 +0.75（6→6.75，抵抗0.25）"] }),
    ]);
    const logs = inheritanceLogs(september);
    expect(logs).toHaveLength(1);
    expect(logs.every((entry) => entry.month === 12 && entry.eventHistoryId === entry.id)).toBe(true);
    expect(september.log.some((entry) => entry.id.startsWith("talent:inheritance:"))).toBe(false);
    for (const name of ["同学0", "同学1", "同学2", "你·林青", "周明"]) expect(logs[0]!.text).toContain(name);
    expect(september.eventHistory.find((entry) => entry.id === logs[0]!.eventHistoryId))
      .toMatchObject({ completedAtYear: 1, completedAtMonth: 12, completedAtTotalMonths: 12 });
    expect(september.fellowProgressState[0]!.annualResearchActivity)
      .toBe("第1学年末：科研 +2.25（6→8.25，抵抗0.75）；原始奖励：自然成长 +2、传承 +1");
    expect(september.fellowProgressState[0]!.monthlyActivity).toBeTruthy();
    expectNoPublications(september);
    expectNoInheritance(august);
  });

  it("does not settle inheritance while an August decision blocks the next-month action", () => {
    const august = makeState();
    august.eventQueue = [createEventQueueItem({
      id: "august-decision", chainId: "august-decision", title: "八月待办", description: "选择后才能结束本月。",
      source: "system", stage: "act2", blocking: true, deadlineMonths: 0,
      choices: [
        { id: "confirm", label: "确认", outcome: "已确认", effects: {} },
        { id: "decline", label: "取消", outcome: "已取消", effects: {} },
      ],
    }, 1)];

    const blocked = dispatchAction(august, "next-month");

    expect(blocked).toMatchObject({ phase: "playing", year: 1, month: 12, totalMonths: 12 });
    expect(blocked.eventQueue).toEqual(august.eventQueue);
    expectNoInheritance(blocked);
    expectNoPublications(blocked);
  });

  it("performs an ordinary August action without settling inheritance", () => {
    const august = makeState();
    const worked = dispatchAction(august, "part-time-work");

    expect(worked).toMatchObject({ phase: "playing", year: 1, month: 12, totalMonths: 12 });
    expect(worked.actionState.used).toBe(august.actionState.used + 1);
    expect(worked.partTimeWorkCount).toBe(august.partTimeWorkCount + 1);
    expect(worked.player.money).toBeGreaterThan(august.player.money);
    expectNoInheritance(worked);
    expectNoPublications(worked);
  });

  it("does not repeat August inheritance during September actions or when September closes", () => {
    const september = dispatchAction(makeState(), "next-month");
    const worked = dispatchAction(september, "part-time-work");
    const october = dispatchAction({ ...worked, eventQueue: [], availableRandomEvents: [] }, "next-month");

    expect(worked).toMatchObject({ phase: "playing", year: 2, month: 1, totalMonths: 13 });
    expect(worked.actionState.used).toBe(september.actionState.used + 1);
    expect(october).toMatchObject({ phase: "playing", year: 2, month: 2, totalMonths: 14 });
    expect(inheritanceHistory(september)).toHaveLength(4);
    for (const current of [worked, october]) {
      expect(current.player.research).toBe(6.75);
      expect(current.loverProgressState).toMatchObject({ research: 7.5, lastAnnualGrowthTotalMonths: 12 });
      expect(current.eventHistory.filter((entry) => entry.id.startsWith("talent:annual-research:lover:")))
        .toEqual(september.eventHistory.filter((entry) => entry.id.startsWith("talent:annual-research:lover:")));
      expect(current.fellowProgressState.map((profile) => profile.research)).toEqual([8.25, 8.25, 11.5]);
      expect(current.fellowProgressState.every((profile) => profile.lastAnnualGrowthTotalMonths === 12)).toBe(true);
      expect(inheritanceHistory(current)).toEqual(inheritanceHistory(september));
      expect(inheritanceLogs(current)).toEqual(inheritanceLogs(september));
      expect(current.fellowProgressState.map((profile) => profile.annualResearchActivity))
        .toEqual(september.fellowProgressState.map((profile) => profile.annualResearchActivity));
      expect(current.loverProgressState.annualResearchActivity).toBe(september.loverProgressState.annualResearchActivity);
      expectNoPublications(current);
    }
  });
});

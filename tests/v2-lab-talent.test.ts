import { describe, expect, it, vi } from "vitest";

import { getFellowAnnualResearchGrowth, getFellowPublicationTotals, getPlayerAnnualResearchGrowth, settleFellowCoauthoredPapers, settleLabResearchGrowth } from "../src/core/v2-lab-talent";
import { applyPublicationTalentRewards } from "../src/core/v2-publication-talent";
import { submitJournalPaper } from "../src/core/v2-journal-system";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceFellowResearch } from "../src/core/v2-fellow-research";
import { createDraftPaper, prepareConferenceSubmission } from "../src/core/v2-paper-rules";
import { previewResearchOperation } from "../src/core/v2-research-operation";
import { renderApp } from "../src/app/v2-render";
import type { GameState, Paper, PaperTarget } from "../src/core/v2-types";

function makeState(research = [2, 6, 9], starts = [1, 1, 1]): GameState {
  const base = createStartedGameState("normal");
  return {
    ...base, totalMonths: 12, month: 12, year: 1, eventQueue: [],
    player: { ...base.player, research: 8 },
    fellowProgressState: research.map((value, index) => ({
      ...createCustomFellowProgressProfile({ type: "peer", gender: "female", research: value, affinity: 1, startTotalMonths: starts[index] ?? 1 }),
      id: `fellow-${index}`, name: `同学${index}`,
    })),
  };
}

function published(fellowId: string, target: PaperTarget): Paper {
  return { ...createDraftPaper(1, 0, () => 0), id: `${fellowId}-${target}`, leadAuthorId: fellowId, target, status: "published" };
}

describe("lab annual growth", () => {
  it("caps inherited research at twenty and preserves it in later years", () => {
    const state = makeState([19, 20, 20, 20]);
    state.player.research = 30;
    const next = settleLabResearchGrowth(state, () => 0.99);
    expect(next.fellowProgressState.map((profile) => profile.research)).toEqual([20, 20, 20, 20]);
    expect(settleLabResearchGrowth({ ...next, totalMonths: 24, year: 2 }, () => 0.99).fellowProgressState.map((profile) => profile.research)).toEqual([20, 20, 20, 20]);
  });

  it("counts the mentor once plus strictly stronger player and fellows, excluding the lover", () => {
    const state = makeState([2, 6, 9, 2]);
    state.loverProgressState.research = 100;
    state.loverState.active = true;
    expect(state.fellowProgressState.map((profile) => getFellowAnnualResearchGrowth(state, profile))).toEqual([2, 1, 0, 2]);
    expect(getPlayerAnnualResearchGrowth(state)).toBe(1);
    state.player.research = 2;
    expect(getFellowAnnualResearchGrowth(state, state.fellowProgressState[0]!)).toBe(1);
    expect(getPlayerAnnualResearchGrowth(state)).toBe(1);
    state.player.research = 9;
    expect(getPlayerAnnualResearchGrowth(state)).toBe(0);
  });

  it("is active without a senior/junior pair and leaves the mentor unchanged", () => {
    const state = makeState([2]);
    const next = settleLabResearchGrowth(state);
    expect(next.fellowProgressState[0]!.research).toBe(5);
    expect(next.player).toEqual(state.player);
    expect(next.advisorProgressState).toEqual(state.advisorProgressState);
  });

  it.each([1, 11, 13, 14, 23, 25])("does not grow outside the end of an academic year at month %s", (totalMonths) => {
    const state = { ...makeState(), totalMonths, month: (totalMonths - 1) % 12 + 1, year: Math.floor((totalMonths - 1) / 12) + 1 };
    expect(settleLabResearchGrowth(state)).toBe(state);
  });

  it("does not settle before play or at a nonpositive elapsed month", () => {
    for (const state of [{ ...makeState(), phase: "finished" as const }, { ...makeState(), totalMonths: 0 }, { ...makeState(), totalMonths: -12 }]) {
      const random = vi.fn(() => 0.99);
      expect(settleLabResearchGrowth(state, random)).toBe(state);
      expect(random).not.toHaveBeenCalled();
    }
  });

  it("settles the school year for all fellows and never repeats within a month", () => {
    const state = makeState([2, 6, 9], [1, 12, 1]);
    const next = settleLabResearchGrowth(state, () => 0.99);
    expect(next.fellowProgressState.map((profile) => profile.research)).toEqual([6, 9, 11]);
    expect(next.player.research).toBe(9);
    expect(next.fellowProgressState.every((profile) => profile.lastAnnualGrowthTotalMonths === 12)).toBe(true);
    expect(next.eventHistory.find((entry) => entry.id === "talent:inheritance:player:12"))
      .toMatchObject({ completedAtTotalMonths: 12, completedAtYear: 1, completedAtMonth: 12 });
    expect(settleLabResearchGrowth(next)).toBe(next);
    const later = settleLabResearchGrowth({ ...next, totalMonths: 14, month: 2 });
    expect(later.fellowProgressState.map((profile) => profile.research)).toEqual([6, 9, 11]);
    expect(settleLabResearchGrowth({ ...later, totalMonths: 24, year: 2, month: 12 }, () => 0.99).fellowProgressState[0]!.research).toBe(10);
    const restored = JSON.parse(JSON.stringify(next)) as GameState;
    const random = vi.fn(() => 0.99);
    expect(settleLabResearchGrowth(restored, random)).toBe(restored);
    expect(random).not.toHaveBeenCalled();
  });

  it("uses simultaneous values so reversing the roster cannot change growth", () => {
    const state = makeState([2, 2, 9]);
    state.player.research = 2;
    const forward = settleLabResearchGrowth(state, () => 0.99);
    const reversed = settleLabResearchGrowth({ ...state, fellowProgressState: [...state.fellowProgressState].reverse() }, () => 0.99);
    expect(forward.fellowProgressState.map((profile) => profile.research)).toEqual([5, 5, 11]);
    expect(forward.player.research).toBe(3);
    expect(reversed.player).toEqual(forward.player);
    expect(reversed.fellowProgressState.reverse()).toEqual(forward.fellowProgressState);
    expect(state.player.research).toBe(2);
    expect(state.fellowProgressState.map((profile) => profile.research)).toEqual([2, 2, 9]);
  });

  it("resists each recipient point by point using their own tier", () => {
    const state = makeState([5, 10, 10, 2]);
    state.player.research = 5;
    const next = settleLabResearchGrowth(state, () => 0.1);
    expect(next.player.research).toBe(6);
    expect(next.fellowProgressState.map((profile) => profile.research)).toEqual([6, 10, 10, 6]);
    expect(next.fellowProgressState.map((profile) => profile.annualResearchGrowthTotal ?? 0)).toEqual([1, 0, 0, 4]);
  });

  it("uses the player's own research cap for previews and settlement", () => {
    const state = makeState([10, 10, 10]);
    state.player.research = 8;
    state.researchCapacityState.baseCap = 8;
    state.researchCapacityState.otherCapBonus = 1;
    expect(getPlayerAnnualResearchGrowth(state)).toBe(1);
    const next = settleLabResearchGrowth(state, () => 0.99);
    expect(next.player.research).toBe(9);
    expect(getPlayerAnnualResearchGrowth(next)).toBe(0);
  });

  it("combines natural and inheritance rewards before crossing a resistance tier", () => {
    const state = makeState([5]);
    const next = settleLabResearchGrowth(state, () => 0.1);
    expect(getFellowAnnualResearchGrowth(state, state.fellowProgressState[0]!)).toBe(1);
    expect(next.fellowProgressState[0]).toMatchObject({ research: 6, annualResearchGrowthTotal: 1 });
    expect(next.fellowProgressState[0]!.annualResearchActivity)
      .toBe("第1学年末：科研 +1（5→6，抵抗2）；原始奖励：自然成长 +2、传承 +1");
    expect(next.player.research).toBe(8);
    const records = next.eventHistory.filter((entry) => entry.id === "talent:inheritance:fellow-0:12");
    expect(records).toHaveLength(1);
    expect(records[0]!.stages[0]!.talentTrigger).toMatchObject({
      effects: ["科研 +1（5→6，抵抗2）"],
      details: ["原始奖励：自然成长 +2，实验室传承 +1，合计 +3；合并后逐点抵抗并受科研上限限制"],
    });
  });

  it.each([[5, 0.1, 6], [6, 0, 6], [19, 0.99, 20], [20, 0.99, 20]])
    ("settles lover natural growth from %s with roll %s to %s exactly once", (research, roll, expected) => {
      const state = makeState([10, 10, 10]);
      state.loverState = { ...state.loverState, active: true, name: "周明", startTotalMonths: 12 };
      state.loverProgressState = { ...state.loverProgressState, active: true, research };
      const next = settleLabResearchGrowth(state, () => roll);
      expect(next.loverProgressState).toMatchObject({ research: expected, lastAnnualGrowthTotalMonths: 12 });
      const history = next.eventHistory.filter((entry) => entry.id.startsWith("talent:annual-research:lover:"));
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ completedAtTotalMonths: 12, completedAtMonth: 12, completedAtYear: 1 });
      expect(history[0]!.stages[0]!.talentTrigger).toMatchObject({
        name: "年度科研成长", recipient: "周明", details: ["原始奖励：自然成长 +2；逐点抵抗并受科研上限限制"],
        effects: [research >= 19 ? `科研 +2（${research}→20）`
          : research === 5 ? "科研 +1（5→6，抵抗1）" : "科研 +0（6→6，抵抗2）"],
      });
      const restored = JSON.parse(JSON.stringify(next)) as GameState;
      const random = vi.fn(() => 0.99);
      expect(settleLabResearchGrowth(restored, random)).toBe(restored);
      expect(random).not.toHaveBeenCalled();
      const nextYear = settleLabResearchGrowth({ ...next, year: 2, totalMonths: 24 }, () => 0.99);
      expect(nextYear.loverProgressState).toMatchObject({ research: Math.min(20, expected + 2), lastAnnualGrowthTotalMonths: 24 });
    });

  it("gives the lover only natural growth and excludes them from every inheritance count", () => {
    const state = makeState([6, 10]);
    state.player.research = 6;
    const baseline = settleLabResearchGrowth(state, () => 0.99);
    expect(baseline.loverProgressState).toBe(state.loverProgressState);
    for (const research of [1, 19]) {
      const next = settleLabResearchGrowth({ ...state,
        loverState: { ...state.loverState, active: true, startTotalMonths: 12 },
        loverProgressState: { ...state.loverProgressState, active: true, research },
      }, () => 0.99);
      expect(next.player).toEqual(baseline.player);
      expect(next.fellowProgressState).toEqual(baseline.fellowProgressState);
      expect(next.loverProgressState.research).toBe(Math.min(20, research + 2));
    }
  });

  it("uses the lover marker even when only the lover remains to settle", () => {
    const settled = settleLabResearchGrowth(makeState([]), () => 0.99);
    const joined = { ...settled,
      loverState: { ...settled.loverState, active: true, startTotalMonths: 12 },
      loverProgressState: { ...settled.loverProgressState, active: true, research: 3 },
    };
    const next = settleLabResearchGrowth(joined, () => 0.99);
    expect(next.loverProgressState.research).toBe(5);
    expect(next.log.filter((entry) => entry.id === "talent:annual-research:group:12")).toHaveLength(1);
    expect(next.eventHistory.filter((entry) => entry.id === "talent:annual-research:group:12")).toHaveLength(1);
    expect(next.eventHistory.find((entry) => entry.id === "talent:annual-research:group:12")!.stages[0]!.talentTrigger!.effects).toHaveLength(2);
    const withoutHistory = { ...next, eventHistory: next.eventHistory.filter((entry) => !entry.id.startsWith("talent:annual-research:lover:")) };
    expect(settleLabResearchGrowth(withoutHistory, () => 0.99)).toBe(withoutHistory);
  });

  it.each([[false, false], [true, false], [false, true]])
    ("does not grow a lover with relationship active %s and progress active %s", (relationshipActive, progressActive) => {
      const settled = settleLabResearchGrowth(makeState([]), () => 0.99);
      const state = { ...settled,
        loverState: { ...settled.loverState, active: relationshipActive, startTotalMonths: 12 },
        loverProgressState: { ...settled.loverProgressState, active: progressActive, research: 3 },
      };
      const random = vi.fn(() => 0.99);
      expect(settleLabResearchGrowth(state, random)).toBe(state);
      expect(random).not.toHaveBeenCalled();
      expect(state.loverProgressState.lastAnnualGrowthTotalMonths).toBeUndefined();
      expect(state.eventHistory.some((entry) => entry.id.startsWith("talent:annual-research:lover:"))).toBe(false);
    });

  it("keeps actual capped activity separate from nominal group rewards and replaces it next year", () => {
    const state = makeState([20]);
    state.player.research = 20;
    state.log = [{ id: "existing", month: 12, text: "已有日志" }];
    state.loverState = { ...state.loverState, active: true, name: "周明", startTotalMonths: 12 };
    state.loverProgressState = { ...state.loverProgressState, active: true, research: 20 };
    let draw = 0;
    const next = settleLabResearchGrowth(state, () => draw++ % 2 === 0 ? 0 : 0.99);
    const activity = "第1学年末：科研 +0（20→20，抵抗1，上限）；原始奖励：自然成长 +2";
    expect(next.fellowProgressState[0]!.annualResearchActivity).toBe(`${activity}、传承 +0`);
    expect(next.loverProgressState.annualResearchActivity).toBe(activity);
    expect(next.log).toHaveLength(2);
    expect(next.log[1]).toBe(state.log[0]);
    expect(next.log[0]!.text).toContain("同学0：科研 +2（20→20）");
    expect(next.log[0]!.text).toContain("周明：科研 +2（20→20）");
    const restored = JSON.parse(JSON.stringify(next)) as GameState;
    expect(settleLabResearchGrowth(restored, () => 0.99)).toBe(restored);
    const later = settleLabResearchGrowth({ ...next, year: 2, totalMonths: 24 }, () => 0.99);
    expect(later.log.filter((entry) => entry.id.startsWith("talent:annual-research:group:"))).toHaveLength(2);
    expect(later.fellowProgressState[0]!.annualResearchActivity).toBe("第2学年末：科研 +0（20→20，上限）；原始奖励：自然成长 +2、传承 +0");
    expect(later.loverProgressState.annualResearchActivity).toBe("第2学年末：科研 +0（20→20，上限）；原始奖励：自然成长 +2");
  });

  it("claims zero and fully resisted player rewards once without needing any fellow reward", () => {
    for (const state of [makeState([]), makeState([10])]) {
      state.fellowProgressState = state.fellowProgressState.map((profile) => ({ ...profile, lastAnnualGrowthTotalMonths: 12 }));
      const next = settleLabResearchGrowth(state, () => 0);
      expect(next.player.research).toBe(8);
      expect(next.eventHistory.some((entry) => entry.id === "talent:inheritance:player:12")).toBe(true);
      const random = vi.fn(() => 0.99);
      expect(settleLabResearchGrowth(next, random)).toBe(next);
      expect(random).not.toHaveBeenCalled();
    }
  });

  it("leaves annual settlement to the engine after monthly research and help", () => {
    const state = makeState([2]);
    const fellow = { ...state.fellowProgressState[0]!, taskProgress: 99 };
    const draft = { ...createDraftPaper(1, 0, () => 0), leadAuthorId: fellow.id, createdTotalMonths: 1 };
    const next = advanceFellowResearch({ ...state, fellowProgressState: [fellow], fellowPapers: [draft] }, () => 0);
    expect(next.fellowProgressState[0]).toMatchObject({ research: 2, pendingHelpToPlayer: 2 });
    expect(next.fellowProgressState[0]!.lastAnnualGrowthTotalMonths).toBeUndefined();
    expect(next.fellowPapers![0]).toMatchObject({ idea: 8, experiment: 1 });
    expect(advanceFellowResearch(next, () => 0)).toBe(next);
    const settled = settleLabResearchGrowth(next, () => 0.99);
    expect(settled.fellowProgressState[0]).toMatchObject({ research: 5, pendingHelpToPlayer: 2, lastAnnualGrowthTotalMonths: 12 });
    expect(settled.fellowPapers).toBe(next.fellowPapers);
  });

  it("no longer grants a team-size bonus to player research operations", () => {
    const base = makeState();
    const fullLab = { ...base, relationshipState: { ...base.relationshipState, advisorCount: 1, seniorCount: 1, juniorCount: 1, occupiedSlots: 2 } };
    for (const action of ["idea", "experiment", "writing"] as const) {
      expect(previewResearchOperation(fullLab, action, 2).scoreBonus).toBe(previewResearchOperation(base, action, 2).scoreBonus);
    }
  });
});

describe("fellow publication settlement", () => {
  it.each([false, true])("acceptance only grows affinity when the player collaborated: %s", (collaborated) => {
    const state = { ...makeState([2]), totalMonths: 6, month: 6, year: 1 };
    const paper = prepareConferenceSubmission({ ...createDraftPaper(1, 0, () => 0), idea: 100, experiment: 100, writing: 100,
      leadAuthorId: "fellow-0", createdTotalMonths: 1,
      collaborators: collaborated ? [{ id: "player", name: "你" }] : [],
    }, "A", 3, 1);
    const next = advanceFellowResearch({ ...state, fellowPapers: [{ ...paper, reviewMonthsLeft: 1 }] }, () => 0);
    expect(next.fellowProgressState[0]!.research).toBe(2);
    expect(next.fellowProgressState[0]!.affinity).toBe(collaborated ? 2 : 1);
    expect(next.fellowProgressState[0]!.affinityRewardedPaperIds).toEqual(collaborated ? [paper.id] : []);
    const destination = collaborated ? next.externalPublications : next.fellowPapers!;
    expect(destination.some((entry) => entry.id === paper.id && entry.status === "published")).toBe(true);
    expect(advanceFellowResearch(next, () => 0)).toBe(next);
  });

});

describe("coauthored paper talent", () => {
  it("counts published person-times in both directions without copies, draft help or advisor/lover credit", () => {
    const state = makeState([2, 6]);
    const playerPaper: Paper = {
      ...published("fellow-0", "A"), id: "player-led", leadAuthorId: undefined,
      collaborators: [
        { id: "fellow-0", name: "同学0" }, { id: "fellow-1", name: "同学1" },
        { id: "fellow-1", name: "同学1" }, { id: "advisor", name: "导师" }, { id: "lover:1", name: "恋人" },
      ],
    };
    const fellowPaper = { ...published("fellow-0", "B"), collaborators: [{ id: "player", name: "你" }] };
    state.papers = [playerPaper, { ...playerPaper, id: "draft", status: "draft" }];
    state.externalPublications = [playerPaper, { ...fellowPaper, nonFirstAuthor: true }];
    state.fellowPapers = [fellowPaper, published("fellow-1", "C")];
    state.fellowProgressState[0]!.helpedPlayerCount = 50;
    state.fellowProgressState[1]!.helpedFellowCount = 20;
    expect(getFellowPublicationTotals(state)).toEqual({ playerLed: 2, fellowLed: 1 });
    const settled = settleFellowCoauthoredPapers(state);
    expect(settled.fellowProgressState.map((profile) => profile.affinity)).toEqual([3, 2]);
    expect(getFellowPublicationTotals({ ...settled, fellowProgressState: [] })).toEqual({ playerLed: 2, fellowLed: 1 });
    expect(getFellowPublicationTotals({ ...state, fellowProgressState: [], fellowPapers: [], papers: [], externalPublications: [fellowPaper] }))
      .toEqual({ playerLed: 0, fellowLed: 1 });
    const html = renderApp(settled, undefined, { activePlayTab: "talent", activeTalentTab: "relation" });
    const card = html.split('data-talent-item-id="fellow-paper-cooperation"')[1]!.split("</article>")[0]!;
    expect(card).toMatch(/你带同学发表<\/span>\s*<strong>\+2人次<\/strong>/);
    expect(card).toMatch(/同学带你发表<\/span>\s*<strong>\+1人次<\/strong>/);
  });

  it("awards successive fellow-led papers and does not transfer credit to a replacement", () => {
    const state = makeState([2]);
    const paper = { ...published("fellow-0", "B"), collaborators: [{ id: "player", name: "你" }] };
    const first = settleFellowCoauthoredPapers({ ...state, externalPublications: [paper] });
    const secondPaper = { ...paper, id: "next-paper" };
    const second = settleFellowCoauthoredPapers({ ...first, externalPublications: [paper, secondPaper], fellowPapers: [secondPaper] });
    expect(second.fellowProgressState[0]).toMatchObject({ affinity: 3, affinityRewardedPaperIds: [paper.id, secondPaper.id] });
    const replacement = { ...state.fellowProgressState[0]!, id: "replacement" };
    const replaced = { ...second, fellowProgressState: [replacement] };
    expect(settleFellowCoauthoredPapers(replaced)).toBe(replaced);
  });

  it.each([false, true])("awards both authorship directions separately, together: %s", (together) => {
    const base = makeState([2, 6]);
    const playerLed = { ...published("fellow-0", "A"), leadAuthorId: undefined,
      collaborators: [{ id: "fellow-0", name: "同学0" }],
    };
    const fellowLed = { ...published("fellow-0", "B"), collaborators: [{ id: "player", name: "你" }] };
    let state = settleFellowCoauthoredPapers({ ...base, externalPublications: together ? [playerLed, fellowLed] : [playerLed] });
    if (!together) {
      expect(state.fellowProgressState[0]).toMatchObject({ affinity: 2, affinityRewardedPaperIds: [playerLed.id] });
      state = settleFellowCoauthoredPapers({ ...state, externalPublications: [playerLed, fellowLed] });
    }
    expect(state.fellowProgressState[0]).toMatchObject({ affinity: 3, affinityRewardedPaperIds: [playerLed.id, fellowLed.id] });
    expect(state.fellowProgressState[1]!.affinity).toBe(1);
    expect(settleFellowCoauthoredPapers(state)).toBe(state);
  });

  it("awards every new paper per collaborator, deduplicates copies and preserves research", () => {
    const state = makeState([2, 6, 9]);
    const paper = { ...published("fellow-0", "A"), leadAuthorId: undefined,
      collaborators: [{ id: "fellow-0", name: "同学0" }, { id: "fellow-2", name: "同学2" }],
    };
    const next = settleFellowCoauthoredPapers({ ...state, externalPublications: [paper, paper] });
    expect(next.fellowProgressState.map((profile) => profile.affinity)).toEqual([2, 1, 2]);
    expect(next.fellowProgressState.map((profile) => profile.research)).toEqual([2, 6, 9]);
    expect(next.player).toEqual(state.player);
    expect(settleFellowCoauthoredPapers(next)).toBe(next);
    const restored = JSON.parse(JSON.stringify(next)) as GameState;
    expect(settleFellowCoauthoredPapers(restored)).toBe(restored);
    const later = settleFellowCoauthoredPapers({ ...next, externalPublications: [paper, {
      ...paper, id: "second", collaborators: [{ id: "fellow-1", name: "同学1" }, { id: "fellow-0", name: "同学0" }],
    }] });
    expect(later.fellowProgressState.map((profile) => profile.affinity)).toEqual([3, 2, 2]);
  });

  it("does not award before publication or for namesakes, unspecific coauthorship or another lead author", () => {
    const state = makeState([2]);
    const paper = { ...published("fellow-0", "A"), leadAuthorId: undefined, collaborators: [{ id: "fellow-0", name: "同学0" }] };
    const waiting: GameState = { ...state, externalPublications: [
      { ...paper, status: "reviewing" }, { ...paper, status: "draft" },
      { ...paper, nonFirstAuthor: true }, { ...paper, leadAuthorId: "stranger" },
      { ...paper, collaborators: [{ id: "namesake", name: "同学0" }] },
      { ...paper, leadAuthorId: "fellow-0", collaborators: [] },
    ] };
    expect(settleFellowCoauthoredPapers(waiting)).toBe(waiting);
  });

  it("claims at the affinity cap without allowing deferred or repeated rewards", () => {
    const state = makeState([2]);
    state.fellowProgressState[0]!.affinity = 20;
    state.externalPublications = [{ ...published("fellow-0", "C"), collaborators: [{ id: "player", name: "你" }] }];
    const next = settleFellowCoauthoredPapers(state);
    expect(next.fellowProgressState[0]).toMatchObject({ affinity: 20, affinityRewardedPaperIds: ["fellow-0-C"] });
    expect(settleFellowCoauthoredPapers(next)).toBe(next);
  });

  it("runs through publication settlement even if all player rewards were already claimed", () => {
    const state = makeState([2]);
    const paper = { ...published("fellow-0", "C"), collaborators: [{ id: "player", name: "你" }], nonFirstAuthor: true };
    state.externalPublications = [paper];
    state.publicationTalentState = { claimedIds: ["first-coauthor-paper"] };
    const next = applyPublicationTalentRewards(state);
    expect(next.fellowProgressState[0]).toMatchObject({ affinity: 2, affinityRewardedPaperIds: [paper.id] });
    expect(next.player).toEqual(state.player);
  });

  it("awards when the player's journal is accepted with a fellow coauthor", () => {
    const state = makeState([2]);
    const paper = { ...createDraftPaper(1, 0, () => 0), idea: 50, experiment: 50, writing: 50,
      collaborators: [{ id: "fellow-0", name: "同学0" }],
    };
    const next = submitJournalPaper({ ...state, papers: [paper] }, paper.id, "pami");
    expect(next.externalPublications.some((entry) => entry.id === paper.id && entry.status === "published")).toBe(true);
    expect(next.fellowProgressState[0]).toMatchObject({ affinity: 2, affinityRewardedPaperIds: [paper.id] });
  });

  it("shows inheritance and cooperation with lover fourth and deferred cards", () => {
    const state = makeState([2, 6]);
    state.relationshipState.advisorCount = 1;
    const html = renderApp(state, undefined, { activePlayTab: "talent", activeTalentTab: "relation" });
    const panel = html.split('data-talent-panel-tab="relation"')[1]!.split("</section>")[0]!;
    const ids = [...panel.matchAll(/data-talent-item-id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual(["advisor", "lab-mutual-growth", "fellow-paper-cooperation", "lover", "joint-training", "internship"]);
    expect(panel).not.toMatch(/同学0|同学1|首次挂名|每轮互助默契/);
    const card = panel.split('data-talent-item-id="fellow-paper-cooperation"')[1]!.split("</article>")[0]!;
    expect(card).toContain("talent-item-metrics");
    expect(card).toContain("同学带你发表");
    expect(card).toContain("你带同学发表");
    expect(card).not.toContain("默契上限");
    for (const id of ids.slice(0, 3)) {
      expect(panel).toMatch(new RegExp(`class="talent-item talent-item-row is-active(?: talent-rule-card)?"\\s+data-talent-item-id="${id}"`));
    }
    expect(panel).not.toContain("同学成长");
    expect(panel).not.toContain("认识周期");
    expect(panel).toContain("每学年");
    expect(panel).toContain("⌊n/2⌋");
    const lover = panel.split('data-talent-item-id="lover"')[1]!.split("</article>")[0]!;
    expect(lover).toContain("恋人");
    expect(lover).toContain('<strong class="talent-item-title">恋人</strong>');
    expect(lover).toContain('<span>玩耍奖励</span>');
    expect(lover).toContain('data-ui-lover-reward-page="1"');
    expect(lover).not.toContain("具体天赋效果待定");
    const training = panel.split('data-talent-item-id="joint-training"')[1]!.split("</article>")[0]!;
    expect(training).not.toContain("具体天赋效果待定");
    expect(training).toContain("未激活");
    expect(training).toContain("论文参会事件激活");
    expect(training.match(/class="talent-item-metric"/g)).toHaveLength(3);
    const internship = panel.split('data-talent-item-id="internship"')[1]!.split("</article>")[0]!;
    expect(internship).not.toContain("具体天赋效果待定");
    expect(internship.match(/class="talent-item-metric"/g)).toHaveLength(6);
    expect(internship).toContain("实验");
    expect(internship).toContain("远程实习");
  });
});

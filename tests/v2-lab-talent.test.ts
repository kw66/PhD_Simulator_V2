import { describe, expect, it } from "vitest";

import { getFellowAnnualResearchGrowth, settleFellowCoauthoredPapers, settleLabResearchGrowth } from "../src/core/v2-lab-talent";
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
    ...base, totalMonths: 13, month: 1, year: 2, eventQueue: [],
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
    const next = settleLabResearchGrowth(state);
    expect(next.fellowProgressState.map((profile) => profile.research)).toEqual([20, 20, 20, 20]);
    expect(settleLabResearchGrowth({ ...next, totalMonths: 25 }).fellowProgressState.map((profile) => profile.research)).toEqual([20, 20, 20, 20]);
  });

  it("counts the mentor once plus strictly stronger player and fellows, excluding the lover", () => {
    const state = makeState([2, 6, 9, 2]);
    state.loverProgressState.research = 100;
    state.loverState.active = true;
    expect(state.fellowProgressState.map((profile) => getFellowAnnualResearchGrowth(state, profile))).toEqual([2, 1, 0, 2]);
    state.player.research = 2;
    expect(getFellowAnnualResearchGrowth(state, state.fellowProgressState[0]!)).toBe(1);
  });

  it("is active without a senior/junior pair and does not grow the player or mentor", () => {
    const state = makeState([2]);
    const next = settleLabResearchGrowth(state);
    expect(next.fellowProgressState[0]!.research).toBe(3);
    expect(next.player).toEqual(state.player);
    expect(next.advisorProgressState).toEqual(state.advisorProgressState);
  });

  it.each([1, 12, 14, 24])("does not grow outside each personal anniversary at month %s", (totalMonths) => {
    const state = { ...makeState(), totalMonths };
    expect(settleLabResearchGrowth(state)).toBe(state);
  });

  it("settles staggered anniversaries and never repeats within a month, including zero growth", () => {
    const state = makeState([2, 6, 9], [1, 2, 1]);
    const next = settleLabResearchGrowth(state);
    expect(next.fellowProgressState.map((profile) => profile.research)).toEqual([4, 6, 9]);
    expect(next.fellowProgressState[2]!.lastAnnualGrowthTotalMonths).toBe(13);
    expect(settleLabResearchGrowth(next)).toBe(next);
    const later = settleLabResearchGrowth({ ...next, totalMonths: 14 });
    expect(later.fellowProgressState.map((profile) => profile.research)).toEqual([4, 7, 9]);
    expect(settleLabResearchGrowth({ ...later, totalMonths: 25 }).fellowProgressState[0]!.research).toBe(6);
  });

  it("uses simultaneous values so reversing the roster cannot change growth", () => {
    const state = makeState([2, 2, 9]);
    state.player.research = 1;
    const forward = settleLabResearchGrowth(state);
    const reversed = settleLabResearchGrowth({ ...state, fellowProgressState: [...state.fellowProgressState].reverse() });
    expect(forward.fellowProgressState.map((profile) => profile.research)).toEqual([3, 3, 9]);
    expect(reversed.fellowProgressState.reverse()).toEqual(forward.fellowProgressState);
  });

  it("uses the annual growth in this month's research and new help snapshots", () => {
    const state = makeState([2]);
    const fellow = { ...state.fellowProgressState[0]!, taskProgress: 99 };
    const draft = { ...createDraftPaper(1, 0, () => 0), leadAuthorId: fellow.id, createdTotalMonths: 1 };
    const next = advanceFellowResearch({ ...state, fellowProgressState: [fellow], fellowPapers: [draft] }, () => 0);
    expect(next.fellowProgressState[0]).toMatchObject({ research: 3, pendingHelpToPlayer: 3, lastAnnualGrowthTotalMonths: 13 });
    expect(next.fellowPapers![0]).toMatchObject({ idea: 8, experiment: 2 });
    expect(advanceFellowResearch(next, () => 0)).toBe(next);
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
    const html = renderApp(makeState([2, 6]), undefined, { activePlayTab: "talent", activeTalentTab: "relation" });
    const panel = html.split('data-talent-panel-tab="relation"')[1]!.split("</section>")[0]!;
    const ids = [...panel.matchAll(/data-talent-item-id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual(["advisor", "lab-mutual-growth", "fellow-paper-cooperation", "lover", "joint-training", "internship"]);
    expect(panel).not.toMatch(/同学0|同学1|首次挂名|每轮互助默契/);
    const card = panel.split('data-talent-item-id="fellow-paper-cooperation"')[1]!.split("</article>")[0]!;
    expect(card).not.toContain("talent-item-rewards");
    expect(card).toMatch(/共同发表<\/span>\s*<strong>每篇<\/strong>/);
    expect(card).toMatch(/默契增加<\/span>\s*<strong>\+1<\/strong>/);
    expect(card).not.toContain("默契上限");
    for (const id of ids.slice(0, 3)) {
      expect(panel).toMatch(new RegExp(`class="talent-item talent-item-row is-active(?: talent-rule-card)?"\\s+data-talent-item-id="${id}"`));
    }
    expect(panel).not.toContain("同学成长");
    expect(panel).toMatch(/认识周期<\/span>\s*<strong>12个月<\/strong>/);
    expect(panel).toMatch(/同学科研<\/span>\s*<strong>\+⌊n\/2⌋<\/strong>/);
    expect(panel).toContain("导师视为1人，恋人不计");
    expect(panel).not.toContain("科研上限");
    const lover = panel.split('data-talent-item-id="lover"')[1]!.split("</article>")[0]!;
    expect(lover).toContain("恋人");
    expect(lover).toContain('<strong class="talent-item-title">恋人</strong>');
    expect(lover).toContain('<th scope="row">玩耍奖励Ⅰ</th><td>SAN+6</td>');
    expect(lover).toContain('data-ui-lover-reward-page="1"');
    expect(lover).not.toContain("具体天赋效果待定");
    for (const id of ["joint-training"]) {
      const pending = panel.split('data-talent-item-id="' + id + '"')[1]!.split("</article>")[0]!;
      expect(pending).toContain("具体天赋效果待定");
      expect(pending).not.toContain("未激活");
      expect(pending).not.toContain("条件：");
    }
    const internship = panel.split('data-talent-item-id="internship"')[1]!.split("</article>")[0]!;
    expect(internship).not.toContain("具体天赋效果待定");
    expect(internship.match(/class="talent-item-metric"/g)).toHaveLength(4);
    expect(internship).not.toContain("实验倍率");
    expect(internship).toContain("远程实习");
  });
});

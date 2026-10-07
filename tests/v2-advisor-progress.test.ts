import { describe, expect, it } from "vitest";
import {
  advanceAdvisorProject,
  createAdvisorProgressState,
  getActiveAdvisorGrants,
  getAdvisorGrantLimit,
  getAdvisorRankLabel,
  getEligibleAdvisorGrant,
  settleAdvisorMonth,
  syncAdvisorResearchAccumulation,
} from "../src/core/v2-advisor-progress";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import type { AdvisorProgressState, GameState, Paper } from "../src/core/v2-types";

function makeState(advisor: Partial<AdvisorProgressState> = {}): GameState {
  const base = createStartedGameState("normal");
  return {
    ...base,
    phase: "playing",
    selectedAdvisorName: "Test advisor",
    year: 1,
    month: 2,
    totalMonths: 2,
    player: { ...base.player, san: 30, money: 20, research: 20 },
    advisorProgressState: { ...createAdvisorProgressState(), ...advisor },
  };
}

function atMonth(state: GameState, totalMonths: number): GameState {
  return {
    ...state,
    totalMonths,
    year: Math.floor((totalMonths - 1) / 12) + 1,
    month: ((totalMonths - 1) % 12) + 1,
  };
}

function publishedPaper(id: string, patch: Partial<Paper> = {}): Paper {
  return { ...createDraftPaper(1, 0, () => 0), id, status: "published", target: "A", ...patch };
}

function finishGrantEvent(state: GameState): GameState {
  let current = state;
  for (let stage = 0; stage < 3; stage += 1) {
    const event = current.eventQueue.find((entry) => entry.chainId?.startsWith("advisor-grant-"));
    if (!event) return current;
    current = dispatchAction(current, "resolve-event", { eventId: event.id, eventChoiceId: event.choices[0]!.id });
  }
  return current;
}

describe("advisor project economy", () => {
  it("starts at 20 accumulation and 30 uncapped funding", () => {
    const state = createAdvisorProgressState();
    expect(state).toMatchObject({ researchAccumulation: 20, funding: 30, awards: [], pendingApplication: null });
    expect(getAdvisorRankLabel(state)).toBe("讲师");
    expect(getAdvisorGrantLimit(state)).toBe(1);
  });

  it("allows one player project action per month and charges relationship SAN", () => {
    const before = makeState();
    const after = advanceAdvisorProject(before, "horizontal", () => 0);
    expect(after.player.san).toBe(25);
    expect(after.advisorProgressState).toMatchObject({ horizontalProgress: 20, lastPlayerProjectTotalMonths: 2 });
    const repeated = advanceAdvisorProject(after, "vertical", () => 0);
    expect(repeated.advisorProgressState).toEqual(after.advisorProgressState);
    expect(repeated.player).toEqual(after.player);
    const nextMonth = advanceAdvisorProject(atMonth(after, 3), "vertical", () => 0);
    expect(nextMonth.player.san).toBe(21);
    expect(nextMonth.advisorProgressState.verticalProgress).toBe(20);
  });

  it("charges the distinct base SAN costs for horizontal and vertical projects", () => {
    const before = makeState();
    const horizontal = advanceAdvisorProject(before, "horizontal", () => 0);
    const vertical = advanceAdvisorProject(atMonth(before, 3), "vertical", () => 0);
    expect(before.player.san - horizontal.player.san).toBe(5);
    expect(before.player.san - vertical.player.san).toBe(4);
  });

  it("keeps horizontal project rewards uncapped and pays player labor", () => {
    const before = makeState({ funding: 100, horizontalProgress: 99 });
    const after = advanceAdvisorProject(before, "horizontal", () => 0);
    expect(after.advisorProgressState).toMatchObject({ funding: 155, horizontalProgress: 19 });
    expect(after.player.money).toBe(25);
    expect(after.log[1]?.text).toBe("推进横向项目：SAN -5，进度 +20");
    expect(after.log[0]?.text).toBe("横向项目完成：科研经费 +60，科研经费 -5（劳务费）；金币 +5");
  });

  it("adds ten percent of current accumulation when vertical project completes", () => {
    const before = makeState({ verticalProgress: 99, researchAccumulation: 20 });
    const after = advanceAdvisorProject(before, "vertical", () => 0);
    expect(after.advisorProgressState).toMatchObject({ verticalProgress: 19, researchAccumulation: 22 });
    expect(after.player.money).toBe(20);
  });

  it.each(["horizontal", "vertical"] as const)("preserves the advisor's month-start activity after manual %s work", (project) => {
    const before = makeState({ monthlyActivity: "推进纵向项目 +10，指导论文", horizontalProgress: 99, verticalProgress: 99 });
    const after = advanceAdvisorProject(before, project, () => 0);
    expect(after.advisorProgressState.monthlyActivity).toBe(before.advisorProgressState.monthlyActivity);
  });

  it("automatically advances the mentor by 10 and alternates projects", () => {
    const first = settleAdvisorMonth(makeState());
    expect(first.advisorProgressState).toMatchObject({ horizontalProgress: 10, nextProject: "vertical" });
    const second = settleAdvisorMonth(atMonth(first, 3));
    expect(second.advisorProgressState).toMatchObject({ verticalProgress: 10, nextProject: "horizontal" });
  });

  it("advances an automatic horizontal project even when funding is zero", () => {
    const state = makeState({ funding: 0, nextProject: "horizontal" });
    const next = settleAdvisorMonth(state);
    expect(next.advisorProgressState).toMatchObject({ funding: 0, horizontalProgress: 10, nextProject: "vertical" });
    expect(next.advisorProgressState.monthlyActivity).toBe("横向进度 +10");
    expect(next.phase).toBe("playing");
    expect(settleAdvisorMonth(atMonth(next, 3)).advisorProgressState.verticalProgress).toBe(10);
  });

  it("does not settle the enrollment month", () => {
    const state = atMonth(makeState(), 1);
    expect(settleAdvisorMonth(state).advisorProgressState).toEqual(state.advisorProgressState);
  });
});

describe("advisor publication credit and grants", () => {
  it("awards 600 funding once for academician and has no monthly funding income", () => {
    const march = settleAdvisorMonth(atMonth(makeState({
      researchAccumulation: 1000,
      awards: [{ id: "distinguished", awardedYear: 2023, startYear: 2024, endYear: 2028 }],
    }), 7));
    expect(march.advisorProgressState.pendingApplication?.id).toBe("academician");
    const august = finishGrantEvent(settleAdvisorMonth(atMonth(march, 12)));
    expect(august.advisorProgressState.funding).toBe(630);
    expect(august.advisorProgressState.awards.at(-1)).toEqual({
      id: "academician", awardedYear: 2024, startYear: null, endYear: null,
    });
    expect(august.log.some((entry) => entry.text.includes("导师当选院士") && entry.text.includes("科研经费 +600"))).toBe(true);
    expect(settleAdvisorMonth(august).advisorProgressState.funding).toBe(630);
    const september = settleAdvisorMonth(atMonth(august, 13));
    expect(september.advisorProgressState.funding).toBe(630);
    const repeatedAugust = settleAdvisorMonth(atMonth({ ...september,
      advisorProgressState: { ...september.advisorProgressState,
        pendingApplication: { id: "academician", calendarYear: 2025, researchSnapshot: 1000, resultRoll: 0.99 } },
    }, 24));
    expect(repeatedAugust.advisorProgressState.funding).toBe(630);
  });

  it("counts each published paper once, including fellow papers", () => {
    const fellow = createCustomFellowProgressProfile({ type: "junior", gender: "female", research: 10, affinity: 2, startTotalMonths: 1, name: "Test junior" });
    const paper = publishedPaper("fellow-paper", { leadAuthorId: fellow.id });
    const state = { ...makeState(), fellowProgressState: [fellow], fellowPapers: [paper], papers: [paper] };
    const credited = syncAdvisorResearchAccumulation(state);
    expect(credited.advisorProgressState).toMatchObject({ researchAccumulation: 24, countedPaperIds: [paper.id] });
    expect(syncAdvisorResearchAccumulation(credited).advisorProgressState).toEqual(credited.advisorProgressState);
  });

  it("keeps automatic paper credit out of the ordinary game log", () => {
    const state = { ...makeState(), papers: [publishedPaper("automatic-credit")] };
    const credited = syncAdvisorResearchAccumulation(state);
    expect(credited.log).toEqual(state.log);
  });

  it.each([[0, "youth"], [20, "youth"], [24, "youth"], [25, "youth"], [50, "general"], [150, "excellent"], [400, "distinguished"]] as const)(
    "selects the highest eligible grant at accumulation %i",
    (researchAccumulation, expected) => {
      const grant = getEligibleAdvisorGrant({ ...createAdvisorProgressState(), researchAccumulation }, 2024);
      expect(grant?.id ?? null).toBe(expected);
    },
  );

  it("submits the March application and awards it in August without spending accumulation", () => {
    const march = settleAdvisorMonth(atMonth(makeState({ researchAccumulation: 25 }), 7));
    expect(march.advisorProgressState.pendingApplication).toMatchObject({ id: "youth", calendarYear: 2024, researchSnapshot: 25, resultRoll: expect.any(Number) });
    const august = finishGrantEvent(settleAdvisorMonth(atMonth(march, 12)));
    expect(august.advisorProgressState.awards).toEqual([{ id: "youth", awardedYear: 2024, startYear: 2025, endYear: 2027 }]);
    expect(august.advisorProgressState.researchAccumulation).toBe(25);
    expect(august.advisorProgressState.funding).toBe(60);
    expect(getActiveAdvisorGrants(august.advisorProgressState, 2024)).toHaveLength(1);
  });

  it("tries the next grant below its target but respects project limits and academician prerequisites", () => {
    const advisor = { ...createAdvisorProgressState(), researchAccumulation: 42,
      awards: [{ id: "youth" as const, awardedYear: 2023, startYear: 2024, endYear: 2026 }],
    };
    expect(getEligibleAdvisorGrant(advisor, 2024)?.id).toBe("general");
    const limited = { ...advisor, awards: [...advisor.awards,
      { id: "general" as const, awardedYear: 2023, startYear: 2024, endYear: 2027 }],
    };
    expect(getEligibleAdvisorGrant(limited, 2024)).toBeNull();
    expect(getEligibleAdvisorGrant({ ...createAdvisorProgressState(), researchAccumulation: 1000 }, 2024)?.id).toBe("distinguished");
    const distinguished = { ...limited, awards: [...limited.awards,
      { id: "distinguished" as const, awardedYear: 2023, startYear: 2024, endYear: 2028 }],
    };
    expect(getEligibleAdvisorGrant(distinguished, 2024)?.id).toBe("academician");
  });
});

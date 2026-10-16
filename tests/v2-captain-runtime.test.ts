import { describe, expect, it } from "vitest";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { settleCaptainMonth, syncCaptainMembers } from "../src/core/v2-captain-runtime";
import { getCaptainLoverId, getCaptainLoverResearchCap, getCaptainResearchCap, getCaptainProjectMax, getCaptainCooperationMax } from "../src/core/v2-captain-state";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { createLoverProgressState, advanceLoverMonth } from "../src/core/v2-lover-progression";
import { activateLover } from "../src/core/v2-lover-system";
import { applyTierResist, getActualSanChange } from "../src/core/v2-sanity-rules";
import { getActiveOperationAllowance, getAiModelForTotalMonths, AI_SLOT_IDS } from "../src/core/v2-ai-shop";
import { advanceSharedLabProject } from "../src/core/v2-lab-projects";
import { settleAdvisorMonth } from "../src/core/v2-advisor-progress";
import { queueAdvisorGuidance, settleAdvisorGuidance } from "../src/core/v2-advisor-guidance";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { getPaperCitationMultiplier } from "../src/core/v2-publication-system";
import { createBeforeGradSchoolAct1Event, resolveAdvisorConfirmation, resolveAdvisorReroll } from "../src/core/v2-fixed-events-before-grad-school";
import { isLinearEvent } from "../src/core/v2-event-auto-resolution";
import type { CaptainTag } from "../src/core/v2-captain-state";
import type { GameState } from "../src/core/v2-types";

function base(tags: CaptainTag[] = []): GameState {
  const state = createStartedGameState("research-captain", {}, 0, 1,
    Object.fromEntries(["normal", "rich", "genius", "social", "teacher-child", "chosen"].map((id) => [id, 10])));
  const fellows = tags.map((_, i) => ({ ...createCustomFellowProgressProfile({ type: "peer", gender: "male", research: 2,
    affinity: 2, startTotalMonths: 1, name: `同学${i}`, identitySeed: `captain-${i}` }), id: `f${i}` }));
  return { ...state, totalMonths: 2, month: 2, selectedAdvisorName: "导师", fellowProgressState: fellows,
    player: { ...state.player, san: 20, research: 0, social: 0, favor: 0, money: 10 },
    captainState: { ...state.captainState!, tags: Object.fromEntries(tags.map((tag, i) => [`f${i}`, tag])) } };
}

describe("captain run integration", () => {
  it("snapshots clamped base-role levels and has no regular action", () => {
    const levels = { normal: 3, genius: 100, social: -2 };
    const state = createStartedGameState("research-captain", {}, 0, 1, levels);
    levels.normal = 9;
    expect(state.captainState!.levels).toMatchObject({ normal: 3, genius: 10, social: 0 });
    expect(state.actionState.limit).toBe(0);
    expect(getActiveOperationAllowance(state, "idea").allowed).toBe(false);
    const offers = AI_SLOT_IDS.map((slot) => getAiModelForTotalMonths(state.totalMonths, slot));
    let aiState = state.aiShopState;
    for (const model of offers.filter((offer) => offer.slot !== "claude")) aiState = { ...aiState, subscriptions: {
      ...aiState.subscriptions, [model.slot]: { ...aiState.subscriptions[model.slot], active: true, modelId: model.id },
    } };
    expect(getActiveOperationAllowance({ ...state, aiShopState: aiState }, "idea")).toMatchObject({ allowed: true, usesAiResearchBonus: true, consumesAction: false });
    expect(getActiveOperationAllowance({ ...state, aiShopState: aiState }, "rest").allowed).toBe(false);
  });

  it("assigns fixed labels and applies new member initial growth exactly once", () => {
    let state = base(["genius", "social"]);
    state = syncCaptainMembers(state, () => 0);
    expect(state.fellowProgressState[0]!.research).toBeCloseTo(2 + applyTierResist(10, 2, undefined, 30).effectiveChange);
    expect(state.fellowProgressState[1]!.affinity).toBeCloseTo(2 + applyTierResist(10, 2, undefined, 30).effectiveChange);
    expect(getCaptainResearchCap(state, state.fellowProgressState[0]!)).toBe(30);
    expect(syncCaptainMembers(structuredClone(state), () => 0.99)).toEqual(state);
  });

  it("stacks SAN reduction at the same additive layer as seasons and removes departed labels", () => {
    let state = syncCaptainMembers(base(["normal", "normal"]), () => 0);
    expect(getActualSanChange(-4, state.month, state.eventSupport, state.buffs)).toBe(-1);
    state = syncCaptainMembers({ ...state, fellowProgressState: [] });
    expect(getActualSanChange(-4, state.month, state.eventSupport, state.buffs)).toBe(-3);
    expect(state.actionState.limit).toBe(0);
  });

  it("reselects the poorest target after each grant and accounts for new funding", () => {
    let state = base(["rich", "normal"]);
    state = { ...state, player: { ...state.player, money: 0 },
      fellowFinanceAccounts: { f0: { name: "富", money: 9 }, f1: { name: "穷", money: 0 } },
      captainState: { ...state.captainState!, tags: { ...state.captainState!.tags, advisor: "rich" },
        initializedMembers: ["advisor", "f0", "f1"] } };
    const next = settleCaptainMonth(state, () => 0);
    expect(next.player.money).toBe(5);
    expect(next.fellowFinanceAccounts!.f1!.money).toBe(5);
    expect(next.fellowFinanceAccounts!.f0!.money).toBe(13);
    expect(next.advisorProgressState.funding).toBe(state.advisorProgressState.funding + 8);
    expect(next.advisorProgressState.cumulativeFunding).toBe(state.advisorProgressState.cumulativeFunding + 8);
    expect(settleCaptainMonth(next)).toBe(next);
  });

  it("grants weekly-sized fractional research and social through resistance and accumulates advisor research", () => {
    let state = base(["genius", "social", "teacher-child"]);
    state = { ...state, captainState: { ...state.captainState!, tags: { ...state.captainState!.tags, advisor: "genius" },
      initializedMembers: ["advisor", "f0", "f1", "f2"] } };
    const next = settleCaptainMonth(state, () => 0);
    expect(next.player.research).toBe(1);
    expect(next.player.social).toBe(0.5);
    expect(next.player.favor).toBe(0.5);
    expect(next.advisorProgressState.researchAccumulation).toBe(state.advisorProgressState.researchAccumulation + 4);
    expect(next.fellowProgressState).toEqual(state.fellowProgressState);
  });

  it("uses dynamic project ceilings and increases only the advisor's existing automatic advance", () => {
    const initial = base();
    const state: GameState = { ...initial, captainState: { ...initial.captainState!, tags: { advisor: "social" }, initializedMembers: ["advisor"] } };
    expect(getCaptainProjectMax(state, "horizontal")).toBe(50);
    expect(advanceSharedLabProject(state, "horizontal", 100).completed).toBe(2);
    const normal: GameState = { ...state, captainState: { ...state.captainState!, tags: { advisor: "normal" } } };
    expect(settleAdvisorMonth(normal).advisorProgressState.horizontalProgress).toBe(20);
  });

  it("applies the fixed advisor bonus once and amplifies guidance for the receiving fellow", () => {
    let state = base(["teacher-child"]);
    state = { ...state, captainState: { ...state.captainState!, tags: { ...state.captainState!.tags, advisor: "teacher-child" }, initializedMembers: ["advisor", "f0"] },
      papers: [{ ...createDraftPaper(1, 0, () => 0), idea: 1, experiment: 1 }],
      fellowPapers: [{ ...createDraftPaper(1, 1, () => 0), idea: 1, experiment: 1, leadAuthorId: "f0" }] };
    const pending = queueAdvisorGuidance(state);
    expect(pending.advisorProgressState.pendingGuidanceToPlayer).toBe(20);
    expect(pending.fellowProgressState[0]!.pendingGuidanceFromAdvisor).toBe(60);
    const next = settleAdvisorGuidance(pending, () => 0);
    expect(next.papers[0]!.writing).toBe(20);
    expect(next.fellowPapers![0]!.writing).toBe(60);
    expect(settleAdvisorGuidance(next)).toEqual(next);
  });

  it("amplifies citations only when the chosen advisor is named on the paper", () => {
    const initial = base();
    const state: GameState = { ...initial, captainState: { ...initial.captainState!, tags: { advisor: "chosen" } } };
    const paper = createDraftPaper(1, 0, () => 0);
    const baseMultiplier = getPaperCitationMultiplier(state, paper);
    expect(getPaperCitationMultiplier(state, { ...paper, collaborators: [{ id: "advisor", name: "导师" }] })).toBeCloseTo(baseMultiplier * 2);
  });

  it("applies lover caps once and accumulates extra passive advances without shopping", () => {
    let state = base();
    state = { ...state, loverState: { ...activateLover("smart", 1, "female"), name: "恋人" },
      loverProgressState: { ...createLoverProgressState("smart", () => 0), intimacy: 10 } };
    const id = getCaptainLoverId(state);
    state = { ...state, captainState: { ...state.captainState!, tags: { advisor: "normal", [id]: "chosen" }, initializedMembers: ["advisor", id],
      levels: { ...state.captainState!.levels, chosen: 5 } } };
    const first = advanceLoverMonth(state);
    expect(first.loverProgressState.routes!.study.progress).toBe(10);
    const second = advanceLoverMonth({ ...first, totalMonths: 3, month: 3 });
    expect(second.loverProgressState.routes!.study.progress).toBe(30);
    expect(second.loverProgressState.routes!.shopping.progress).toBe(0);
    expect(advanceLoverMonth(second)).toBe(second);
    const genius = syncCaptainMembers({ ...state, captainState: { ...state.captainState!, tags: { advisor: "normal", [id]: "genius" }, initializedMembers: ["advisor"] } });
    expect(getCaptainLoverResearchCap(genius)).toBe(30);
    expect(genius.loverProgressState.research).toBeGreaterThan(state.loverProgressState.research);
  });

  it("does not repeatedly subtract cooperation ceilings after serialization", () => {
    const state = syncCaptainMembers(base(["chosen"]), () => 0.99);
    expect(getCaptainCooperationMax(state, state.fellowProgressState[0]!)).toBe(80);
    expect(getCaptainCooperationMax(structuredClone(state), state.fellowProgressState[0]!)).toBe(80);
  });

  it("shows and persists advisor candidate labels and rerolls them only with the advisor", () => {
    const state = base();
    const event = createBeforeGradSchoolAct1Event(state, () => 0);
    const info = event.choices[0]!.effects.enqueueEvents![0]!;
    expect(info.description).toContain("大多数 Lv10");
    expect(info.description).not.toContain("对游戏数值没有影响");
    expect(info.choices[0]!.cosmetic).toBe(false);
    expect(isLinearEvent(state, { ...info, queueOrder: 0, deadlineMonths: 0, history: [] })).toBe(false);
    const confirm = info.choices[1]!.effects.fixedEventResolution!;
    const joined = resolveAdvisorConfirmation(state, confirm).nextState;
    expect(joined.captainState!.tags.advisor).toBe("normal");
    const rerolled = resolveAdvisorReroll({ ...state, eventQueue: [{ ...info, queueOrder: 0, deadlineMonths: 0, history: [] }] },
      info.choices[0]!.effects.fixedEventResolution!, () => 0.99).nextState;
    expect(rerolled.eventQueue[0]!.description).toContain("天选之人 Lv10");
  });

  it("replays a serialized monthly snapshot with exactly the same labels, outcomes and random cursor", () => {
    const initial = base(["chosen", "rich", "genius", "normal"]);
    const state = { ...initial, totalMonths: 1, month: 1, eventQueue: [], availableRandomEvents: [],
      player: { ...initial.player, money: 50 },
      randomState: { seed: 123456, cursor: 0 },
      papers: [{ ...createDraftPaper(1, 0, () => 0), idea: 1, experiment: 1, writing: 1 }],
    };
    const first = dispatchAction(state, "next-month");
    const replay = dispatchAction(JSON.parse(JSON.stringify(state)), "next-month");
    expect(first).toEqual(replay);
    expect(first.actionState.limit).toBe(0);
    expect(first.captainState!.lastMonthlySettlement).toBe(2);
    expect(first.captainState!.levels).toEqual(state.captainState!.levels);
    expect(state.captainState!.initializedMembers).toEqual([]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { addOrReplaceBuffs, advanceBuffDurations } from "../src/core/v2-buffs";
import { createDebugBuffs } from "../src/core/v2-debug-tools";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createCustomFellowProgressProfile } from "../src/core/v2-fellow-progression";
import { advanceFellowResearch, ensureFellowPapers, getFellowCurrentPaper } from "../src/core/v2-fellow-research";
import { activateRemoteInternship } from "../src/core/v2-internship-system";
import { createLabGpuFailureBuff, getLabExperimentMoneyCost } from "../src/core/v2-lab-compute";
import { applyMonthlyEffects } from "../src/core/v2-monthly-effects";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { createOpsCampusRandomEvent } from "../src/core/v2-random-events-campus-ops";
import { applyResearchOperation, getResearchExperimentCostBreakdown, getResearchExperimentMoneyCost, previewResearchOperation } from "../src/core/v2-research-operation";
import type { GameState, PendingEvent } from "../src/core/v2-types";

type Branch = "advisor" | "report" | "reinstall" | "taobao";

function makeState(): GameState {
  const state = createStartedGameState("normal");
  const paper = { ...createDraftPaper(1, 0, () => 0), id: "player-paper", idea: 10 };
  return {
    ...state, month: 6, totalMonths: 6, totalRandomEventCount: 1,
    selectedAdvisorName: "测试导师", papers: [paper], selectedPaperId: paper.id,
    eventQueue: [], eventHistory: [], log: [], buffs: [], availableRandomEvents: [], illnessProbability: 0,
    player: { ...state.player, san: 20, money: 10, social: 5, research: 4 },
    advisorProgressState: { ...state.advisorProgressState, funding: 10 },
  };
}

function makeEvent(state: GameState, roll: number): PendingEvent {
  const rolls: number[] = [];
  const event = createOpsCampusRandomEvent(state, () => { rolls.push(roll); return roll; });
  return { ...event, randomReplay: { eventId: 13, serial: state.totalRandomEventCount, rolls } };
}

function choiceFor(event: PendingEvent, branch: Branch) {
  const decision = event.stage === "act1" ? event.choices[0]!.effects.enqueueEvents![0]! : event;
  return decision.choices.find((choice) => choice.id.startsWith(`random-13-${branch}-`))!;
}

function resolve(state: GameState, branch?: Branch): GameState {
  const event = state.eventQueue[0]!;
  const choice = branch ? choiceFor(event, branch) : event.choices[0]!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choice.id });
}

function withFellows(state: GameState, count = 1): GameState {
  const profiles = Array.from({ length: count }, (_, index) => ({
    ...createCustomFellowProgressProfile({
      type: "peer", gender: "female", research: 6, affinity: 0, startTotalMonths: index + 1, name: `同学${index}`,
    }),
    id: `fellow-${index}`, nextMonthlyAction: "research" as const,
  }));
  const next = ensureFellowPapers({ ...state, fellowProgressState: profiles }, () => 0);
  return { ...next, fellowPapers: next.fellowPapers!.map((paper) => ({
    ...paper, createdTotalMonths: 1, prepublicationDecayRate: 0, idea: 10, experiment: 0, writing: 0,
  })) };
}

afterEach(() => vi.restoreAllMocks());

describe("GPU failure event", () => {
  it.each([
    ["advisor", 0, 0, 0, 0, true], ["report", 0, 0, 0, -2, false],
    ["reinstall", 0.499, -3, 0, 0, false], ["reinstall", 0.5, -3, 0, -1, true],
    ["taobao", 0.499, 0, -2, 0, false], ["taobao", 0.5, 0, -2, 0, true],
  ] as const)("settles %s at roll %s only on confirmation", (branch, roll, san, money, social, surcharge) => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const initial = makeState();
    const event = makeEvent(initial, roll);
    const choice = choiceFor(event, branch);
    if (branch === "taobao") {
      expect(choice.outcome).toContain("结果：金币 -2");
      expect(choice.effects.enqueueEvents![0]!.description).toContain("结果：金币 -2");
    }
    expect(choice.effects.experimentBonus).toBeUndefined();
    expect(choice.effects.temporaryActionEffectUpdates).toBeUndefined();
    let state = { ...initial, eventQueue: [createEventQueueItem(event, 1)] };
    state = resolve(state);
    state = resolve(state, branch);
    expect(state.player).toEqual(initial.player);
    expect(state.buffs).toEqual([]);
    const result = state.eventQueue[0]!;
    expect(result.stage).toBe("result");
    state = resolve(state);
    expect(state.player).toMatchObject({ san: 20 + san, money: 10 + money, social: 5 + social });
    expect(state.advisorProgressState.funding).toBe(10);
    expect(state.buffs).toEqual(surcharge ? [createLabGpuFailureBuff()] : []);
    if (surcharge) {
      expect(result.description).toContain("全组实验费用 +1（每次，持续6个月）");
      expect(result.description).not.toContain("持续6个月，");
    }
    expect(getResearchExperimentMoneyCost(state)).toBe(surcharge ? 4 : 3);
    expect(previewResearchOperation(state, "experiment", 3)).toMatchObject({ scoreBonus: 0, scoreMultiplier: 1 });
    const repeated = dispatchAction(state, "resolve-event", { eventId: result.id, eventChoiceId: result.choices[0]!.id });
    expect(repeated.player).toEqual(state.player);
    expect(repeated.buffs).toEqual(state.buffs);
    expect(state.eventHistory.at(-1)!.stages.at(-1)!.description).toBe(result.description);
  });

  it("explains scarce GPUs, remote repairs and the lost classmate data in at most two paragraphs", () => {
    for (const roll of [0, 0.9]) {
      const event = makeEvent(makeState(), roll);
      expect(event.description).toContain("Linux");
      expect(event.description).toContain("显卡本来就不多");
      expect(event.description).toContain("租更多的卡");
      const decision = event.choices[0]!.effects.enqueueEvents![0]!;
      const scenes = [event, decision, ...decision.choices.map((choice) => choice.effects.enqueueEvents![0]!)];
      for (const scene of scenes) {
        expect(scene.description.split("\n\n机制结算\n")[0]!.split("\n\n").length).toBeLessThanOrEqual(2);
        expect(scene.description).not.toMatch(/永久实验 -2|×0.25|机房门口|追加费用/u);
      }
      expect(choiceFor(event, "taobao").effects.enqueueEvents![0]!.description).toContain("远程");
      if (roll > 0.5) expect(choiceFor(event, "reinstall").effects.enqueueEvents![0]!.description).toContain("同学存资料的硬盘也格式化了");
    }
  });

  it("replaces the obsolete debug multiplier with the live shared Buff", () => {
    const buffs = createDebugBuffs();
    expect(buffs).toContainEqual(createLabGpuFailureBuff());
    expect(buffs.some((buff) => buff.id === "debug-buff-next-experiment-multiplier")).toBe(false);
    expect(buffs.some((buff) => buff.source === "显卡故障" && buff.actionEffects)).toBe(false);
  });

  it("does not double the live surcharge or reorder buffs when adding debug effects twice", () => {
    const initial = makeState();
    initial.buffs = [createLabGpuFailureBuff()];
    const once = dispatchAction(initial, "debug-add-all-buffs");
    const twice = dispatchAction(once, "debug-add-all-buffs");
    expect(twice).toEqual(once);
    expect(twice.buffs.filter((buff) => buff.labExperimentMoneyDelta)).toHaveLength(1);
    expect(getLabExperimentMoneyCost(twice)).toBe(4);
    expect(twice.log).toEqual(initial.log);
  });
});

describe("shared lab rental costs", () => {
  it.each([0, 2, 4, 10])("uses funding %s and blocks experiments the lab cannot afford", (funding) => {
    const initial = makeState();
    const state = { ...initial, buffs: [createLabGpuFailureBuff()], advisorProgressState: { ...initial.advisorProgressState, funding } };
    expect(getResearchExperimentCostBreakdown(state)).toEqual({ total: 4, advisorFunding: 4, playerMoney: 0 });
    const next = applyResearchOperation(state, "player-paper", "experiment", () => 0);
    expect(next.player.money).toBe(10);
    expect(next.advisorProgressState.funding).toBe(funding < 4 ? funding : funding - 4);
    if (funding < 4) expect(next.papers).toEqual(state.papers);
    expect(next.buffs).toEqual(state.buffs);
  });

  it.each([
    [0, false, 4], [4, false, 3], [8, false, 2],
    [0, true, 3], [4, true, 2], [8, true, 1],
  ] as const)("applies GPU %s and internship %s reductions only to the player's cost", (gpuLevel, internship, cost) => {
    const state = makeState();
    state.buffs = [createLabGpuFailureBuff()];
    state.shopState.gpuLevel = gpuLevel;
    if (internship) state.internshipState = activateRemoteInternship(state.totalMonths - 1);
    expect(getResearchExperimentMoneyCost(state)).toBe(cost);
    expect(getLabExperimentMoneyCost(state)).toBe(4);
    const next = applyResearchOperation(state, "player-paper", "experiment", () => 0);
    expect(next.advisorProgressState.funding).toBe(10 - cost);
    expect(next.player.money).toBe(10);
    expect(next.player.san).toBe(17);
    expect(next.actionState.used).toBe(state.actionState.used + 1);
  });

  it("does not spend either balance if the player cannot pay their remainder", () => {
    const state = makeState();
    state.buffs = [createLabGpuFailureBuff()];
    state.player.money = 0;
    state.advisorProgressState.funding = 3;
    const next = applyResearchOperation(state, "player-paper", "experiment", () => 0);
    expect(next.player).toEqual(state.player);
    expect(next.papers).toEqual(state.papers);
    expect(next.advisorProgressState).toEqual(state.advisorProgressState);
    expect(next.actionState).toEqual(state.actionState);
  });

  it.each([3, 4, 10])("charges a fellow four at funding %s despite the player's personal discounts", (funding) => {
    const state = withFellows(makeState());
    state.buffs = [createLabGpuFailureBuff()];
    state.shopState.gpuLevel = 8;
    state.internshipState = activateRemoteInternship(state.totalMonths - 1);
    state.advisorProgressState.funding = funding;
    const next = advanceFellowResearch(state, () => 0);
    expect(next.player).toEqual(state.player);
    if (funding < 4) {
      expect(next.advisorProgressState.funding).toBe(funding);
      expect(getFellowCurrentPaper(next, "fellow-0")!.experiment).toBe(0);
      expect(next.fellowProgressState[0]!.monthlyActivity).toContain("经费不足，横向");
    } else {
      expect(next.advisorProgressState.funding).toBe(funding - 4);
      expect(getFellowCurrentPaper(next, "fellow-0")!.experiment).toBeGreaterThan(0);
      expect(next.fellowProgressState[0]!.monthlyActivity).toContain("经费 -4");
    }
  });

  it("spends shared funding in card order, not paper array order", () => {
    const state = withFellows(makeState(), 2);
    state.buffs = [createLabGpuFailureBuff()];
    state.advisorProgressState.funding = 7;
    state.fellowPapers!.reverse();
    const next = advanceFellowResearch(state, () => 0);
    expect(next.advisorProgressState.funding).toBe(3);
    expect(getFellowCurrentPaper(next, "fellow-0")!.experiment).toBeGreaterThan(0);
    expect(getFellowCurrentPaper(next, "fellow-1")!.experiment).toBe(0);
    expect(next.fellowProgressState[1]!.monthlyActivity).toContain("经费不足，横向");
    expect(next.player).toEqual(state.player);
  });

  it("refreshes the same outage without stacking the surcharge", () => {
    const state = makeState();
    state.buffs = [{ ...createLabGpuFailureBuff(), remainingMonths: 1 }];
    state.buffs = addOrReplaceBuffs(state.buffs, [createLabGpuFailureBuff()]);
    expect(state.buffs).toEqual([createLabGpuFailureBuff()]);
    expect(getLabExperimentMoneyCost(state)).toBe(4);
  });

  it("expires after six duration ticks and restores both experiment costs", () => {
    let state = makeState();
    state.buffs = [createLabGpuFailureBuff()];
    for (let elapsed = 0; elapsed < 6; elapsed += 1) {
      expect(getLabExperimentMoneyCost(state)).toBe(4);
      expect(getResearchExperimentMoneyCost(state)).toBe(4);
      expect(state.buffs[0]!.remainingMonths).toBe(6 - elapsed);
      state = applyMonthlyEffects({ ...state, totalMonths: state.totalMonths + 1 }).nextState;
    }
    expect(state.buffs).toEqual([]);
    expect(getLabExperimentMoneyCost(state)).toBe(3);
    expect(getResearchExperimentMoneyCost(state)).toBe(3);
    const next = advanceFellowResearch(withFellows(state), () => 0);
    expect(next.advisorProgressState.funding).toBe(state.advisorProgressState.funding - 3);
  });

  it("ignores expired effects and clamps fully discounted costs to zero", () => {
    const state = makeState();
    state.buffs = [{ ...createLabGpuFailureBuff(), remainingMonths: 0 }];
    expect(getLabExperimentMoneyCost(state)).toBe(3);
    state.shopState.gpuLevel = 8;
    state.internshipState = activateRemoteInternship(state.totalMonths - 1);
    expect(getResearchExperimentMoneyCost(state)).toBe(0);
    state.buffs = [createLabGpuFailureBuff()];
    expect(getResearchExperimentMoneyCost(state)).toBe(1);
    expect(getLabExperimentMoneyCost(state)).toBe(4);
    expect(advanceBuffDurations(state.buffs)[0]!.remainingMonths).toBe(5);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createEntertainmentCampusRandomEvent } from "../src/core/v2-random-events-campus-entertainment";
import type { EventChoice, GameState, PendingEvent } from "../src/core/v2-types";

type Branch = "terraria" | "magic-tower" | "grad-sim" | "kings";

function makeState(): GameState {
  const state = createStartedGameState("normal");
  return {
    ...state,
    month: 6, totalMonths: 6, totalRandomEventCount: 7,
    selectedAdvisorName: "测试导师",
    player: { ...state.player, san: 10, money: 10, research: 0, social: 0 },
    eventQueue: [], eventHistory: [], log: [], buffs: [],
  };
}

function makeEvent(state: GameState, versionRoll = 0, wolfRoll = 0): PendingEvent {
  const suppliedRolls = [versionRoll, wolfRoll];
  const rolls: number[] = [];
  const event = createEntertainmentCampusRandomEvent(state, () => {
    const roll = suppliedRolls.shift() ?? 0.99;
    rolls.push(roll);
    return roll;
  });
  return { ...event, randomReplay: { eventId: 15, serial: state.totalRandomEventCount, rolls } };
}

function decisionChoice(event: PendingEvent, branch: Branch): EventChoice {
  const decision = event.stage === "act1" ? event.choices[0]?.effects.enqueueEvents?.[0] : event;
  const choice = decision?.choices.find((entry) => entry.id.startsWith(`random-15-${branch}-`));
  if (!choice) throw new Error(`Missing entertainment branch ${branch}`);
  return choice;
}

function resolve(state: GameState, branch?: Branch): GameState {
  const event = state.eventQueue.find((entry) => entry.chainId === "random-15");
  if (!event) throw new Error("Missing entertainment event");
  const choice = branch ? decisionChoice(event, branch) : event.choices[0]!;
  return dispatchAction(state, "resolve-event", { eventId: event.id, eventChoiceId: choice.id });
}

afterEach(() => vi.restoreAllMocks());

describe("game relaxation event", () => {
  it("starts with queued experiments rather than a multiplayer invitation", () => {
    const event = makeEvent(makeState());
    expect(event.description).toMatch(/服务器.*排好队/u);
    expect(event.description).toContain("自己也该放松");
    expect(event.description).not.toMatch(/邀请|试麦|就差你|上号/u);
    const decision = event.choices[0]!.effects.enqueueEvents![0]!;
    expect(decision.choices.map((choice) => choice.label)).toEqual([
      "玩泰拉瑞亚", "玩魔塔50层", "玩研究生模拟器", "玩洛克王国世界",
    ]);
    expect(decision.description).not.toMatch(/50%|SAN|金币\s*[+-]/u);
    expect(JSON.stringify(event)).not.toMatch(/王者荣耀|代练单|排位结束/u);
  });

  it("keeps Terraria and tower rewards while explaining their fatigue", () => {
    const event = makeEvent(makeState());
    const terraria = decisionChoice(event, "terraria");
    const tower = decisionChoice(event, "magic-tower");
    expect(terraria.effects).toMatchObject({ social: 1, san: -4 });
    expect(tower.effects).toMatchObject({ research: 1, san: -6 });
    const terrariaStory = terraria.effects.enqueueEvents![0]!.description;
    const towerStory = tower.effects.enqueueEvents![0]!.description;
    expect(terrariaStory).toMatch(/骷髅王[\s\S]*三百颗够吗[\s\S]*通宵/u);
    expect(towerStory).toMatch(/十楼[\s\S]*骷髅队长[\s\S]*读档[\s\S]*算伤害/u);
  });

  it.each([0, 0.499999, 0.5, 0.999999])("uses exact half-probability boundaries at roll %s", (roll) => {
    const event = makeEvent(makeState(), roll, roll);
    const simulation = decisionChoice(event, "grad-sim");
    const wolf = decisionChoice(event, "kings");
    const version = roll < 0.5 ? "v1" : "v2";
    expect(simulation.effects.san).toBe(roll < 0.5 ? 2 : 3);
    expect(simulation.outcome).toContain(`游玩 ${version}（50%）`);
    expect(simulation.effects.enqueueEvents![0]!.description).toContain(`研究生模拟器 ${version}`);
    expect(wolf.effects).toMatchObject({ san: -5, money: roll < 0.5 ? 4 : 2 });
    expect(wolf.outcome).toContain(`${roll < 0.5 ? "抓到异色" : "未抓到异色"}（50%）`);
    expect(wolf.effects.enqueueEvents![0]!.title).toContain(roll < 0.5 ? "异色到手" : "抓狼收工");
  });

  it.each([
    [0, 0, 2, 4], [0, 0.9, 2, 2], [0.9, 0, 3, 4], [0.9, 0.9, 3, 2],
  ])("draws version %s and wolf %s independently", (versionRoll, wolfRoll, san, money) => {
    const event = makeEvent(makeState(), versionRoll, wolfRoll);
    expect(decisionChoice(event, "grad-sim").effects.san).toBe(san);
    expect(decisionChoice(event, "kings").effects.money).toBe(money);
  });

  it.each([
    [6, false, -5], [8, false, -4], [11, false, -6], [11, true, -5],
  ] as const)("applies month %s parasol %s to fatigue, not recovery", (month, hasParasol, san) => {
    const state = makeState();
    state.month = month;
    state.eventSupport.hasParasol = hasParasol;
    const event = makeEvent(state, 0.9);
    expect(decisionChoice(event, "kings").effects.san).toBe(san);
    expect(decisionChoice(event, "grad-sim").effects.san).toBe(3);
  });

  it.each([[2, 0, -10], [1, -20, 0]])("respects SAN modifiers %s and %s and the zero floor", (multiplier, delta, san) => {
    const state = makeState();
    state.buffs = [{
      id: "test-san-cost", name: "Test cost", source: "test", timing: "monthly", remainingMonths: 1,
      activeOperationSanMultiplier: multiplier, activeOperationSanDelta: delta,
    }];
    const event = makeEvent(state, 0.9);
    expect(decisionChoice(event, "kings").effects.san).toBe(san);
    expect(decisionChoice(event, "grad-sim").effects.san).toBe(3);
  });

  it.each([
    ["terraria", 0, 0, -4, 0], ["magic-tower", 0, 0, -6, 0],
    ["grad-sim", 0, 0, 2, 0], ["grad-sim", 0.9, 0, 3, 0],
    ["kings", 0, 0, -5, 4], ["kings", 0, 0.9, -5, 2],
  ] as const)("settles %s rolls %s/%s only once on final confirmation", (branch, versionRoll, wolfRoll, san, money) => {
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const initial = makeState();
    const event = makeEvent(initial, versionRoll, wolfRoll);
    let state = { ...initial, eventQueue: [createEventQueueItem(event, 1)] };
    state = resolve(state);
    expect(state.player).toEqual(initial.player);
    state = resolve(state, branch);
    expect(state.player).toEqual(initial.player);
    const result = state.eventQueue[0]!;
    expect(result.stage).toBe("result");
    state = resolve(state);
    expect(state.player.san).toBe(initial.player.san + san);
    expect(state.player.money).toBe(initial.player.money + money);
    expect(state.player.social).toBe(branch === "terraria" ? 1 : 0);
    expect(state.player.research).toBe(branch === "magic-tower" ? 1 : 0);
    expect(state.eventQueue).toHaveLength(0);
    expect(state.eventHistory.at(-1)!.stages.at(-1)!.description).toBe(result.description);
    expect(state.log.some((entry) => entry.text.includes(result.completionLog!))).toBe(true);
    const repeated = dispatchAction(state, "resolve-event", { eventId: result.id, eventChoiceId: result.choices[0]!.id });
    expect(repeated.player).toEqual(state.player);
    expect(repeated.eventHistory).toEqual(state.eventHistory);
  });

  it.each(["grad-sim", "kings"] as const)("preserves %s rolls across saves, deferral and attribute tier changes", (branch) => {
    const initial = makeState();
    const event = makeEvent(initial, 0.9, 0.9);
    let state: GameState = JSON.parse(JSON.stringify({ ...initial, eventQueue: [createEventQueueItem(event, 1)] }));
    state.month = 7;
    state.totalMonths = 7;
    state.player.research = 18;
    state.player.social = 18;
    state = resolve(state);
    const decision = getResolvableQueuedEvent(state, state.eventQueue[0]!);
    expect(decisionChoice(decision, "grad-sim").effects.san).toBe(3);
    expect(decisionChoice(decision, "kings").effects).toMatchObject({ san: -4, money: 2 });
    state = resolve(state, branch);
    state = resolve(state);
    expect(state.player.san).toBe(branch === "grad-sim" ? 13 : 6);
    expect(state.player.money).toBe(branch === "grad-sim" ? 10 : 12);
  });

  it("keeps every story within two paragraphs, including capped attributes", () => {
    const state = makeState();
    state.player.research = 20;
    state.player.social = 20;
    for (const roll of [0, 0.9]) {
      const event = makeEvent(state, roll, roll);
      const decision = event.choices[0]!.effects.enqueueEvents![0]!;
      const scenes = [event, decision, ...decision.choices.map((choice) => choice.effects.enqueueEvents![0]!)];
      for (const scene of scenes) {
        const story = scene.description.split("\n\n机制结算\n")[0]!;
        expect(story.split("\n\n").length).toBeLessThanOrEqual(2);
        expect(story).not.toMatch(/抵抗|达到.*上限|熟练档位/u);
      }
    }
  });
});

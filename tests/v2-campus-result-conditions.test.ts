import { afterEach, describe, expect, it, vi } from "vitest";
import { dispatchAction } from "../src/core/v2-engine";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { previewPaperCompetitionResolution } from "../src/core/v2-paper-competition";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { createCampusRandomEventById } from "../src/core/v2-random-events-campus";
import { createPaperCompetitionRandomEvent } from "../src/core/v2-random-events-paper-competition";
import type { GameState, PendingEvent } from "../src/core/v2-types";

function makeState(): GameState {
  const state = createStartedGameState("normal");
  return {
    ...state,
    month: 6,
    totalMonths: 6,
    eventQueue: [],
    eventHistory: [],
    log: [],
    player: { ...state.player, san: 20, money: 20, favor: 0, social: 5 },
    eventCounters: { ...state.eventCounters, badmintonCount: 0, pokerCount: 0 },
    eventSupport: { ...state.eventSupport, hasBadmintonRacket: false, hasStrongBodyTalent: false },
  };
}

function getBranch(state: GameState, eventId: number, label: string, roll = 0.5) {
  const event = createCampusRandomEventById(eventId, state, () => roll)!;
  const decision = event.choices[0]!.effects.enqueueEvents![0]!;
  const choice = decision.choices.find((entry) => entry.label === label)!;
  const result = choice.effects.enqueueEvents![0]!;
  expect(result.description.split("\n\n机制结算\n")[1]).toBe(choice.outcome);
  expect(result.completionLog).toBe(`${label}：${choice.outcome}`);
  expect(event.description).not.toMatch(/条件：|[<>≥≤]|概率\s*\d/u);
  expect(decision.description).not.toMatch(/条件：|[<>≥≤]|概率\s*\d/u);
  return { event, choice, result };
}

function finishEvent(state: GameState, event: PendingEvent, label: string): GameState {
  let next = { ...state, eventQueue: [createEventQueueItem(event, 1)] };
  for (let stage = 0; stage < 3; stage += 1) {
    const current = next.eventQueue[0]!;
    const choice = stage === 1 ? current.choices.find((entry) => entry.label === label)! : current.choices[0]!;
    next = dispatchAction(next, "resolve-event", { eventId: current.id, eventChoiceId: choice.id });
  }
  return next;
}

afterEach(() => vi.restoreAllMocks());

describe("campus result conditions", () => {
  it("keeps dinner attendance and KTV song fixed when resistance tiers change", () => {
    const build = (social: number, favor: number) => {
      const state = makeState();
      state.player = { ...state.player, social, favor };
      const rolls = [0.2, 0.9, 0.1, 0.9, 0.7];
      let index = 0;
      const event = createCampusRandomEventById(7, state, () => rolls[index++] ?? 0)!;
      const choices = event.choices[0]!.effects.enqueueEvents![0]!.choices;
      return { dinner: choices.find((choice) => choice.label === "聚餐")!,
        song: choices.find((choice) => choice.label === "KTV 唱歌")! };
    };
    const baseline = build(5, 5);
    expect(baseline.song).toBeDefined();
    expect(baseline.dinner.outcome).toContain("导师请客");
    for (const [social, favor] of [[6, 5], [5, 6], [18, 18]]) {
      const changed = build(social!, favor!);
      expect(changed.dinner.outcome).toContain("导师请客");
      expect(changed.dinner.effects.money).toEqual(baseline.dinner.effects.money);
      expect(changed.song.effects.enqueueEvents![0]!.description.split("机制结算")[0])
        .toEqual(baseline.song.effects.enqueueEvents![0]!.description.split("机制结算")[0]);
    }
  });

  it.each([
    [5, "导师好感 < 6", 3],
    [6, "6 ≤ 导师好感 < 12", 5],
    [11, "6 ≤ 导师好感 < 12", 5],
    [12, "12 ≤ 导师好感 < 18", 7],
    [17, "12 ≤ 导师好感 < 18", 7],
    [18, "导师好感 ≥ 18", 9],
  ] as const)("records favor %s with its actual salary tier", (favor, condition, gain) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = makeState();
    state.player.favor = favor;
    const { event, choice, result } = getBranch(state, 8, "发劳务费");
    expect(choice.outcome).toBe(`${condition}｜金币 +${gain}。`);
    expect(result.choices[0]?.effects.money).toBe(gain);
    const completed = finishEvent(state, event, "发劳务费");
    expect(completed.player.money).toBe(state.player.money + gain);
    expect(completed.eventHistory.at(-1)!.stages.at(-1)!.description).toBe(result.description);
    expect(completed.log[0]!.text).toContain(result.completionLog);
  });

  it.each([
    [19, true, "97 < 100", false],
    [20, true, "100 ≥ 100", true],
    [20, false, "60 < 100", false],
  ] as const)("reports badminton strength at SAN %s with racket %s", (san, hasRacket, condition, wins) => {
    const state = makeState();
    state.player.san = san;
    state.eventSupport.hasBadmintonRacket = hasRacket;
    const { choice } = getBranch(state, 7, "打羽毛球");
    expect(choice.outcome).toContain(`羽毛球实力 ${condition}`);
    expect(choice.outcome).toContain(wins ? "获胜" : "落败");
    expect(choice.outcome).toContain("胜率提升");
    expect(choice.outcome).not.toContain("SAN倍率");
    expect(choice.effects.eventSupportUpdates).toEqual(wins ? { hasStrongBodyTalent: true } : {});
    expect(choice.effects.illnessProbabilityDelta).toBe(-10);
  });

  it.each([0, 3, 8])("reports poker odds and stake with %s money", (money) => {
    for (const [count, roll, label, probability] of [
      [0, 0.399, "获胜", 40], [0, 0.4, "落败", 60],
      [3, 0.699, "获胜", 70], [3, 0.7, "落败", 30], [6, 0.999, "获胜", 100],
    ] as const) {
      const state = makeState();
      state.player.money = money;
      state.eventCounters.pokerCount = count;
      const { choice } = getBranch(state, 7, "打德州扑克", roll);
      expect(choice.outcome).toContain(`${label}（${probability}%）`);
      expect(choice.outcome).toContain(money === 0 ? "本金 0" : `押注 ${Math.min(money, 5)} 金币`);
      const currentWinRate = Math.min(100, 40 + count * 10);
      expect(choice.outcome).not.toMatch(/\d+→\d+次/u);
      if (currentWinRate < 100) expect(choice.outcome).toContain(`胜率 ${currentWinRate}%→${Math.min(100, currentWinRate + 10)}%`);
      else expect(choice.outcome).not.toContain("100%→100%");
      expect(choice.outcome).toContain("｜结果：");
      expect(choice.effects.money ?? 0).toBe(money === 0 ? 0 : (label === "获胜" ? 1 : -1) * Math.min(money, 5));
    }
  });

  it.each([0.499, 0.5])("keeps attendance-based dinner branches and saved results aligned at roll %s", (roll) => {
    vi.spyOn(Math, "random").mockReturnValue(roll);
    for (const [eventId, label, outcomeLabel] of [
      [7, "聚餐", "导师请客"],
      [13, "自己重装", roll < 0.5 ? "重装成功" : "重装失败"],
      [13, "淘宝找人", roll < 0.5 ? "维修成功" : "维修翻车"],
    ] as const) {
      const state = makeState();
      const { event, choice, result } = getBranch(state, eventId, label, roll);
      const expectedProbability = eventId === 7 ? 60 : 50;
      expect(choice.outcome).toContain(`条件：${outcomeLabel}（${expectedProbability}%）`);
      expect(choice.outcome).toContain("｜结果：");
      const completed = finishEvent(state, event, label);
      expect(completed.eventHistory.at(-1)!.stages.at(-1)!.description).toBe(result.description);
      expect(completed.log[0]!.text).toContain(result.completionLog);
    }
  });

  it.each(["idea", "experiment"] as const)("explains invalid %s paper conditions", (field) => {
    const state = makeState();
    const paper = { ...createDraftPaper(6, 0, () => 0), idea: 40, experiment: 40 };
    const resolution = { paperId: paper.id, field, multiplier: 0.5, sanCost: 1 };
    for (const [overrides, condition] of [
      [{ [field]: 0 }, `${field === "idea" ? "idea" : "实验"} ≤ 0`],
      [{ [field]: -1 }, `${field === "idea" ? "idea" : "实验"} ≤ 0`],
      [{ [field]: NaN }, "不是有限数值"],
      [{ nonFirstAuthor: true }, "非一作"],
    ] as const) {
      const preview = previewPaperCompetitionResolution({ ...state, papers: [{ ...paper, ...overrides }] }, resolution);
      expect(preview.applicable).toBe(false);
      expect(preview.resolvedOutcome).toContain(condition);
      expect(preview.resolvedOutcome).toContain("｜结果：本次不作处理");
    }
  });

  it.each([17, 18] as const)("saves the current paper condition in event %s history and logs", (eventId) => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const state = makeState();
    state.papers = [{ ...createDraftPaper(6, 0, () => 0), idea: 40, experiment: 40 }];
    const event = createPaperCompetitionRandomEvent(eventId, state, () => 0)!;
    const field = eventId === 17 ? "idea" : "experiment";
    const changed = { ...state, papers: [{ ...state.papers[0]!, [field]: 0 }] };
    const completed = finishEvent(changed, event, "大幅修改");
    const condition = `条件：目标论文${field === "idea" ? "idea" : "实验"} ≤ 0｜结果：本次不作处理`;
    expect(completed.eventHistory.at(-1)!.stages.at(-1)!.description).toContain(condition);
    expect(completed.log[0]!.text).toContain(condition);
    expect(completed.player).toEqual(changed.player);
    expect(completed.papers).toEqual(changed.papers);
  });
});

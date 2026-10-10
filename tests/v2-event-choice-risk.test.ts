import { afterEach, describe, expect, it, vi } from "vitest";
import { getEventChoiceRisk, getEventChoiceRiskDetails, getEventChoiceRiskExplanation } from "../src/core/v2-event-choice-risk";
import { createStartedGameState } from "../src/core/v2-engine-state-factory";
import { dispatchAction } from "../src/core/v2-engine";
import { getResolvableQueuedEvent } from "../src/core/v2-engine-event-resolution";
import { createEventQueueItem } from "../src/core/v2-event-queue";
import { createCcigActivityDecisionEvent } from "../src/core/v2-fixed-events-ccig-activity-events";
import { createRandomEventById } from "../src/core/v2-random-event-router";
import { applyFixedEventResolution } from "../src/core/v2-fixed-events";
import { createConferenceDecisionAct1 } from "../src/core/v2-conference-events";
import { createDraftPaper, prepareConferenceSubmission } from "../src/core/v2-paper-rules";
import { PUBLICATION_TALENT_DEFINITIONS } from "../src/core/v2-publication-talent";
import type { EventChoice, FixedEventResolution, GameState, PaperReviewSettlement, PendingEvent } from "../src/core/v2-types";

function state(): GameState {
  const initial = createStartedGameState("normal");
  return { ...initial, selectedAdvisorName: "导师", year: 2, month: 6, totalMonths: 18,
    eventQueue: [], buffs: [], player: { san: 10, research: 5, social: 5, favor: 5, money: 10 },
    advisorProgressState: { ...initial.advisorProgressState, funding: 10 },
  };
}

function event(effects: EventChoice["effects"] = {}, stage: PendingEvent["stage"] = "result"): PendingEvent {
  return { id: "risk", title: "risk", description: "", source: "fixed", blocking: true,
    deadlineMonths: 0, chainId: "risk", stage,
    choices: [{ id: "confirm", label: "确定", outcome: "", effects }],
  };
}

function risk(current: GameState, pending: PendingEvent) {
  return getEventChoiceRisk(current, pending, pending.choices[0]!);
}

function randomDecision(current: GameState, eventId: number, roll: number): PendingEvent {
  const root = createRandomEventById(eventId, current, () => roll).event!;
  return { ...root.choices[0]!.effects.enqueueEvents![0]!,
    randomReplay: { eventId, serial: current.totalRandomEventCount, rolls: [roll] },
  };
}

function reviewFixture(sanChange = 0, accepted = true) {
  const current = state();
  const paper = prepareConferenceSubmission({ ...createDraftPaper(3, 0, () => 0),
    id: "risk-review", idea: 100, experiment: 100, writing: 100 }, "A", 3, 1);
  current.papers = [paper];
  current.publicationTalentState = { claimedIds: PUBLICATION_TALENT_DEFINITIONS.map((definition) => definition.id) };
  const settlement: PaperReviewSettlement = {
    paperId: paper.id, target: "A", accepted, acceptType: accepted ? "Poster" : null,
    submittedScore: 300, totalReviewScore: accepted ? 3 : -3, borderlineChance: null,
    venueInfluence: 1, reviewStrictnessMultiplier: 1, scoreGain: accepted ? 4 : 0,
    reviewerSanChange: sanChange,
    reports: [{ reviewer: "reviewer", focus: "idea", effectiveScore: 100,
      decision: accepted ? "Accept" : "Reject", reviewScore: accepted ? 1 : -1,
      baseSanChange: sanChange, sanChange }],
  };
  return { current, settlement, pending: event({ paperReviewSettlement: settlement }) };
}

afterEach(() => vi.restoreAllMocks());

describe("event choice risk explanations", () => {
  it.each([
    ["san", "SAN", "不堪重负"], ["money", "金币", "穷困潦倒"], ["research", "科研能力", "用脑过度"],
    ["social", "社交能力", "被孤立"], ["favor", "导师好感", "逐出师门"],
  ] as const)("identifies %s and its strict threshold", (resource, label, consequence) => {
    const current = state();
    current.player[resource] = 0.75;
    const pending = event({ [resource]: -1 });
    expect(getEventChoiceRiskDetails(current, pending, pending.choices[0]!)).toEqual({
      risk: "certain",
      explanation: expect.stringContaining(`失败结局：${consequence}`),
      reasons: [{ resource, risk: "certain", threshold: 0, projectedMin: -0.25, projectedMax: -0.25,
        text: `${label}不足，结算后为-0.25，将进入失败结局：${consequence}。`,
      }],
    });
    const explanation = getEventChoiceRiskExplanation(current, pending, pending.choices[0]!);
    expect(explanation).toBe(`${label}不足，结算后为-0.25，将进入失败结局：${consequence}。`);
    expect(explanation).toBe(getEventChoiceRiskDetails(current, pending, pending.choices[0]!)!.explanation);
    expect(explanation).not.toContain("暴毙");
    pending.choices[0]!.effects = { [resource]: -0.75 };
    expect(getEventChoiceRiskDetails(current, pending, pending.choices[0]!)).toBeNull();
    expect(getEventChoiceRiskExplanation(current, pending, pending.choices[0]!)).toBeNull();
  });

  it("lists lab funding and personal money separately after rounded settlement", () => {
    const current = state();
    current.player.money = 0.01;
    current.advisorProgressState.funding = 0.01;
    const pending = event({ money: -0.015, advisorProgressStateDeltas: { funding: -0.015 } });
    const details = getEventChoiceRiskDetails(current, pending, pending.choices[0]!)!;
    expect(details.reasons.map(({ resource, projectedMin, projectedMax }) => ({ resource, projectedMin, projectedMax })))
      .toEqual([
        { resource: "funding", projectedMin: -0.01, projectedMax: -0.01 },
        { resource: "money", projectedMin: -0.01, projectedMax: -0.01 },
      ]);
    const explanation = getEventChoiceRiskExplanation(current, pending, pending.choices[0]!);
    expect(explanation).toBe("实验室科研经费不足，结算后为-0.01，将进入失败结局：实验室破产。\n金币不足，结算后为-0.01，将进入失败结局：穷困潦倒。");
    expect(details.explanation).toBe(explanation);
    for (const unenrolled of [{ ...current, selectedAdvisorName: null }, { ...current, totalMonths: 0 }]) {
      expect(getEventChoiceRiskDetails(unenrolled, pending, pending.choices[0]!)!.reasons.map((reason) => reason.resource)).toEqual(["money"]);
    }
  });

  it("distinguishes possible reasons from certain reasons without revealing stored rolls", () => {
    const current = state();
    current.player.social = 0;
    let previousExplanation: string | null = null;
    for (const roll of [0, 0.999999]) {
      const pending = randomDecision(current, 13, roll);
      const choice = pending.choices.find((candidate) => candidate.label === "自己重装")!;
      const snapshot = structuredClone({ current, pending });
      const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("global RNG"); });
      for (let iteration = 0; iteration < 3; iteration += 1) {
        const details = getEventChoiceRiskDetails(current, pending, choice)!;
        expect(details.risk).toBe("possible");
        expect(details.reasons).toEqual([{ resource: "social", risk: "possible", threshold: 0,
          projectedMin: -1, projectedMax: 0, text: "社交能力可能不足（结算后-1～0），可能进入失败结局：被孤立。",
        }]);
        const explanation = getEventChoiceRiskExplanation(current, pending, choice);
        expect(explanation).toBe("社交能力可能不足（结算后-1～0），可能进入失败结局：被孤立。");
        expect(details.explanation).toBe(explanation);
        if (previousExplanation) expect(explanation).toBe(previousExplanation);
        previousExplanation = explanation;
      }
      expect({ current, pending }).toEqual(snapshot);
      expect(random).not.toHaveBeenCalled();
      random.mockRestore();
    }
    current.player.san = 0;
    const pending = randomDecision(current, 13, 0);
    const choice = pending.choices.find((candidate) => candidate.label === "自己重装")!;
    const details = getEventChoiceRiskDetails(current, pending, choice)!;
    expect(details.risk).toBe("certain");
    expect(details.reasons.map(({ resource, risk: reasonRisk }) => [resource, reasonRisk]))
      .toEqual([["san", "certain"], ["social", "possible"]]);
    expect(details.explanation.split("\n")).toEqual(details.reasons.map((reason) => reason.text));
    expect(details.reasons[0]!.text).toContain("将进入失败结局：不堪重负。");
    expect(details.reasons[1]!.text).toBe("社交能力可能不足（结算后-1～0），可能进入失败结局：被孤立。");
  });

  it("explains a possible money shortage in one line", () => {
    const current = state();
    current.player.money = 0;
    const pending = randomDecision(current, 7, 0);
    const choice = pending.choices.find((candidate) => candidate.label === "聚餐")!;
    const details = getEventChoiceRiskDetails(current, pending, choice)!;
    expect(details.risk).toBe("possible");
    expect(details.explanation).toBe(details.reasons[0]!.text);
    expect(details.explanation).toBe("金币可能不足（结算后-2～0），可能进入失败结局：穷困潦倒。");
  });

  it.each([
    [0.2, -0.3, "-0.1"],
    [0, -1.236, "-1.24"],
    [0, -0.004, "略低于 0"],
  ] as const)("formats projected decimals without changing the lethal threshold (%s, %s)", (initial, delta, display) => {
    const current = state();
    current.player.san = initial;
    const pending = event({ san: delta });
    const details = getEventChoiceRiskDetails(current, pending, pending.choices[0]!)!;
    expect(details.risk).toBe("certain");
    expect(details.reasons[0]!.projectedMin).toBe(initial + delta);
    expect(details.explanation).toBe(`SAN不足，结算后为${display}，将进入失败结局：不堪重负。`);
  });

  it("omits rescued SAN but retains insufficient registration funding", () => {
    const { current, pending } = reviewFixture(-3);
    current.player.san = 0;
    current.publicationTalentState = { claimedIds: [] };
    expect(getEventChoiceRiskExplanation(current, pending, pending.choices[0]!)).toBeNull();
    current.advisorProgressState.funding = 0;
    expect(getEventChoiceRiskDetails(current, pending, pending.choices[0]!)!.reasons.map((reason) => reason.resource)).toEqual(["funding"]);
    current.publicationTalentState = { claimedIds: PUBLICATION_TALENT_DEFINITIONS.map((definition) => definition.id) };
    expect(getEventChoiceRiskDetails(current, pending, pending.choices[0]!)!.reasons.map((reason) => reason.resource)).toEqual(["funding", "san"]);
    current.shopState.chairUpgrade = "spike";
    expect(getEventChoiceRiskDetails(current, pending, pending.choices[0]!)!.reasons.map((reason) => reason.resource)).toEqual(["funding"]);
  });

  it("checks only the final confirmed batch including deferred changes and reviewer rescue", () => {
    const { current, pending } = reviewFixture(2, false);
    current.player.san = 1;
    pending.choices[0]!.effects.san = -3;
    expect(getEventChoiceRiskExplanation(current, pending, pending.choices[0]!)).toBeNull();
    const decision = event({ money: -11, enqueueEvents: [event({ money: 1 })] }, "act2");
    expect(getEventChoiceRiskExplanation(current, decision, decision.choices[0]!)).toBeNull();
    decision.deferredStatePatch = [{ path: ["player", "money"], previousValue: 10, value: 9 }];
    expect(getEventChoiceRiskDetails(current, decision, decision.choices[0]!)!.reasons).toEqual([
      expect.objectContaining({ resource: "money", projectedMin: -1, projectedMax: -1 }),
    ]);
    expect(getEventChoiceRiskExplanation({ ...current, phase: "finished" }, decision, decision.choices[0]!)).toBeNull();
  });
});

describe("event choice immediate ending risk", () => {
  it.each(["san", "research", "social", "favor", "money"] as const)("uses strict below-zero boundaries for %s", (attribute) => {
    const current = state();
    current.player[attribute] = 0.75;
    expect(risk(current, event({ [attribute]: -0.75 }))).toBeNull();
    expect(risk(current, event({ [attribute]: -1 }))).toBe("certain");
  });

  it("uses already-resisted deltas without resisting again", () => {
    const current = state();
    current.player.social = 6;
    expect(risk(current, event({ social: -6.25 }))).toBe("certain");
  });

  it("rounds money and funding exactly like settlement", () => {
    const current = state();
    current.player.money = 0.01;
    current.advisorProgressState.funding = 0.01;
    expect(risk(current, event({ money: -0.014, advisorProgressStateDeltas: { funding: -0.014 } }))).toBeNull();
    expect(risk(current, event({ money: -0.015 }))).toBe("certain");
    expect(risk(current, event({ advisorProgressStateDeltas: { funding: -0.015 } }))).toBe("certain");
  });

  it.each([null, "导师"])("only checks lab bankruptcy after enrollment with advisor %s", (selectedAdvisorName) => {
    const current = { ...state(), selectedAdvisorName };
    const pending = event({ advisorProgressStateDeltas: { funding: -11 } });
    expect(risk(current, pending)).toBe(selectedAdvisorName ? "certain" : null);
    expect(risk({ ...current, totalMonths: 0 }, pending)).toBeNull();
  });

  it("applies cap, restore and available rest before checking SAN", () => {
    const current = state();
    current.player.san = 1;
    expect(risk(current, event({ san: -3, restAction: true }))).toBeNull();
    expect(risk({ ...current, actionState: { ...current.actionState, used: current.actionState.limit } }, event({ san: -3, restAction: true }))).toBe("certain");
    expect(risk(current, event({ san: -99, restoreSanToCap: true, sanCapDelta: -100 }))).toBeNull();
    expect(risk({ ...current, shopState: { ...current.shopState, chairUpgrade: "hammock" } }, event({ san: -6, restAction: true }))).toBeNull();
  });

  it("respects spike emergency recovery without masking another lethal stat", () => {
    const current = state();
    current.shopState.chairUpgrade = "spike";
    expect(risk(current, event({ san: -99 }))).toBeNull();
    expect(risk(current, event({ san: -99, money: -11 }))).toBe("certain");
  });

  it("rebases deferred numeric changes on current balances exactly once", () => {
    const current = state();
    current.player.money = 2;
    const pending = event({ money: -1 });
    pending.deferredStatePatch = [{ path: ["player", "money"], previousValue: 10, value: 8 }];
    expect(risk(current, pending)).toBe("certain");
    expect(risk({ ...current, player: { ...current.player, money: 3 } }, pending)).toBeNull();
    pending.deferredStatePatch = [{ path: ["advisorProgressState", "funding"], previousValue: 20, value: 9 }];
    expect(risk(state(), pending)).toBe("certain");
  });

  it("combines the selected path with one same-chain result but not later decisions", () => {
    const current = state();
    current.player.money = 1;
    const result = event({ money: -2 });
    const decision = event({ money: 1, enqueueEvents: [result] }, "act2");
    expect(risk(current, decision)).toBeNull();
    decision.choices[0]!.effects.money = 0;
    expect(risk(current, decision)).toBe("certain");
    expect(risk(current, { ...decision, stage: "act1" })).toBeNull();
    expect(risk(current, event({ enqueueEvents: [{ ...result, chainId: "other" }] }, "act2"))).toBeNull();
    expect(risk(current, event({ enqueueEvents: [{ ...result, stage: "act2" }] }, "act2"))).toBeNull();
    expect(risk(current, event({ enqueueEvents: [{ ...result, choices: [...result.choices, { id: "safe", label: "safe", outcome: "", effects: {} }] }] }, "act2"))).toBeNull();
  });

  it("ignores future monthly buffs and finished games", () => {
    const pending = event({ addBuffs: [{ id: "future", name: "future", source: "test", remainingMonths: 1, timing: "monthly", monthlyStats: { san: -100 } }] });
    expect(risk(state(), pending)).toBeNull();
    expect(risk({ ...state(), phase: "finished" }, event({ san: -100 }))).toBeNull();
  });

  it("classifies teachers errands from both actual branches and current errand probability", () => {
    const current = state();
    current.player.san = 0;
    const pending = event({ fixedEventResolution: { kind: "teachers-day-message" } }, "act2");
    pending.chainId = "teachers-day";
    expect(risk(current, pending)).toBe("possible");
    current.eventCounters.teachersDayErrandCount = 6;
    expect(risk(current, pending)).toBe("certain");
    current.player.favor = 6;
    expect(risk(current, pending)).toBeNull();
  });

  it.each([
    ["teachers-day-gift", "teachers-day", "certain"],
    ["teachers-day-stamp", "teachers-day", "certain"],
    ["summer-vacation-travel", "summer-vacation", "certain"],
    ["summer-vacation-home", "summer-vacation", null],
    ["summer-vacation-research", "summer-vacation", null],
    ["winter-vacation-rest", "winter-vacation", null],
    ["scholarship-apply", "scholarship", null],
    ["ccig-self", "ccig-y2-m6", "certain"],
    ["ccig-advisor", "ccig-y2-m6", "certain"],
    ["ccig-skip", "ccig-y2-m6", null],
  ] as const)("projects fixed %s results without global RNG", (kind, chainId, expected) => {
    const current = state();
    current.player.money = 0;
    current.advisorProgressState.funding = 0;
    const pending = event({ fixedEventResolution: { kind, teachersDayGift: "tea" } }, "act2");
    pending.chainId = chainId;
    vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("global RNG"); });
    expect(risk(current, pending)).toBe(expected);
  });

  it.each([0, 0.999999])("does not reveal stored random rolls %s before choosing", (roll) => {
    const current = state();
    current.player.favor = 0;
    current.player.money = 1;
    current.player.social = 0;
    for (const [eventId, label] of [[6, "随便水一下"], [7, "聚餐"], [13, "自己重装"]] as const) {
      const pending = randomDecision(current, eventId, roll);
      expect(getEventChoiceRisk(current, pending, pending.choices.find((choice) => choice.label === label)!)).toBe("possible");
    }
  });

  it("reports certain death when every reinstall branch exhausts SAN, but not future repair buffs", () => {
    const current = state();
    current.player.san = 0;
    const pending = randomDecision(current, 13, 0);
    expect(getEventChoiceRisk(current, pending, pending.choices.find((choice) => choice.label === "自己重装")!)).toBe("certain");
    expect(getEventChoiceRisk(current, pending, pending.choices.find((choice) => choice.label === "催导师修")!)).toBeNull();
  });

  it("does not mark poker losses ending exactly at zero as dangerous", () => {
    const current = state();
    current.player.money = 0.5;
    const pending = randomDecision(current, 7, 0.999999);
    expect(getEventChoiceRisk(current, pending, pending.choices.find((choice) => choice.label === "打德州扑克")!)).toBeNull();
  });

  it("uses resolved result deltas instead of re-enumerating hidden choices", () => {
    const current = state();
    current.player.favor = 0;
    for (const loss of [0, -1]) {
      const pending = event();
      pending.randomReplay = { eventId: 6, serial: 0, rolls: [0] };
      pending.deferredStatePatch = [{ path: ["player", "favor"], previousValue: 0, value: loss }];
      expect(risk(current, pending)).toBe(loss < 0 ? "certain" : null);
    }
  });

  it("includes mentoring and repeated-reading SAN costs without predicting recruitment outcomes", () => {
    const current = state();
    current.player.san = 0;
    for (const [eventId, label] of [[1, "亲自指导"], [2, "认真审稿"]] as const) {
      const pending = randomDecision(current, eventId, 0.999999);
      expect(getEventChoiceRisk(current, pending, pending.choices.find((choice) => choice.label === label)!)).toBe("certain");
    }
  });

  it("keeps state and event unchanged and never consumes RNG across repeated calls", () => {
    const current = state();
    current.player.social = 0;
    const pending = randomDecision(current, 13, 0.999999);
    const snapshot = structuredClone({ current, pending });
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("global RNG"); });
    for (let iteration = 0; iteration < 3; iteration += 1) {
      expect(getEventChoiceRisk(current, pending, pending.choices.find((choice) => choice.label === "自己重装")!)).toBe("possible");
    }
    expect({ current, pending }).toEqual(snapshot);
    expect(random).not.toHaveBeenCalled();
  });

  it("projects fixed actual result effects once after the branch is resolved", () => {
    const current = state();
    current.player.money = 2;
    const resolution: FixedEventResolution = { kind: "summer-vacation-travel" };
    const result = applyFixedEventResolution(current, resolution, () => 0).enqueueEvents![0]!;
    expect(risk(current, result)).toBe("certain");
    expect(risk({ ...current, player: { ...current.player, money: 3 } }, result)).toBeNull();
  });

  it.each([0, 1, 12])("warns for the VALSE meal in runtime act2 and act3 after a %i-month shift", (delta) => {
    const initial = state();
    initial.player.money = 1;
    const decision = createCcigActivityDecisionEvent(initial, "advisor", ["导师报销"]);
    let current = { ...initial, eventQueue: [createEventQueueItem(decision, initial.totalMonths)] };
    if (delta) current = dispatchAction(current, "debug-shift-month", { delta });
    const pending = getResolvableQueuedEvent(current, current.eventQueue[0]!);
    const meal = pending.choices.find((choice) => choice.label === "品尝当地美食")!;
    const snapshot = structuredClone({ current, pending });
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("global RNG"); });
    for (let iteration = 0; iteration < 3; iteration += 1) {
      expect(getEventChoiceRiskDetails(current, pending, meal)).toMatchObject({
        risk: "certain", explanation: "金币不足，结算后为-1，将进入失败结局：穷困潦倒。",
        reasons: [{ resource: "money", threshold: 0, projectedMin: -1, projectedMax: -1 }],
      });
      expect(getEventChoiceRisk({ ...current, player: { ...current.player, money: 2 } }, pending, meal)).toBeNull();
    }
    expect({ current, pending }).toEqual(snapshot);
    expect(random).not.toHaveBeenCalled();
    random.mockReturnValue(0);
    current = dispatchAction(current, "resolve-event", { eventId: pending.id, eventChoiceId: meal.id });
    expect(current.player.money).toBe(1);
    const result = getResolvableQueuedEvent(current, current.eventQueue[0]!);
    expect(result).toMatchObject({ stage: "result", chainId: pending.chainId });
    random.mockImplementation(() => { throw new Error("global RNG"); });
    expect(getEventChoiceRiskExplanation(current, result, result.choices[0]!))
      .toBe("金币不足，结算后为-1，将进入失败结局：穷困潦倒。");
    expect(risk(current, { ...result, stage: "act3" })).toBe("certain");
    expect(risk({ ...current, player: { ...current.player, money: 2 } }, result)).toBeNull();
    random.mockReturnValue(0);
    const settled = dispatchAction(current, "resolve-event", { eventId: result.id, eventChoiceId: result.choices[0]!.id });
    expect(settled.player.money).toBe(-1);
    expect(settled.phase).toBe("finished");
  });

  it.each([true, false])("uses the resolver calendar to identify VALSE results when the display chain differs (calendar=%s)", (withCalendar) => {
    const current = state();
    current.player.money = 1;
    const pending = createCcigActivityDecisionEvent({ ...current, year: 1, month: 9 }, "advisor", []);
    pending.chainId = "display-ccig-activity";
    const meal = pending.choices.find((choice) => choice.label === "品尝当地美食")!;
    if (!withCalendar) delete meal.effects.fixedEventResolution!.ccigCalendar;
    meal.effects.enqueueEvents = [{ ...event({ money: -99 }), chainId: "unrelated" }];
    const snapshot = structuredClone({ current, pending });
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("global RNG"); });
    expect(getEventChoiceRiskDetails(current, pending, meal)).toMatchObject({
      risk: "certain", reasons: [{ resource: "money", projectedMin: -1, projectedMax: -1 }],
    });
    expect(getEventChoiceRisk({ ...current, player: { ...current.player, money: 2 } }, pending, meal)).toBeNull();
    expect({ current, pending }).toEqual(snapshot);
    expect(random).not.toHaveBeenCalled();
  });

  it("projects conference travel costs without predicting later activity choices", () => {
    const current = state();
    current.advisorProgressState.funding = 0;
    current.player.money = 0;
    const root = createConferenceDecisionAct1({
      id: "conference-risk", conferenceName: "CVPR", conferenceYear: 2026, city: "上海", country: "中国",
      region: "domestic", grade: "A", paperCount: 1, paperIds: ["paper-risk"],
    }, { ...current, research: current.player.research, social: current.player.social, favor: current.player.favor }, () => 0);
    const decision = root.choices[0]!.effects.enqueueEvents![0]!;
    expect(risk(current, root)).toBeNull();
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("global RNG"); });
    for (const choice of decision.choices) {
      expect(getEventChoiceRisk(current, decision, choice)).toBe(choice.id === "proxy" ? null : "certain");
    }
    expect(random).not.toHaveBeenCalled();
  });

  it("leaves deferred fixed branches untouched when warning repeatedly", () => {
    const current = state();
    current.player.san = 0;
    const pending = event({ fixedEventResolution: { kind: "teachers-day-message" } }, "act2");
    pending.chainId = "teachers-day";
    const snapshot = structuredClone({ current, pending });
    vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("global RNG"); });
    expect(risk(current, pending)).toBe("possible");
    expect(risk(current, pending)).toBe("possible");
    expect({ current, pending }).toEqual(snapshot);
  });

  it.each([0, 0.99, 1])("includes automatic acceptance registration at funding %s", (funding) => {
    const { current, pending } = reviewFixture();
    current.advisorProgressState.funding = funding;
    const snapshot = structuredClone({ current, pending });
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("global RNG"); });
    expect(risk(current, pending)).toBe(funding < 1 ? "certain" : null);
    expect({ current, pending }).toEqual(snapshot);
    expect(random).not.toHaveBeenCalled();
  });

  it.each(["rejected", "coauthor", "paid", "no-advisor", "missing-paper"] as const)("does not charge acceptance registration for %s", (condition) => {
    const { current, pending } = reviewFixture(0, condition !== "rejected");
    current.advisorProgressState.funding = 0;
    if (condition === "coauthor") current.papers[0]!.nonFirstAuthor = true;
    if (condition === "paid") current.advisorProgressState.paidConferenceRegistrationPaperIds = [current.papers[0]!.id];
    if (condition === "no-advisor") current.selectedAdvisorName = null;
    if (condition === "missing-paper") current.papers = [];
    vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("global RNG"); });
    expect(risk(current, pending)).toBeNull();
  });

  it.each([false, true])("includes actual reviewer SAN once for accepted=%s", (accepted) => {
    const { current, pending, settlement } = reviewFixture(-2, accepted);
    current.player.san = 1;
    settlement.reviewerSanChange = 99;
    vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("global RNG"); });
    expect(risk(current, pending)).toBe("certain");
    current.player.san = 2;
    expect(risk(current, pending)).toBeNull();
    current.shopState.chairUpgrade = "spike";
    current.player.san = 0;
    expect(risk(current, pending)).toBeNull();
  });

  it("allows a positive reviewer SAN change to rescue the same confirmed batch", () => {
    const { current, pending } = reviewFixture(2, false);
    current.player.san = 1;
    pending.choices[0]!.effects.san = -3;
    vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("global RNG"); });
    expect(risk(current, pending)).toBeNull();
  });

  it("lets newly earned publication talents rescue SAN only before they have been claimed", () => {
    const { current, pending } = reviewFixture(-3);
    current.player.san = 0;
    current.publicationTalentState = { claimedIds: [] };
    const snapshot = structuredClone(current);
    const random = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("global RNG"); });
    expect(risk(current, pending)).toBeNull();
    expect(current).toEqual(snapshot);
    current.publicationTalentState.claimedIds = ["first-paper", "first-a-or-journal"];
    expect(risk(current, pending)).toBe("certain");
    current.publicationTalentState.claimedIds = [];
    current.advisorProgressState.funding = 0;
    expect(risk(current, pending)).toBe("certain");
    expect(random).not.toHaveBeenCalled();
  });
});

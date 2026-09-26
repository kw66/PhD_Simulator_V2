import { describe, expect, it, vi } from "vitest";

import { createInitialState, dispatchAction } from "../src/core/v2-engine";
import { activateInternship, activateRemoteInternship, createInternshipState, getInternshipStatus } from "../src/core/v2-internship-system";
import { createDraftPaper } from "../src/core/v2-paper-rules";
import { applyResearchOperation, getResearchExperimentMoneyCost, previewResearchOperation } from "../src/core/v2-research-operation";
import { createLoverProgressState } from "../src/core/v2-lover-progression";
import { activateLover } from "../src/core/v2-lover-system";
import type { AdvisorGrantId, GameState } from "../src/core/v2-types";
import {
  applyMonthlyEffects,
  previewNextMonthEffects,
  resolveMonthlyEffects,
} from "../src/core/v2-monthly-effects";

function createPlayingMonth(month: number, totalMonths: number, san = 10) {
  const state = createInitialState();
  return {
    ...state,
    phase: "playing" as const,
    year: Math.floor((totalMonths - 1) / 12) + 1,
    month,
    totalMonths,
    player: { ...state.player, san },
    log: [],
  };
}

describe("monthly effects", () => {
  it.each([
    [null, 1, 3], ["youth", 1.25, 3.5], ["general", 1.5, 4],
    ["excellent", 1.75, 4.5], ["distinguished", 2, 5], ["academician", 2.25, 5.5],
  ] satisfies Array<[AdvisorGrantId | null, number, number]>)("accumulates fractional master and PhD salary for %s without funding", (award, master, phd) => {
    const state = createPlayingMonth(2, 2);
    state.selectedAdvisorName = "林老师";
    state.advisorProgressState.awards = award ? [{ id: award, awardedYear: 2023, startYear: 2024, endYear: 2027 }] : [];
    state.player.money = 10;
    for (const [degree, salary] of [["master", master], ["phd", phd]] as const) {
      let current: GameState = { ...state, degree };
      for (let paymentIndex = 1; paymentIndex <= 4; paymentIndex += 1) {
        const payment = Math.floor(salary * paymentIndex) - Math.floor(salary * (paymentIndex - 1));
        const before = structuredClone(current);
        for (let repeat = 0; repeat < 2; repeat += 1) {
          expect(previewNextMonthEffects(current).items.find((item) => item.id === "advisor-salary")?.stats.money).toBe(payment);
        }
        expect(current).toEqual(before);
        const settled = applyMonthlyEffects({ ...current, month: paymentIndex + 1, totalMonths: paymentIndex + 1 });
        expect(settled.resolution.items.find((item) => item.id === "advisor-salary")?.appliedStats.money).toBe(payment);
        expect(settled.nextState.player.money).toBe(10 + Math.floor(salary * paymentIndex));
        current = settled.nextState;
      }
      expect(current.advisorProgressState.salaryRemainder).toBe(0);
    }
  });

  it("retains the fractional balance across promotion and conversion to PhD", () => {
    const state = createPlayingMonth(2, 2);
    state.selectedAdvisorName = "林老师";
    state.advisorProgressState.awards = [{ id: "youth", awardedYear: 2023, startYear: 2024, endYear: 2027 }];
    const first = applyMonthlyEffects(state).nextState;
    expect(first.advisorProgressState.salaryRemainder).toBe(0.25);
    const promoted = applyMonthlyEffects({ ...first, advisorProgressState: {
      ...first.advisorProgressState,
      awards: [{ id: "general", awardedYear: 2024, startYear: 2025, endYear: 2028 }],
    } }).nextState;
    expect(promoted.player.money - first.player.money).toBe(1);
    expect(promoted.advisorProgressState.salaryRemainder).toBe(0.75);
    const phd = applyMonthlyEffects({ ...promoted, degree: "phd" }).nextState;
    expect(phd.player.money - promoted.player.money).toBe(4);
    expect(phd.advisorProgressState.salaryRemainder).toBe(0.75);
    const noAdvisor = applyMonthlyEffects({ ...phd, selectedAdvisorName: null }).nextState;
    expect(noAdvisor.advisorProgressState.salaryRemainder).toBe(0.75);
    expect(createInitialState().advisorProgressState.salaryRemainder ?? 0).toBe(0);
  });

  it("restores base SAN and applies autumn as a separate source", () => {
    const resolution = resolveMonthlyEffects(createPlayingMonth(2, 2));

    expect(resolution.player.san).toBe(12);
    expect(resolution.totals.san).toBe(2);
    expect(resolution.items.map((item) => [item.name, item.appliedStats.san])).toEqual([
      ["自动恢复", 1],
      ["秋季", 1],
    ]);
  });

  it("keeps spring and summer neutral, while winter cancels base recovery", () => {
    expect(resolveMonthlyEffects(createPlayingMonth(8, 8)).player.san).toBe(11);
    expect(resolveMonthlyEffects(createPlayingMonth(11, 11)).player.san).toBe(11);
    expect(resolveMonthlyEffects(createPlayingMonth(5, 5)).player.san).toBe(10);

    const jacketState = createPlayingMonth(5, 5);
    jacketState.eventSupport = { ...jacketState.eventSupport, hasDownJacket: true };
    expect(resolveMonthlyEffects(jacketState).player.san).toBe(11);
  });

  it("shows base recovery and winter loss separately at the SAN cap", () => {
    const resolution = resolveMonthlyEffects(createPlayingMonth(5, 5, 20));
    expect(resolution.player.san).toBe(20);
    expect(resolution.totals.san).toBe(0);
    expect(resolution.items.map((item) => [item.id, item.appliedStats.san])).toEqual([
      ["base-san-recovery", 1],
      ["winter-san-effect", -1],
    ]);
  });

  it("keeps the natural SAN recovery during the PhD stage", () => {
    const spring = { ...createPlayingMonth(8, 8), degree: "phd" as const };
    const autumn = { ...createPlayingMonth(2, 2), degree: "phd" as const };
    const winter = { ...createPlayingMonth(5, 5), degree: "phd" as const };

    expect(resolveMonthlyEffects(spring).player.san).toBe(11);
    expect(resolveMonthlyEffects(autumn).player.san).toBe(12);
    expect(resolveMonthlyEffects(winter).player.san).toBe(10);

    spring.eventSupport = { ...spring.eventSupport, hasStrongBodyTalent: true };
    expect(resolveMonthlyEffects(spring).player.san).toBe(12);
  });

  it("settles invisible pressure separately from the PhD base recovery", () => {
    const state = {
      ...createPlayingMonth(8, 8),
      buffs: [{
        id: "phd-pressure",
        name: "读博压力",
        source: "转博",
        timing: "permanent" as const,
        remainingMonths: null,
        monthlyStats: { san: -1 },
      }],
    };

    expect(resolveMonthlyEffects(state).player.san).toBe(10);
    expect(resolveMonthlyEffects(state).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "base-san-recovery", appliedStats: { san: 1 } }),
      expect.objectContaining({ id: "phd-pressure", appliedStats: { san: -1 } }),
    ]));
  });

  it.each(["beautiful", "smart"] as const)("does not charge monthly dates or grant old passive benefits for %s lovers", (type) => {
    const state = createPlayingMonth(8, 8, 10);
    state.sanCap = 20;
    const baseline = resolveMonthlyEffects(state);
    const dating = { ...state, loverState: activateLover(type, 1, "male"), loverProgressState: createLoverProgressState(type, () => 0) };
    const resolution = resolveMonthlyEffects(dating);
    expect(resolution).toEqual(baseline);
    expect(resolution.player.san).toBe(11);
    expect(resolution.player.money).toBe(state.player.money);
    expect(resolution.items.some((item) => item.id.startsWith("lover-"))).toBe(false);
    expect(applyMonthlyEffects(dating).nextState.loverProgressState).toEqual(dating.loverProgressState);
  });

  it("runs the automatic coffee machine independently at month start", () => {
    const state = createPlayingMonth(8, 8, 10);
    state.player = { ...state.player, money: 2 };
    state.coffeeState = {
      ...state.coffeeState,
      machineOwned: true,
      machineUpgrade: "automatic",
    };

    const { nextState, resolution } = applyMonthlyEffects(state);
    expect(resolution.items.find((item) => item.id === "automatic-coffee-machine")?.appliedStats).toEqual({ san: 3, money: -2 });
    expect(nextState.player.money).toBe(0);
    expect(nextState.player.san).toBe(14);
    expect(nextState.coffeeState.machineTrackedCoffeeCount).toBe(1);
  });

  it("skips automatic production and payment at full SAN", () => {
    const state = createPlayingMonth(8, 8, 20);
    state.player = { ...state.player, money: 2 };
    state.coffeeState = {
      ...state.coffeeState,
      machineOwned: true,
      machineUpgrade: "automatic",
    };

    const { nextState, resolution } = applyMonthlyEffects(state);
    expect(resolution.items.find((item) => item.id === "automatic-coffee-machine-skipped")).toMatchObject({
      note: "SAN 已满，本月未冲泡",
      appliedStats: {
        san: 0,
        money: 0,
      },
    });
    expect(resolution.items.some((item) => item.id === "automatic-coffee-machine")).toBe(false);
    expect(nextState.player).toMatchObject({ san: 20, money: 2 });
    expect(nextState.coffeeState.coffeeProducedCountThisMonth).toBe(0);
  });

  it("previews no automatic production or payment when next month starts at full SAN", () => {
    const state = createPlayingMonth(8, 8, 20);
    state.player = { ...state.player, money: 2 };
    state.coffeeState = {
      ...state.coffeeState,
      machineOwned: true,
      machineUpgrade: "automatic",
    };

    const resolution = previewNextMonthEffects(state);
    expect(resolution.items.find((item) => item.id === "automatic-coffee-machine-skipped")).toMatchObject({
      note: "SAN 已满，本月未冲泡",
      appliedStats: {
        san: 0,
        money: 0,
      },
    });
    expect(resolution.player).toMatchObject({ san: 20, money: 2 });
  });

  it("lets the automatic machine add one cup alongside the regular monthly cup", () => {
    const state = createPlayingMonth(8, 8, 10);
    state.player = { ...state.player, money: 4 };
    state.coffeeState = {
      ...state.coffeeState,
      machineOwned: true,
      machineUpgrade: "automatic",
      subscriptionEnabled: true,
    };

    const { nextState, resolution } = applyMonthlyEffects(state);
    expect(resolution.items.some((item) => item.id === "automatic-coffee-machine")).toBe(true);
    expect(resolution.items.some((item) => item.id === "coffee-subscription")).toBe(true);
    expect(nextState.player.money).toBe(0);
    expect(nextState.player.san).toBe(17);
    expect(nextState.coffeeState.coffeePurchaseCountThisMonth).toBe(1);
    expect(nextState.coffeeState.coffeeProducedCountThisMonth).toBe(2);
    expect(nextState.coffeeState.machineTrackedCoffeeCount).toBe(2);
  });

  it("preserves settlement and expiry of a six-month conference internship", () => {
    const state = createPlayingMonth(8, 8, 10);
    state.internshipState = {
      ...activateInternship(),
      remainingMonths: 1,
    };

    const { nextState, resolution } = applyMonthlyEffects(state);
    expect(resolution.items.find((item) => item.id === "internship-monthly")?.stats).toEqual({ san: -2, money: 1 });
    expect(nextState.player.san).toBe(9);
    expect(nextState.player.money).toBe(1);
    expect(nextState.internshipState).toEqual({ active: false, remainingMonths: 0, experimentMultiplier: 1, experimentBonus: 0, experimentMoneyDiscount: 0 });
  });

  it("keeps all three future remote action months across a year boundary and expires in month four", () => {
    const initial = createPlayingMonth(11, 11, 20);
    const paper = { ...createDraftPaper(11, 0, () => 0), idea: 1 };
    let state: GameState = { ...initial, internshipState: activateRemoteInternship(11),
      player: { ...initial.player, research: 4, money: 20 }, papers: [paper] };
    expect(getResearchExperimentMoneyCost(state)).toBe(3);
    expect(previewResearchOperation(state, "experiment", 3).scoreBonus).toBe(0);
    expect(resolveMonthlyEffects(state).items.some((item) => item.id === "internship-monthly")).toBe(false);
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    let sanTotal = 0;
    let moneyTotal = 0;
    try {
      for (const totalMonths of [12, 13, 14, 15]) {
        const before = structuredClone(state);
        const firstPreview = previewNextMonthEffects(state);
        expect(previewNextMonthEffects(state)).toEqual(firstPreview);
        expect(state).toEqual(before);
        const item = firstPreview.items.find((entry) => entry.id === "internship-monthly");
        const effective = totalMonths <= 14;
        expect(item?.stats).toEqual(effective ? { san: -3, money: 1 } : undefined);
        sanTotal += item?.stats.san ?? 0;
        moneyTotal += item?.stats.money ?? 0;
        state = dispatchAction({ ...state, eventQueue: [] }, "next-month");
        expect(state.totalMonths).toBe(totalMonths);
        expect(getInternshipStatus(state)).toMatchObject({ active: effective, pending: false, remainingMonths: effective ? 15 - totalMonths : 0 });
        expect(getResearchExperimentMoneyCost(state)).toBe(effective ? 2 : 3);
        expect(previewResearchOperation(state, "experiment", 3)).toMatchObject({ scoreBonus: effective ? 4 : 0, scoreMultiplier: 1 });
        const execution = applyResearchOperation({ ...state, papers: [paper] }, paper.id, "experiment", () => 0);
        expect(execution.papers[0]?.experiment).toBe(effective ? 6 : 2);
      }
    } finally {
      random.mockRestore();
    }
    expect({ sanTotal, moneyTotal }).toEqual({ sanTotal: -9, moneyTotal: 3 });
    expect(state.internshipState).toEqual(createInternshipState());
  });

  it("retains six conference settlements and the publication-based income", () => {
    const initial = createPlayingMonth(5, 5, 20);
    const publication = { ...createDraftPaper(1, 0, () => 0), status: "published" as const, target: "A" as const };
    let state: GameState = { ...initial, internshipState: activateInternship(), totalCitations: 1000, papers: [publication] };
    expect(resolveMonthlyEffects(state).items.find((item) => item.id === "internship-monthly")?.stats).toEqual({ san: -2, money: 2.5 });
    state = { ...state, totalCitations: 0, papers: [] };
    for (let elapsed = 1; elapsed <= 6; elapsed += 1) {
      const settled = applyMonthlyEffects({ ...state, totalMonths: 5 + elapsed });
      expect(settled.resolution.items.find((item) => item.id === "internship-monthly")?.stats).toEqual({ san: -2, money: 1 });
      expect(settled.nextState.internshipState.remainingMonths).toBe(6 - elapsed);
      state = settled.nextState;
    }
    expect(resolveMonthlyEffects(state).items.some((item) => item.id === "internship-monthly")).toBe(false);
  });

  it("stacks strong body and active monthly buffs, then expires finite buffs", () => {
    const state = createPlayingMonth(8, 8);
    state.actionState = { used: 1, limit: 1, aiResearchBonusUsed: true };
    state.eventSupport = { ...state.eventSupport, hasStrongBodyTalent: true };
    state.buffs = [{
      id: "monthly-work",
      name: "长期带教",
      source: "指导师弟师妹",
      timing: "monthly",
      remainingMonths: 1,
      monthlyStats: { san: -2, money: 3 },
    }];

    const { nextState, resolution } = applyMonthlyEffects(state);
    expect(nextState.player.san).toBe(10);
    expect(nextState.player.money).toBe(3);
    expect(resolution.totals).toMatchObject({ san: 0, money: 3 });
    expect(nextState.buffs).toEqual([]);
    expect(nextState.actionState).toEqual({ used: 0, limit: 1, aiResearchBonusUsed: false });
  });

  it("starts a scheduled paper's citation age after its publication month", () => {
    const state = createPlayingMonth(1, 1);
    state.buffs = [{
      id: "scheduled-paper",
      name: "长期带教",
      source: "指导师弟师妹",
      timing: "monthly",
      remainingMonths: null,
      scheduledPublication: {
        intervalMonths: 12,
        nonFirstAuthor: true,
        targetWeights: { A: 1, B: 0, C: 0 },
        elapsedMonths: 11,
      },
    }];

    const publicationMonth = applyMonthlyEffects(state).nextState;
    expect(publicationMonth.externalPublications[0]?.publication).toMatchObject({ effectiveScore: 4, citations: 0 });
    expect(publicationMonth.externalPublications[0]?.publication?.monthsSincePublish).toBeUndefined();

    const firstMonth = applyMonthlyEffects({ ...publicationMonth, month: 2, totalMonths: 2 }).nextState;
    expect(firstMonth.externalPublications[0]?.publication).toMatchObject({ effectiveScore: 4, citations: 0, monthsSincePublish: 1 });

    const secondMonth = applyMonthlyEffects({ ...firstMonth, month: 3, totalMonths: 3 }).nextState;
    expect(secondMonth.externalPublications[0]?.publication).toMatchObject({ effectiveScore: 4, monthsSincePublish: 2 });

    const thirdMonth = applyMonthlyEffects({ ...secondMonth, month: 4, totalMonths: 4 }).nextState;
    expect(thirdMonth.externalPublications[0]?.publication).toMatchObject({ effectiveScore: 4, monthsSincePublish: 3 });

    const fourthMonth = applyMonthlyEffects({ ...thirdMonth, month: 5, totalMonths: 5 }).nextState;
    expect(fourthMonth.externalPublications[0]?.publication).toMatchObject({ effectiveScore: 3, monthsSincePublish: 4 });
  });

  it("combines simultaneous SAN changes before applying the cap", () => {
    const state = createPlayingMonth(2, 2, 20);
    state.buffs = [{
      id: "monthly-work",
      name: "长期带教",
      source: "指导师弟师妹",
      timing: "monthly",
      remainingMonths: null,
      monthlyStats: { san: -2 },
    }];

    const resolution = resolveMonthlyEffects(state);
    expect(resolution.player.san).toBe(20);
    expect(resolution.totals.san).toBe(0);
    expect(resolution.items.map((item) => item.appliedStats.san ?? 0)).toEqual([1, 1, -2]);
  });

  it("lets the spike chair restore SAN to 3 after month-start settlement", () => {
    const state = createPlayingMonth(5, 5, 0);
    state.shopState = { ...state.shopState, chairOwned: true, chairUpgrade: "spike" };

    const resolution = resolveMonthlyEffects(state);
    expect(resolution.player.san).toBe(3);
    expect(resolution.items.find((item) => item.id === "chair-emergency")).toMatchObject({
      appliedStats: { san: 3 },
    });
  });

  it("counts only actual chair SAN recovery during month-start settlement", () => {
    const state = createPlayingMonth(5, 5, 0);
    state.shopState = { ...state.shopState, chairOwned: true, chairUpgrade: "spike" };

    const { nextState } = applyMonthlyEffects(state);
    expect(nextState.shopState.chairSanRecovered).toBe(3);

    const capped = createPlayingMonth(1, 1, 20);
    capped.shopState = { ...capped.shopState, chairOwned: true, chairUpgrade: null };
    expect(applyMonthlyEffects(capped).nextState.shopState.chairSanRecovered).toBe(0);

    const advanced = createPlayingMonth(1, 1, 10);
    advanced.shopState = { ...advanced.shopState, chairOwned: true, chairUpgrade: "advanced" };
    expect(applyMonthlyEffects(advanced).nextState.shopState.chairSanRecovered).toBe(2);
  });

  it("lets a road bike inherit base-bike progress with a six-point threshold", () => {
    const state = createPlayingMonth(8, 8, 10);
    state.shopState = {
      ...state.shopState,
      bikeOwned: true,
      bikeLevel: 3,
      bikeSanSpent: 5,
      bikeSanCapGains: 0,
    };

    const { nextState } = applyMonthlyEffects(state);
    expect(nextState.shopState.bikeSanSpent).toBe(7);
    expect(nextState.shopState.bikeSanCapGains).toBe(1);
    expect(nextState.sanCap).toBe(state.sanCap + 1);
  });

  it("keeps shared bike progress but stops accumulation after upgrading to an e-bike", () => {
    const state = createPlayingMonth(7, 7, 10);
    state.shopState = {
      ...state.shopState,
      bikeOwned: true,
      bikeLevel: 0,
      ebikeOwned: true,
      bikeSanSpent: 11,
      bikeSanCapGains: 1,
    };

    const { nextState } = applyMonthlyEffects(state);
    expect(nextState.shopState.bikeSanSpent).toBe(11);
    expect(nextState.shopState.bikeSanCapGains).toBe(1);
    expect(nextState.sanCap).toBe(state.sanCap);
  });

  it("uses the same resolver for next-month preview and settlement", () => {
    const current = createPlayingMonth(1, 1);
    current.buffs = [{
      id: "stipend",
      name: "临时补贴",
      source: "测试事件",
      timing: "monthly",
      remainingMonths: 2,
      monthlyStats: { money: 3 },
    }];

    const preview = previewNextMonthEffects(current);
    const actual = applyMonthlyEffects({ ...current, month: 2, totalMonths: 2 }).resolution;
    expect(preview.totals).toEqual(actual.totals);
    expect(preview.items.map((item) => item.id)).toEqual(actual.items.map((item) => item.id));
  });

  it("previews ice-Americano and AI renewals in the same month-start balance", () => {
    const state = createPlayingMonth(1, 1);
    state.player = { ...state.player, money: 3 };
    state.selectedAdvisorName = "测试导师";
    state.coffeeState = {
      ...state.coffeeState,
      machineOwned: true,
      subscriptionEnabled: true,
    };
    state.aiShopState = {
      subscriptions: {
        ...state.aiShopState.subscriptions,
        gpt: { ...state.aiShopState.subscriptions.gpt, enabled: true },
      },
    };

    const preview = previewNextMonthEffects(state);
    expect(preview.items.map((item) => item.id)).toEqual(expect.arrayContaining([
      "advisor-salary",
      "coffee-subscription",
      "ai-renewal-gpt",
    ]));
    expect(preview.items.find((item) => item.id === "coffee-subscription")?.source).toBe("商店订阅");
    expect(preview.items.find((item) => item.id === "ai-renewal-gpt")?.appliedStats.money).toBe(-2);
    expect(preview.totals.money).toBe(-3);
    expect(preview.player.money).toBe(0);
  });

  it("uses month-start income before deciding whether ice Americano can renew", () => {
    const state = createPlayingMonth(1, 1);
    state.player = { ...state.player, money: 1 };
    state.selectedAdvisorName = "测试导师";
    state.coffeeState = {
      ...state.coffeeState,
      machineOwned: true,
      subscriptionEnabled: true,
    };

    const preview = previewNextMonthEffects(state);
    expect(preview.items.some((item) => item.id === "coffee-subscription")).toBe(true);
    expect(preview.items.some((item) => item.id === "coffee-subscription-paused")).toBe(false);
    expect(preview.player.money).toBe(0);
  });

  it("renews ice-Americano without a coffee machine and keeps it out of machine production", () => {
    const state = createPlayingMonth(1, 1, 10);
    state.player = { ...state.player, money: 2 };
    state.coffeeState = { ...state.coffeeState, subscriptionEnabled: true };

    const preview = previewNextMonthEffects(state);
    expect(preview.items.find((item) => item.id === "coffee-subscription")?.appliedStats).toEqual({ money: -2, san: 2 });
    expect(preview.player).toMatchObject({ money: 0, san: 14 });

    const settled = applyMonthlyEffects(state);
    expect(settled.nextState.coffeeState).toMatchObject({
      subscriptionEnabled: true,
      coffeePurchaseCountThisMonth: 1,
      coffeeProducedCountThisMonth: 0,
      machineTrackedCoffeeCount: 0,
    });
  });

  it("skips ice-Americano renewal at full SAN without charging money", () => {
    const state = createPlayingMonth(1, 1, 20);
    state.player = { ...state.player, money: 2 };
    state.coffeeState = { ...state.coffeeState, machineOwned: true, subscriptionEnabled: true };

    const preview = previewNextMonthEffects(state);
    expect(preview.items.find((item) => item.id === "coffee-subscription-skipped")).toMatchObject({
      appliedStats: { san: 0, money: 0 },
      note: "SAN 已满，本月未购买",
    });
    expect(preview.player.money).toBe(2);
  });

  it("does not deduct an AI subscription that will pause for insufficient money", () => {
    const state = createPlayingMonth(1, 1);
    state.player = { ...state.player, money: 0 };
    state.aiShopState = {
      subscriptions: {
        ...state.aiShopState.subscriptions,
        gpt: { ...state.aiShopState.subscriptions.gpt, enabled: true },
      },
    };

    const preview = previewNextMonthEffects(state);
    expect(preview.items.find((item) => item.id === "ai-renewal-gpt")).toMatchObject({
      appliedStats: { money: 0 },
      note: "金币不足，本月暂停",
    });
    expect(preview.totals.money).toBe(0);
  });

  it("records a successful free AI renewal as 金币 +0", () => {
    const state = createPlayingMonth(1, 1);
    state.aiShopState = {
      subscriptions: {
        ...state.aiShopState.subscriptions,
        doubao: { ...state.aiShopState.subscriptions.doubao, enabled: true },
      },
    };

    const preview = previewNextMonthEffects(state);
    expect(preview.items.find((item) => item.id === "ai-renewal-doubao")).toMatchObject({
      appliedStats: { money: 0 },
    });
    expect(preview.player.money).toBe(0);
  });

  it("settles coffee and AI together from cheapest to priciest without negative money", () => {
    const state = createPlayingMonth(12, 24);
    state.player = { ...state.player, money: 4 };
    state.coffeeState = {
      ...state.coffeeState,
      machineOwned: true,
      subscriptionEnabled: true,
    };
    state.aiShopState = {
      subscriptions: Object.fromEntries(Object.entries(state.aiShopState.subscriptions).map(([slot, subscription]) => [
        slot,
        { ...subscription, enabled: true },
      ])) as typeof state.aiShopState.subscriptions,
    };

    const preview = previewNextMonthEffects(state);
    expect(preview.items
      .filter((item) => item.id.startsWith("ai-renewal-") || item.id.startsWith("coffee-subscription"))
      .map((item) => item.id)).toEqual([
        "ai-renewal-doubao",
        "ai-renewal-gemini",
        "ai-renewal-deepseek",
        "ai-renewal-kimi",
        "coffee-subscription-paused",
        "ai-renewal-gpt",
        "ai-renewal-claude",
      ]);
    expect(preview.player.money).toBe(0);
    expect(preview.items.find((item) => item.id === "coffee-subscription-paused")?.appliedStats.money).toBe(0);
  });

  it("settles the automatic coffee machine before every renewal", () => {
    const state = createPlayingMonth(1, 1, 10);
    state.player = { ...state.player, money: 2 };
    state.coffeeState = {
      ...state.coffeeState,
      machineOwned: true,
      machineUpgrade: "automatic",
      subscriptionEnabled: true,
    };
    state.aiShopState = {
      subscriptions: {
        ...state.aiShopState.subscriptions,
        gpt: { ...state.aiShopState.subscriptions.gpt, enabled: true },
      },
    };

    const preview = previewNextMonthEffects(state);
    const automaticIndex = preview.items.findIndex((item) => item.id === "automatic-coffee-machine");
    const firstRenewalIndex = preview.items.findIndex((item) => item.id.startsWith("ai-renewal-") || item.id.startsWith("coffee-subscription"));
    expect(automaticIndex).toBeGreaterThanOrEqual(0);
    expect(firstRenewalIndex).toBeGreaterThan(automaticIndex);
    expect(preview.items.find((item) => item.id === "ai-renewal-gpt")?.appliedStats.money).toBe(0);
    expect(preview.items.find((item) => item.id === "coffee-subscription-paused")?.appliedStats.money).toBe(0);
    expect(preview.player.money).toBe(0);
  });

  it("does not preview month-start effects before enrollment", () => {
    const state = createInitialState();
    const preview = previewNextMonthEffects(state);
    expect(preview.items).toEqual([]);
    expect(preview.totals.san).toBe(0);
  });

  it("previews month-start Buffs from the debug rail before enrollment", () => {
    const state = {
      ...createInitialState(),
      phase: "playing" as const,
      buffs: [{
        id: "debug-month-start",
        name: "调试月初效果",
        source: "调试来源",
        timing: "permanent" as const,
        remainingMonths: null,
        monthlyStats: { san: -1 },
      }],
    };

    const preview = previewNextMonthEffects(state);
    expect(preview.items.find((item) => item.id === "debug-month-start")?.stats).toEqual({ san: -1 });
    expect(preview.totals.san).toBe(0);
  });
});

import { addOrReplaceBuffs, advanceBuffDurations, getActiveBuffs, removeBuffs } from "./v2-buffs";
import { ADVISOR_SALARY } from "./v2-content";
import { getInternshipMonthlyIncome, getPublishedAPaperCount } from "./v2-internship-system";
import { getBeautifulMonthlyRecovery } from "./v2-lover-system";
import { LOVER_DATE_MONEY_COST } from "./v2-lover-progression";
import { getCalendarForTotalMonths, isPreEnrollmentState } from "./v2-progression";
import { clampResearchToCap } from "./v2-research-cap-system";
import { createGrantedPublishedPaper } from "./v2-publication-rules";
import { syncRelationshipState } from "./v2-relationship-rules";
import { getMonthlySeasonSanModifier, getSeasonByMonth } from "./v2-sanity-rules";
import { getBikeMonthlySanCost, getBikeSanCapLimit } from "./v2-bike-system";
import { hasFullGear } from "./v2-meeting-system";
import { BASE_COFFEE_PRICE, getCoffeeBuyPrice, getCurrentCoffeeBonus } from "./v2-coffee-system";
import { getChairMonthlyRecovery, getShopEmergencySan } from "./v2-shop-items-effects";
import {
  AI_SLOT_IDS,
  createAiBuffs,
  getAiRenewalPrice,
  renewAiSubscriptionSlot,
  type AiModelOffer,
} from "./v2-ai-shop";
import { applyAiActivationEffects } from "./v2-ai-activation";
import { settlePublishedPaperCitations } from "./v2-publication-system";
import { resolveReadyJournalPapers } from "./v2-journal-system";
import type { GameState, PlayerStats } from "./v2-types";

const PLAYER_STAT_IDS = ["san", "research", "social", "favor", "money"] as const;

export interface MonthlyEffectItem {
  id: string;
  name: string;
  source: string;
  stats: Partial<PlayerStats>;
  appliedStats: Partial<PlayerStats>;
  note?: string;
}

export interface MonthlyEffectResolution {
  items: MonthlyEffectItem[];
  totals: PlayerStats;
  player: PlayerStats;
}

export interface AppliedMonthlyEffects {
  nextState: GameState;
  resolution: MonthlyEffectResolution;
}

function emptyTotals(): PlayerStats {
  return { san: 0, research: 0, social: 0, favor: 0, money: 0 };
}

function applyStats(state: GameState, player: PlayerStats, stats: Partial<PlayerStats>): PlayerStats {
  return {
    san: Math.min(state.sanCap, player.san + (stats.san ?? 0)),
    research: clampResearchToCap(player.research + (stats.research ?? 0), state.researchCapacityState),
    social: Math.min(20, player.social + (stats.social ?? 0)),
    favor: Math.min(20, player.favor + (stats.favor ?? 0)),
    money: player.money + (stats.money ?? 0),
  };
}

function getCoreMonthlyEffects(state: GameState): Array<Omit<MonthlyEffectItem, "appliedStats">> {
  if (isPreEnrollmentState(state)) return [];

  const effects: Array<Omit<MonthlyEffectItem, "appliedStats">> = [];

  effects.push({
    id: "base-san-recovery",
    name: "自动恢复",
    source: "基础规则",
    stats: { san: 1 },
  });

  if (state.selectedAdvisorName) {
    effects.push({
      id: "advisor-salary",
      name: "导师工资",
      source: "导师待遇",
      stats: { money: state.degree === "phd" ? ADVISOR_SALARY.phd : ADVISOR_SALARY.master },
    });
  }

  if (state.eventSupport.hasStrongBodyTalent) {
    effects.push({
      id: "strong-body-san-recovery",
      name: "强身健体",
      source: "羽毛球冠军",
      stats: { san: 1 },
    });
  }

  if (state.loverState.active) {
    const recovery = getBeautifulMonthlyRecovery(state.loverState, state.player.san, state.sanCap);
    if (recovery > 0) {
      effects.push({
        id: "lover-recovery",
        name: "恋人陪伴",
        source: "活泼恋人",
        stats: { san: recovery },
      });
    }
    effects.push({
      id: "lover-date-cost",
      name: "约会开销",
      source: "恋人",
      stats: { money: -LOVER_DATE_MONEY_COST },
    });
  }

  if (state.internshipState.active) {
    const income = getInternshipMonthlyIncome(getPublishedAPaperCount(state), state.totalCitations);
    effects.push({
      id: "internship-monthly",
      name: "远程实习",
      source: "实习邀请",
      stats: { san: -2, money: income },
      note: `剩余 ${state.internshipState.remainingMonths} 个月`,
    });
  }

  if (state.shopState.chairOwned) {
    const fixedRecovery = state.shopState.chairUpgrade === "advanced"
      ? 2
      : state.shopState.chairUpgrade === null ? 1 : 0;
    const variableRecovery = getChairMonthlyRecovery(state.shopState, state.player.san, state.sanCap);
    const recovery = Math.max(fixedRecovery, variableRecovery);
    if (recovery > 0) {
      effects.push({
        id: "chair-monthly",
        name: state.shopState.chairUpgrade === null ? "办公椅" : "椅子升级",
        source: "商店装备",
        stats: { san: recovery },
      });
    }
  }

  if (state.shopState.bikeOwned) {
    const bikeSanCost = getBikeMonthlySanCost(state.shopState);
    if (bikeSanCost > 0) {
      effects.push({
        id: "bike-monthly",
        name: "自行车",
        source: "商店装备",
        stats: { san: -bikeSanCost },
      });
    }
  }

  if (state.shopState.ebikeOwned) {
    const season = getSeasonByMonth(state.month);
    const allSeasonBonus = hasFullGear(state.shopState, state.eventSupport);
    const ebikeSan = allSeasonBonus || season === "spring" || season === "autumn" ? 1 : 0;
    if (ebikeSan > 0) {
      effects.push({
        id: "ebike-monthly",
        name: "小电驴",
        source: "商店装备",
        stats: { san: ebikeSan },
      });
    }
  }

  const seasonModifier = getMonthlySeasonSanModifier(state.month, state.eventSupport);
  if (seasonModifier !== 0) {
    const season = getSeasonByMonth(state.month);
    effects.push({
      id: `${season}-san-effect`,
      name: season === "autumn" ? "秋季" : "冬季",
      source: "季节",
      stats: { san: seasonModifier },
    });
  }

  return effects;
}

function getMonthlyBuffEffects(state: GameState): Array<Omit<MonthlyEffectItem, "appliedStats">> {
  return getActiveBuffs(state.buffs).filter((buff) => buff.timing !== "next-action").flatMap((buff) => {
    const monthlyStats = buff.monthlyStats;
    if (!monthlyStats) return [];
    const hasVisibleStat = PLAYER_STAT_IDS.some((statId) => Object.hasOwn(monthlyStats, statId)
      && ((monthlyStats[statId] ?? 0) !== 0 || statId === "san" || statId === "money"));
    if (!hasVisibleStat) return [];
    return [{
      id: buff.id,
      name: buff.name,
      source: buff.source,
      stats: { ...monthlyStats },
    }];
  });
}

export function resolveMonthlyEffects(state: GameState): MonthlyEffectResolution {
  const startingPlayer = { ...state.player };
  const combinedStats = emptyTotals();
  const totals = emptyTotals();
  const items = [...getCoreMonthlyEffects(state), ...getMonthlyBuffEffects(state)].map((effect) => {
    const appliedStats: Partial<PlayerStats> = {};
    for (const statId of PLAYER_STAT_IDS) {
      if (!Object.hasOwn(effect.stats, statId)) continue;
      const delta = effect.stats[statId] ?? 0;
      appliedStats[statId] = delta;
      combinedStats[statId] += delta;
    }
    return { ...effect, appliedStats };
  });

  let player = applyStats(state, startingPlayer, combinedStats);
  for (const statId of PLAYER_STAT_IDS) {
    totals[statId] = player[statId] - startingPlayer[statId];
  }

  const emergencySan = getShopEmergencySan(state.shopState, player.san);
  if (emergencySan !== player.san) {
    const delta = emergencySan - player.san;
    player = { ...player, san: emergencySan };
    totals.san += delta;
    items.push({
      id: "chair-emergency",
      name: "锥刺股椅",
      source: "商店装备",
      stats: { san: delta },
      appliedStats: { san: delta },
    });
  }

  return { items, totals, player };
}

function appendMonthlyEffect(
  state: GameState,
  resolution: MonthlyEffectResolution,
  effect: Omit<MonthlyEffectItem, "appliedStats">,
): void {
  const before = resolution.player;
  const player = applyStats(state, before, effect.stats);
  const appliedStats: Partial<PlayerStats> = {};
  for (const statId of PLAYER_STAT_IDS) {
    const delta = player[statId] - before[statId];
    const preserveZero = (statId === "san" || statId === "money") && Object.hasOwn(effect.stats, statId);
    if (delta === 0 && !preserveZero) continue;
    appliedStats[statId] = delta;
    resolution.totals[statId] += delta;
  }
  resolution.player = player;
  resolution.items.push({ ...effect, appliedStats });
}

function appendObservedAiEffect(
  resolution: MonthlyEffectResolution,
  effect: Omit<MonthlyEffectItem, "appliedStats">,
  appliedStats: Partial<PlayerStats>,
): void {
  for (const statId of PLAYER_STAT_IDS) {
    resolution.totals[statId] += appliedStats[statId] ?? 0;
  }
  resolution.items.push({ ...effect, appliedStats });
}

function getMonthlyChairRecoveryContribution(
  state: GameState,
  resolution: MonthlyEffectResolution,
): number {
  const chairItem = resolution.items.find((item) => item.id === "chair-monthly");
  const nominalRecovery = chairItem?.appliedStats.san ?? 0;
  if (nominalRecovery <= 0) return 0;

  // Monthly effects are combined before the SAN cap is applied. Attribute only
  // the portion that still fits after the other monthly effects are applied.
  const otherSan = resolution.items
    .filter((item) => item.id !== "chair-monthly" && item.id !== "chair-emergency")
    .reduce((total, item) => total + (item.appliedStats.san ?? 0), 0);
  const sanBeforeChair = Math.min(state.sanCap, state.player.san + otherSan);
  const sanAfterChair = Math.min(state.sanCap, sanBeforeChair + nominalRecovery);
  return Math.max(0, sanAfterChair - sanBeforeChair);
}

function applyAutomaticCoffeeMachineEffect(
  state: GameState,
  resolution: MonthlyEffectResolution,
): GameState {
  if (!state.coffeeState.machineOwned || state.coffeeState.machineUpgrade !== "automatic") {
    return state;
  }

  if (resolution.player.money < BASE_COFFEE_PRICE) {
    appendMonthlyEffect(state, resolution, {
      id: "automatic-coffee-machine-paused",
      name: "自动咖啡机",
      source: "商店装备",
      stats: { money: 0, san: 0 },
      note: "金币不足，本月未冲泡",
    });
    return { ...state, player: { ...resolution.player } };
  }

  appendMonthlyEffect(state, resolution, {
    id: "automatic-coffee-machine",
    name: "自动咖啡机",
    source: "商店装备",
    stats: { money: -BASE_COFFEE_PRICE, san: 3 },
  });
  return {
    ...state,
    player: { ...resolution.player },
    coffeeState: {
      ...state.coffeeState,
      coffeeProducedCountThisMonth: state.coffeeState.coffeeProducedCountThisMonth + 1,
    },
  };
}

export function applyMonthStartSubscriptions(
  state: GameState,
  resolution: MonthlyEffectResolution = {
    items: [],
    totals: emptyTotals(),
    player: { ...state.player },
  },
): AppliedMonthlyEffects {
  const reimbursement = state.eventSupport.aiCostsCoveredUntilTotalMonths === state.totalMonths;
  const renewalTargets: Array<
    | { kind: "ai"; slot: typeof AI_SLOT_IDS[number]; price: number; order: number }
    | { kind: "coffee"; price: number; order: number }
  > = AI_SLOT_IDS.map((slot, order) => ({
    kind: "ai" as const,
    slot,
    price: getAiRenewalPrice(state.totalMonths, slot, reimbursement),
    order,
  }));
  if (state.coffeeState.subscriptionEnabled && state.coffeeState.machineOwned) {
    renewalTargets.push({ kind: "coffee", price: getCoffeeBuyPrice(state.coffeeState), order: AI_SLOT_IDS.length });
  }
  renewalTargets.sort((left, right) => left.price - right.price || left.order - right.order);

  let nextState: GameState = { ...state, player: { ...resolution.player } };
  const paidModels: AiModelOffer[] = [];
  for (const target of renewalTargets) {
    if (target.kind === "coffee") {
      if (resolution.player.san >= nextState.sanCap) {
        appendMonthlyEffect(nextState, resolution, {
          id: "coffee-subscription-skipped",
          name: "冰美式续费",
          source: "商店订阅",
          stats: { money: 0, san: 0 },
          note: "SAN 已满，本月未购买",
        });
        nextState = {
          ...nextState,
          player: { ...resolution.player },
          coffeeState: { ...nextState.coffeeState, subscriptionPaused: false },
        };
        continue;
      }
      const canPay = resolution.player.money >= target.price;
      if (canPay) {
        appendMonthlyEffect(nextState, resolution, {
          id: "coffee-subscription",
          name: "冰美式续费",
          source: "商店订阅",
          stats: { money: -target.price, san: 3 + getCurrentCoffeeBonus(nextState.coffeeState) },
        });
        nextState = {
          ...nextState,
          player: { ...resolution.player },
          coffeeState: {
            ...nextState.coffeeState,
            subscriptionPaused: false,
            coffeePurchaseCountThisMonth: nextState.coffeeState.coffeePurchaseCountThisMonth + 1,
            coffeeProducedCountThisMonth: nextState.coffeeState.coffeeProducedCountThisMonth + 1,
            machineTrackedCoffeeCount: nextState.coffeeState.machineTrackedCoffeeCount
              + (nextState.coffeeState.machineUpgrade === "advanced" ? 1 : 0),
          },
        };
      } else {
        appendMonthlyEffect(nextState, resolution, {
          id: "coffee-subscription-paused",
          name: "冰美式续费",
          source: "商店订阅",
          stats: { money: 0, san: 0 },
          note: "金币不足，本月暂停",
        });
        nextState = {
          ...nextState,
          player: { ...resolution.player },
          coffeeState: { ...nextState.coffeeState, subscriptionPaused: true },
        };
      }
      continue;
    }

    const renewed = renewAiSubscriptionSlot(
      nextState.aiShopState,
      nextState.totalMonths,
      resolution.player.money,
      target.slot,
      reimbursement,
    );
    nextState = { ...nextState, aiShopState: renewed.state };
    for (const item of renewed.items) {
      const note = item.reason === "model-updated"
        ? "模型已更新，自动续费已关闭"
        : item.reason === "insufficient-money" ? "金币不足，本月暂停" : undefined;
      appendMonthlyEffect(nextState, resolution, {
        id: `ai-renewal-${item.slot}`,
        name: `${item.model.name}续费`,
        source: "商店订阅",
        stats: { money: item.paid ? -item.price : 0 },
        note,
      });
      if (item.paid) paidModels.push(item.model);
      nextState = { ...nextState, player: { ...resolution.player } };
    }
  }

  const withoutAiBuffs = removeBuffs(nextState.buffs, AI_SLOT_IDS.map((slot) => `ai-${slot}`));
  nextState = {
    ...nextState,
    player: { ...resolution.player },
    buffs: addOrReplaceBuffs(withoutAiBuffs, createAiBuffs(nextState.aiShopState)),
  };
  const beforeActivation = nextState;
  const activated = applyAiActivationEffects(nextState, paidModels);
  nextState = activated.nextState;

  if (activated.polishDetails.length > 0) {
    appendObservedAiEffect(resolution, {
      id: "ai-automatic-polish",
      name: "Claude 自动科研",
      source: "商店订阅",
      stats: {},
      note: activated.polishDetails.join("；"),
    }, {});
  }
  if (activated.readingDetails.length > 0) {
    const sanDelta = nextState.player.san - beforeActivation.player.san;
    const researchDelta = nextState.player.research - beforeActivation.player.research;
    const stats: Partial<PlayerStats> = { san: sanDelta };
    if (researchDelta !== 0) stats.research = researchDelta;
    appendObservedAiEffect(resolution, {
      id: "ai-automatic-reading",
      name: "Kimi 自动阅读",
      source: "商店订阅",
      stats,
      note: activated.readingDetails.join("；"),
    }, { ...stats });
  }
  resolution.player = { ...nextState.player };
  return { nextState, resolution };
}

export function applyMonthlyEffects(state: GameState): AppliedMonthlyEffects {
  const resolution = resolveMonthlyEffects(state);
  let externalPublications = [...state.externalPublications];
  const buffs = state.buffs.map((buff) => {
    const schedule = buff.scheduledPublication;
    if (!schedule || (buff.remainingMonths !== null && buff.remainingMonths <= 0)) return buff;
    const elapsedMonths = (schedule.elapsedMonths ?? 0) + 1;
    if (elapsedMonths < schedule.intervalMonths) {
      return { ...buff, scheduledPublication: { ...schedule, elapsedMonths } };
    }
    const roll = Math.random();
    const target = roll < schedule.targetWeights.A
      ? "A"
      : roll < schedule.targetWeights.A + schedule.targetWeights.B ? "B" : "C";
    const acceptedScore = target === "A" ? 4 : target === "B" ? 2 : 1;
    externalPublications.push(createGrantedPublishedPaper(state.totalMonths, externalPublications.length, {
      title: `长期带教合作论文 ${externalPublications.length + 1}`,
      target,
      acceptedScore,
      nonFirstAuthor: schedule.nonFirstAuthor,
    }));
    resolution.items.push({
      id: `${buff.id}-publication-${state.totalMonths}`,
      name: "长期带教论文",
      source: buff.source,
      stats: {},
      appliedStats: {},
      note: `新增一篇非一作 ${target} 类论文`,
    });
    return { ...buff, scheduledPublication: { ...schedule, elapsedMonths: 0 } };
  });
  const internshipState = state.internshipState.active
    ? state.internshipState.remainingMonths <= 1
      ? { active: false, remainingMonths: 0, experimentMultiplier: 1 }
      : { ...state.internshipState, remainingMonths: state.internshipState.remainingMonths - 1 }
    : state.internshipState;
  const monthlyChairRecovery = getMonthlyChairRecoveryContribution(state, resolution);
  const emergencyChairRecovery = Math.max(0, resolution.items
    .find((item) => item.id === "chair-emergency")?.appliedStats.san ?? 0);
  const chairSanRecovered = Math.max(0, state.shopState.chairSanRecovered ?? 0)
    + monthlyChairRecovery
    + emergencyChairRecovery;
  const bikeMonthlyItem = resolution.items.find((item) => item.id === "bike-monthly");
  const bikeSanSpent = state.shopState.bikeSanSpent + Math.max(0, -(bikeMonthlyItem?.appliedStats.san ?? 0));
  const bikeThreshold = 6;
  const bikeGainLimit = getBikeSanCapLimit(state.shopState);
  const bikeSanCapGains = state.shopState.bikeOwned && bikeGainLimit > 0
    ? Math.min(bikeGainLimit, Math.floor(bikeSanSpent / bikeThreshold))
    : state.shopState.bikeSanCapGains;
  const bikeCapGain = Math.max(0, bikeSanCapGains - state.shopState.bikeSanCapGains);
  if (bikeCapGain > 0) {
    resolution.items.push({
      id: `bike-san-cap-${state.totalMonths}`,
      name: "骑行积累",
      source: "商店装备",
      stats: {},
      appliedStats: {},
      note: `SAN 上限 +${bikeCapGain}`,
    });
  }
  const monthStartState: GameState = {
    ...state,
    player: { ...resolution.player },
    externalPublications,
    shopState: {
      ...state.shopState,
      chairSanRecovered,
      bikeSanSpent,
      bikeSanCapGains,
    },
    coffeeState: {
      ...state.coffeeState,
      coffeePurchaseCountThisMonth: 0,
      coffeeProducedCountThisMonth: 0,
    },
    actionState: { ...state.actionState, used: 0, aiResearchBonusUsed: false },
    internshipState,
    buffs: advanceBuffDurations(buffs),
  };
  const automaticCoffeeState = applyAutomaticCoffeeMachineEffect(monthStartState, resolution);
  const subscriptionSettlement = applyMonthStartSubscriptions(automaticCoffeeState, resolution);
  const existingPublicationIds = new Set([
    ...state.papers.filter((paper) => paper.status === "published").map((paper) => paper.id),
    ...state.externalPublications.filter((paper) => paper.status === "published").map((paper) => paper.id),
  ]);
  const newPublicationIds = new Set(
    externalPublications.filter((paper) => !existingPublicationIds.has(paper.id)).map((paper) => paper.id),
  );
  const citationSettlement = settlePublishedPaperCitations(
    subscriptionSettlement.nextState,
    externalPublications,
    newPublicationIds,
  );
  if (citationSettlement.changes.length > 0) {
    for (const change of citationSettlement.changes) {
      resolution.items.push({
        id: `citation-${state.totalMonths}-${change.title}`,
        name: "论文引用",
        source: "论文成果",
        stats: {},
        appliedStats: {},
        note: `${change.title} 引用 +${change.amount}`,
      });
    }
  }
  const journalSettlement = resolveReadyJournalPapers(citationSettlement.state);
  return {
    resolution: subscriptionSettlement.resolution,
    nextState: {
      ...journalSettlement.state,
      sanCap: state.sanCap + bikeCapGain,
      relationshipState: syncRelationshipState(
        state.relationshipState,
        subscriptionSettlement.nextState.player.social,
      ),
    },
  };
}

export function previewNextMonthEffects(state: GameState): MonthlyEffectResolution {
  const hasMonthStartBuff = state.buffs.some((buff) => (
    buff.timing !== "next-action"
    && (buff.remainingMonths === null || buff.remainingMonths > 0)
    && buff.monthlyStats !== undefined
    && Object.keys(buff.monthlyStats).length > 0
  ));
  // Keep the normal pre-enrollment preview empty. A debug month-start Buff is
  // the one intentional exception so the debug rail can inspect its display.
  if (isPreEnrollmentState(state) && !hasMonthStartBuff) {
    return { items: [], totals: emptyTotals(), player: { ...state.player } };
  }

  const nextTotalMonths = state.totalMonths + 1;
  const calendar = getCalendarForTotalMonths(nextTotalMonths, state.degree);
  const nextMonthState = {
    ...state,
    totalMonths: nextTotalMonths,
    year: calendar.year,
    month: calendar.month,
  };
  const resolution = resolveMonthlyEffects(nextMonthState);
  const monthStartState: GameState = {
    ...nextMonthState,
    player: { ...resolution.player },
    coffeeState: {
      ...nextMonthState.coffeeState,
      coffeePurchaseCountThisMonth: 0,
      coffeeProducedCountThisMonth: 0,
    },
    actionState: { ...nextMonthState.actionState, used: 0, aiResearchBonusUsed: false },
    buffs: advanceBuffDurations(nextMonthState.buffs),
  };
  const automaticCoffeeState = applyAutomaticCoffeeMachineEffect(monthStartState, resolution);
  return applyMonthStartSubscriptions(automaticCoffeeState, resolution).resolution;
}

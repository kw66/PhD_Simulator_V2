import { recordPersonalIncome } from "./v2-money";
import { recordAchievementSanCapGain } from "./v2-achievement-runtime-types";
import { getEffectiveSocial } from "./v2-effective-attributes";
import { addOrReplaceBuffs, advanceBuffDurations, consumeAiCostCoverage, getActiveBuffs, removeBuffs } from "./v2-buffs";
import { advanceInternshipMonth, getInternshipMonthlyStats, getInternshipStatus } from "./v2-internship-system";
import { getLabPayroll, settleLabPayroll } from "./v2-lab-payroll";
import { MONTHLY_LIVING_COST } from "./v2-content";
import { settleFellowAcademicYear } from "./v2-fellow-lifecycle";
import { settleLabResearchGrowth } from "./v2-lab-talent";
import { settleRoleTalentMonthEnd, settleRoleTalentMonthStart, settleRoleTalentYearEnd } from "./v2-role-talent-lifecycle";
import { getRoleTalentLevel } from "./v2-role-talent-state";
import { settleGreedCoinGames } from "./v2-role-talent-greed";
import { normalizeRoleTalentIllnessProbability } from "./v2-random-event-rules";
import { recordPersonalSpending, roundMoney } from "./v2-money";
import { recordLabFinance } from "./v2-lab-finance-ledger";
import { activateLoverMonthlyDiscount } from "./v2-lover-progression";
import { consumeLoverGift, getLoverGiftQuote } from "./v2-lover-gift";
import { getCalendarForTotalMonths, isPreEnrollmentState } from "./v2-progression";
import { applyPlayerAttributeChange } from "./v2-player-attributes";
import { quoteSanPayment } from "./v2-role-talent-costs";
import { settleRoleTalentInvestments } from "./v2-role-talent-investments";
import { getFellowName } from "./v2-fellow-progression";
import { syncRelationshipState } from "./v2-relationship-rules";
import { DISEASE_MONTH_END_CHANGE_BY_SAN_TIER, getMonthlySeasonSanModifier, getRoleMonthlySanCost, getSeasonByMonth } from "./v2-sanity-rules";
import { getBikeMonthlySanCost, getBikeSanCapLimit } from "./v2-bike-system";
import { hasFullGear } from "./v2-meeting-system";
import { BASE_COFFEE_PRICE, getCoffeeBuyPrice, getCoffeeSanGain } from "./v2-coffee-system";
import { getChairMonthlyRecovery, getShopEmergencySan } from "./v2-shop-items-effects";
import {
  AI_SLOT_IDS,
  createAiBuffs,
  canUseAiTalentFunding,
  getAiModelForTotalMonths,
  getAiRenewalPrice,
  hasAiReimbursement,
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
  personalSpending?: number;
  /** A non-stat effect such as an action allowance or an unknown random swap. */
  label?: string;
}

export interface MonthlyEffectResolution {
  items: MonthlyEffectItem[];
  totals: PlayerStats;
  player: PlayerStats;
  settledState?: GameState;
  recordedPersonalSpending?: number;
}

export interface AppliedMonthlyEffects {
  nextState: GameState;
  resolution: MonthlyEffectResolution;
}

export function getMonthlyPersonalSpending(resolution: MonthlyEffectResolution): number {
  return roundMoney(resolution.items.reduce((total, item) => total + (item.personalSpending ?? Math.max(0, -(item.appliedStats.money ?? 0))), 0));
}

function emptyTotals(): PlayerStats {
  return { san: 0, research: 0, social: 0, favor: 0, money: 0 };
}

function applyStats(state: GameState, player: PlayerStats, stats: Partial<PlayerStats>): GameState {
  let next = { ...state, player: { ...player } };
  if (stats.money) {
    next.player.money = roundMoney(next.player.money + roundMoney(stats.money));
    next = recordPersonalIncome(next, stats.money);
  }
  if (stats.san) {
    if (stats.san > 0) next.player.san = Math.max(player.san, Math.min(state.sanCap, player.san + stats.san));
    else {
      const payment = quoteSanPayment(next, getRoleMonthlySanCost(next, -stats.san), { allowOverdraw: true, allowBeta: false });
      next = recordPersonalSpending({ ...next, player: { ...next.player,
        san: next.player.san - payment.sanCost, money: roundMoney(next.player.money - payment.moneyCost),
      } }, payment.moneyCost);
    }
  }
  for (const stat of ["research", "social", "favor"] as const) {
    if (stats[stat]) next = applyPlayerAttributeChange(next, stat, stats[stat]).state;
  }
  return next;
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

  if (state.selectedRoleId === "rich-reversed" && getRoleTalentLevel(state, "money-growth") > 0) effects.push({
    id: "role-money-growth", name: "聚沙成塔", source: "角色天赋", stats: { money: getRoleTalentLevel(state, "money-growth") },
  });
  if (state.selectedRoleId === "normal-reversed") {
    const recovery = getRoleTalentLevel(state, "monthly-san-recovery");
    if (recovery > 0) effects.push({ id: "role-monthly-san-recovery", name: "松弛人生", source: "角色天赋", stats: { san: recovery } });
    const missingRecovery = state.degree === "phd" ? Number((Math.max(0, state.sanCap - state.player.san)
      * getRoleTalentLevel(state, "post-phd-recovery") / 10).toFixed(10)) : 0;
    if (missingRecovery > 0) effects.push({ id: "role-missing-san-recovery", name: "无所事事", source: "角色天赋", stats: { san: missingRecovery } });
  }

  if (state.selectedAdvisorName && state.totalMonths > 1) {
    const payroll = getLabPayroll(state);
    effects.push({
      id: "advisor-salary",
      name: "学生工资",
      source: "导师待遇",
      stats: { money: payroll.player.payment },
    });
  }

  if (state.totalMonths > 1) {
    effects.push({
      id: "living-cost",
      name: "生活费",
      source: "基础规则",
      stats: { money: -MONTHLY_LIVING_COST },
    });
  }

  for (const fellow of state.fellowProgressState) {
    if (!fellow.longTermMentoring || state.totalMonths <= fellow.startTotalMonths) continue;
    effects.push({
      id: `fellow-mentoring-${fellow.id}`,
      name: "长期合作",
      source: getFellowName(fellow),
      stats: { san: -1 },
    });
  }

  if (state.eventSupport.hasStrongBodyTalent) {
    effects.push({
      id: "strong-body-san-recovery",
      name: "羽毛球",
      source: "羽毛球获胜",
      stats: { san: 1 },
    });
  }


  const internship = getInternshipStatus(state);
  if (internship.active) {
    effects.push({
      id: "internship-monthly",
      name: internship.kind === "remote3" ? "远程实习" : "大厂实习",
      source: internship.kind === "remote3" ? "导师约谈" : "实习邀请",
      stats: getInternshipMonthlyStats(state),
      note: `剩余 ${internship.remainingMonths} 个月`,
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
  const totals = emptyTotals();
  const investment = settleRoleTalentInvestments(state);
  let settledState = investment.state;
  let sanDelta = 0;
  const items: MonthlyEffectItem[] = investment.count > 0 ? [{
    id: "talent-investment-return", name: "理财能手", source: "角色天赋",
    stats: { money: investment.principal + investment.interest },
    appliedStats: { money: investment.principal + investment.interest },
    note: `${investment.count}笔到期，本金${investment.principal}，利息${investment.interest}`,
  }] : [];
  for (const effect of [...getCoreMonthlyEffects(state), ...getMonthlyBuffEffects(state)]) {
    const appliedStats: Partial<PlayerStats> = {};
    const before = settledState.player;
    const spendingBefore = settledState.personalSpending ?? 0;
    const money = roundMoney(effect.stats.money ?? 0);
    settledState = recordPersonalIncome({ ...settledState, player: { ...settledState.player, money: roundMoney(settledState.player.money + money) } }, money);
    if (Object.hasOwn(effect.stats, "san")) {
      const raw = effect.stats.san ?? 0;
      if (raw < 0) {
        const payment = quoteSanPayment(settledState, getRoleMonthlySanCost(settledState, -raw), { allowOverdraw: true, allowBeta: false });
        settledState = recordPersonalSpending({ ...settledState, player: { ...settledState.player,
          money: roundMoney(settledState.player.money - payment.moneyCost),
        } }, payment.moneyCost);
        appliedStats.san = -payment.sanCost;
      } else appliedStats.san = raw;
      sanDelta += appliedStats.san;
    }
    for (const stat of ["research", "social", "favor"] as const) {
      if (!Object.hasOwn(effect.stats, stat)) continue;
      const change = applyPlayerAttributeChange(settledState, stat, effect.stats[stat] ?? 0);
      settledState = change.state;
      appliedStats[stat] = change.result.effectiveChange;
    }
    // Attribute reactions may restore SAN or change a second attribute. Keep
    // those committed reactions rather than replacing them with raw buff data.
    const reactionSan = settledState.player.san - before.san;
    if (reactionSan !== 0) {
      sanDelta += reactionSan;
      appliedStats.san = (appliedStats.san ?? 0) + reactionSan;
    }
    for (const stat of ["research", "social", "favor"] as const) {
      const actual = Number((settledState.player[stat] - before[stat]).toFixed(10));
      if (actual !== 0 || Object.hasOwn(effect.stats, stat)) appliedStats[stat] = actual;
    }
    const moneyDelta = roundMoney(settledState.player.money - before.money);
    if (Object.hasOwn(effect.stats, "money") || moneyDelta !== 0) appliedStats.money = moneyDelta;
    items.push({ ...effect, stats: { ...effect.stats, ...(Object.hasOwn(effect.stats, "money") ? { money } : {}) }, appliedStats,
      personalSpending: roundMoney(Math.max(0, -money) + (settledState.personalSpending ?? 0) - spendingBefore) });
  }
  // SAN recovery and drains form one batch: retain recoveries at the cap until
  // all drains have been paid, and judge negative SAN only after the batch.
  let player = { ...settledState.player, san: sanDelta > 0
    ? Math.max(startingPlayer.san, Math.min(settledState.sanCap, startingPlayer.san + sanDelta))
    : startingPlayer.san + sanDelta };
  for (const statId of PLAYER_STAT_IDS) {
    const delta = player[statId] - startingPlayer[statId];
    totals[statId] = statId === "money" ? roundMoney(delta) : delta;
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

  settledState = { ...settledState, player };
  return { items, totals, player, settledState,
    recordedPersonalSpending: roundMoney((settledState.personalSpending ?? 0) - (state.personalSpending ?? 0)) };
}

function appendMonthlyEffect(
  state: GameState,
  resolution: MonthlyEffectResolution,
  effect: Omit<MonthlyEffectItem, "appliedStats">,
): void {
  const before = resolution.player;
  const settledState = applyStats(state, before, effect.stats);
  const player = settledState.player;
  const appliedStats: Partial<PlayerStats> = {};
  for (const statId of PLAYER_STAT_IDS) {
    const change = player[statId] - before[statId];
    const delta = statId === "money" ? roundMoney(change) : change;
    const preserveZero = (statId === "san" || statId === "money") && Object.hasOwn(effect.stats, statId);
    if (delta === 0 && !preserveZero) continue;
    appliedStats[statId] = delta;
    resolution.totals[statId] += delta;
    if (statId === "money") resolution.totals.money = roundMoney(resolution.totals.money);
  }
  resolution.player = player;
  resolution.settledState = settledState;
  resolution.recordedPersonalSpending = roundMoney((resolution.recordedPersonalSpending ?? 0)
    + (settledState.personalSpending ?? 0) - (state.personalSpending ?? 0));
  resolution.items.push({ ...effect, appliedStats });
}

function appendObservedAiEffect(
  resolution: MonthlyEffectResolution,
  effect: Omit<MonthlyEffectItem, "appliedStats">,
  appliedStats: Partial<PlayerStats>,
): void {
  for (const statId of PLAYER_STAT_IDS) {
    resolution.totals[statId] += appliedStats[statId] ?? 0;
    if (statId === "money") resolution.totals.money = roundMoney(resolution.totals.money);
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

  if (resolution.player.san >= state.sanCap) {
    appendMonthlyEffect(state, resolution, {
      id: "automatic-coffee-machine-skipped",
      name: "自动咖啡机",
      source: "商店装备",
      stats: { money: 0, san: 0 },
      note: "SAN 已满，本月未冲泡",
    });
    return { ...state, player: { ...resolution.player } };
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
      machineTrackedCoffeeCount: state.coffeeState.machineTrackedCoffeeCount + 1,
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
  const renewalTargets: Array<
    | { kind: "ai"; slot: typeof AI_SLOT_IDS[number]; price: number; order: number }
    | { kind: "coffee"; price: number; order: number }
  > = AI_SLOT_IDS.map((slot, order) => ({
    kind: "ai" as const,
    slot,
    price: getAiRenewalPrice(state.totalMonths, slot),
    order,
  }));
  if (state.coffeeState.subscriptionEnabled
    && state.coffeeState.coffeePurchaseCountThisMonth === 0) {
    renewalTargets.push({ kind: "coffee", price: getCoffeeBuyPrice(state.coffeeState), order: AI_SLOT_IDS.length });
  }
  renewalTargets.sort((left, right) => left.price - right.price || left.order - right.order);

  let nextState: GameState = { ...state, player: { ...resolution.player } };
  const paidModels: AiModelOffer[] = [];
  for (const target of renewalTargets) {
    const reimbursement = target.kind === "ai" && hasAiReimbursement(nextState);
    const basePrice = target.kind === "ai"
      ? getAiRenewalPrice(nextState.totalMonths, target.slot, reimbursement)
      : target.price;
    const { price, usesGift } = getLoverGiftQuote(nextState, basePrice, true);
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
      const canPay = resolution.player.money >= price;
      if (canPay) {
        appendMonthlyEffect(nextState, resolution, {
          id: "coffee-subscription",
          name: "冰美式续费",
          source: "商店订阅",
          stats: { money: -price, san: getCoffeeSanGain(nextState.coffeeState) },
          note: usesGift ? "恋人赠礼，本次免费" : undefined,
        });
        nextState = {
          ...(usesGift ? consumeLoverGift(nextState) : nextState),
          player: { ...resolution.player },
          coffeeState: {
            ...nextState.coffeeState,
            subscriptionPaused: false,
            coffeePurchaseCountThisMonth: nextState.coffeeState.coffeePurchaseCountThisMonth + 1,
            coffeeProducedCountThisMonth: nextState.coffeeState.coffeeProducedCountThisMonth + Number(nextState.coffeeState.machineOwned),
            machineTrackedCoffeeCount: nextState.coffeeState.machineTrackedCoffeeCount + Number(nextState.coffeeState.machineOwned),
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

    const modelPrice = getAiModelForTotalMonths(nextState.totalMonths, target.slot).price;
    const talentFunding = !reimbursement && !usesGift && canUseAiTalentFunding(nextState, modelPrice);
    const fundingCost = reimbursement || talentFunding ? modelPrice : 0;
    const renewed = renewAiSubscriptionSlot(
      nextState.aiShopState,
      nextState.totalMonths,
      resolution.player.money,
      target.slot,
      reimbursement || usesGift || talentFunding,
      fundingCost > 0 ? nextState.advisorProgressState.funding : undefined,
    );
    nextState = { ...nextState, aiShopState: renewed.state };
    for (const item of renewed.items) {
      const note = item.reason === "model-updated"
        ? "模型已更新，自动续费已关闭"
        : item.reason === "insufficient-funding" ? "科研经费不足，本月暂停"
          : item.reason === "insufficient-money" ? "金币不足，本月暂停"
          : usesGift ? "恋人赠礼，本次免费" : reimbursement ? `导师经费报销，科研经费 -${fundingCost}`
            : talentFunding ? `经费护航，科研经费 -${fundingCost}` : undefined;
      appendMonthlyEffect(nextState, resolution, {
        id: `ai-renewal-${item.slot}`,
        name: `${item.model.name}续费`,
        source: "商店订阅",
        stats: { money: item.paid ? -item.price : 0 },
        note,
      });
      if (item.paid) {
        paidModels.push(item.model);
        if (usesGift) nextState = consumeLoverGift(nextState);
        if (fundingCost > 0) nextState = recordLabFinance({
          ...nextState,
          advisorProgressState: { ...nextState.advisorProgressState, funding: roundMoney(nextState.advisorProgressState.funding - fundingCost) },
        }, "student-reimbursement", -fundingCost);
        if (fundingCost > 0 && reimbursement) nextState = consumeAiCostCoverage(nextState);
      }
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
  const recorded = recordPersonalSpending(nextState, getMonthlyPersonalSpending(resolution) - (resolution.recordedPersonalSpending ?? 0));
  const settled = settleGreedCoinGames(recorded);
  const greedStats: Partial<PlayerStats> = {};
  for (const stat of PLAYER_STAT_IDS) {
    const delta = Number((settled.player[stat] - nextState.player[stat]).toFixed(10));
    if (delta !== 0) greedStats[stat] = delta;
  }
  if (Object.keys(greedStats).length > 0) appendObservedAiEffect(resolution, {
    id: "greed-monthly-reactions", name: "贪求天赋", source: "角色天赋", stats: greedStats,
    note: "本月消费转化及金币游戏结算",
  }, greedStats);
  resolution.player = { ...settled.player };
  resolution.settledState = settled;
  return { nextState: settled, resolution };
}

export function applyMonthlyEffects(state: GameState): AppliedMonthlyEffects {
  const resolution = resolveMonthlyEffects(state);
  const internshipState = advanceInternshipMonth(state);
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
  const payrollState = settleLabPayroll(resolution.settledState ?? state);
  const monthStartState: GameState = {
    ...payrollState,
    player: { ...resolution.player },
    shopState: {
      ...state.shopState,
      labReimbursements: state.shopState.labReimbursements.totalMonths === state.totalMonths
        ? state.shopState.labReimbursements
        : { totalMonths: null, gpuTransaction: 0, workstationTransaction: 0 },
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
    internshipCount: state.internshipCount + (state.internshipState.active && !internshipState.active ? 1 : 0),
    buffs: advanceBuffDurations(state.buffs),
  };
  const automaticCoffeeState = applyAutomaticCoffeeMachineEffect(activateLoverMonthlyDiscount(monthStartState), resolution);
  const subscriptionSettlement = applyMonthStartSubscriptions(automaticCoffeeState, resolution);
  const citationSettlement = settlePublishedPaperCitations(
    subscriptionSettlement.nextState,
    state.externalPublications,
  );
  if (citationSettlement.changes.length > 0) {
    const citationGain = citationSettlement.changes.reduce((total, change) => total + change.amount, 0);
    resolution.items.push({
      id: `citation-${state.totalMonths}`,
      name: "论文引用",
      source: "论文成果",
      stats: {},
      appliedStats: {},
      note: `论文引用 +${citationGain}`,
    });
  }
  const journalSettlement = resolveReadyJournalPapers(citationSettlement.state);
  return {
    resolution: subscriptionSettlement.resolution,
    nextState: recordAchievementSanCapGain({
      ...journalSettlement.state,
      sanCap: journalSettlement.state.sanCap + bikeCapGain,
      relationshipState: syncRelationshipState(
        state.relationshipState,
        getEffectiveSocial(subscriptionSettlement.nextState),
      ),
    }, bikeCapGain),
  };
}

export function previewNextMonthEffects(state: GameState): MonthlyEffectResolution {
  if (state.phase === "finished" || state.totalMonths >= state.maxMonths) {
    return { items: [], totals: emptyTotals(), player: { ...state.player } };
  }
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
  const inherited = settleLabResearchGrowth(settleFellowAcademicYear(state));
  const annual = settleRoleTalentYearEnd(inherited);
  const yearEnd = settleRoleTalentMonthEnd(annual);
  const lifecycleItems: MonthlyEffectItem[] = [];
  const observe = (before: GameState, after: GameState, id: string, name: string): void => {
    const stats: Partial<PlayerStats> = {};
    for (const stat of PLAYER_STAT_IDS) {
      const delta = Number((after.player[stat] - before.player[stat]).toFixed(10));
      if (delta !== 0) stats[stat] = delta;
    }
    if (Object.keys(stats).length > 0) lifecycleItems.push({ id, name, source: "角色天赋", stats, appliedStats: { ...stats } });
  };
  observe(state, inherited, "annual-lab-growth", "实验室传承");
  observe(inherited, annual, "annual-role-growth", state.selectedRoleId === "normal" ? "厚积薄发"
    : state.selectedRoleId === "genius" ? "学而不倦" : "齐头并进");
  if (yearEnd.sanCap > annual.sanCap) lifecycleItems.push({
    id: "monthly-role-idle-cap", name: "日渐圆润", source: "角色天赋", stats: {}, appliedStats: {},
    label: `SAN上限 +${yearEnd.sanCap - annual.sanCap}`, note: "月末未使用常规行动",
  });
  const monthEndIllnessDelta = state.totalMonths > 0
    ? DISEASE_MONTH_END_CHANGE_BY_SAN_TIER[yearEnd.player.san < 6 ? 0 : yearEnd.player.san < 12 ? 1 : yearEnd.player.san < 18 ? 2 : 3]
    : 0;
  const beforeMonthlyTalents = {
    ...yearEnd,
    totalMonths: nextTotalMonths,
    year: calendar.year,
    month: calendar.month,
    illnessProbability: normalizeRoleTalentIllnessProbability(yearEnd, yearEnd.illnessProbability + monthEndIllnessDelta),
  };
  // Preview deterministic effects only. Sampling a random permutation here
  // would change the tooltip on every render and could promise a false result.
  const nextMonthState = settleRoleTalentMonthStart(beforeMonthlyTalents, undefined, { skipSwaps: true });
  const hasRandomStagnation = state.selectedRoleId === "social-reversed" && (yearEnd.roleTalents?.socialStagnantMonths ?? 0) >= 2;
  if (!hasRandomStagnation) observe(beforeMonthlyTalents, nextMonthState, "monthly-role-growth", state.selectedRoleId === "normal"
    ? nextTotalMonths === 2 ? "满怀干劲" : "满怀干劲+"
    : state.selectedRoleId === "chosen" ? "否极泰来" : state.selectedRoleId === "rich-reversed" ? "金钱诅咒" : "命运反噬");
  if (hasRandomStagnation) lifecycleItems.push({
    id: "monthly-role-stagnation", name: "患得患失", source: "角色天赋", stats: {}, appliedStats: {},
    label: "科研/好感随机 -1", note: "患得患失：月初科研或导师好感随机降低1点，受抵抗影响",
  });
  if (nextMonthState.sanCap > beforeMonthlyTalents.sanCap) lifecycleItems.push({
    id: "monthly-role-san-cap", name: "触底反弹", source: "角色天赋", stats: {}, appliedStats: {},
    label: `SAN上限 +${nextMonthState.sanCap - beforeMonthlyTalents.sanCap}`,
    note: "下个月初恢复SAN上限",
  });
  const actionBonus = nextMonthState.roleTalents?.monthlyActionBonus ?? 0;
  if (state.selectedRoleId === "normal" && state.degree === "phd" && actionBonus > 0) lifecycleItems.push({
    id: "monthly-role-actions", name: "勤能补拙", source: "角色天赋", stats: {}, appliedStats: {},
    label: `行动 +${actionBonus}`, note: `下月行动额度${nextMonthState.actionState.limit}次`,
  });
  const hasRandomSwap = state.selectedRoleId === "chosen-reversed" && nextTotalMonths > 1
    && (getRoleTalentLevel(state, "attribute-swap") > 0 || getRoleTalentLevel(state, "san-money-swap") > 0
      || (state.degree === "phd" && getRoleTalentLevel(state, "post-phd-swap") > 0));
  if (hasRandomSwap) lifecycleItems.push({
    id: "monthly-role-random-swap", name: "随机交换", source: "角色天赋", stats: {}, appliedStats: {},
    label: "随机交换", note: "月初随机确定交换结果，其余数值按交换前属性估算",
  });
  const resolution = resolveMonthlyEffects(nextMonthState);
  resolution.items.unshift(...lifecycleItems);
  for (const item of lifecycleItems) {
    for (const stat of PLAYER_STAT_IDS) resolution.totals[stat] += item.appliedStats[stat] ?? 0;
  }
  if (hasRandomSwap) for (const item of resolution.items) {
    if (item.id !== "monthly-role-random-swap") item.note = [item.note, "未计入随机交换影响"].filter(Boolean).join("；");
  }
  const monthStartState: GameState = {
    ...settleLabPayroll(resolution.settledState ?? nextMonthState),
    player: { ...resolution.player },
    coffeeState: {
      ...nextMonthState.coffeeState,
      coffeePurchaseCountThisMonth: 0,
      coffeeProducedCountThisMonth: 0,
    },
    actionState: { ...nextMonthState.actionState, used: 0, aiResearchBonusUsed: false },
    buffs: advanceBuffDurations(nextMonthState.buffs),
  };
  const automaticCoffeeState = applyAutomaticCoffeeMachineEffect(activateLoverMonthlyDiscount(monthStartState), resolution);
  return applyMonthStartSubscriptions(automaticCoffeeState, resolution).resolution;
}

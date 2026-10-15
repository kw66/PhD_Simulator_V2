import { AI_SLOT_IDS, createAiBuffs, getAiSlotLabel } from "./v2-ai-shop";
import { BIKE_TIER_DEFINITIONS } from "./v2-bike-system";
import { COFFEE_MACHINE_UPGRADE_DEFINITIONS, getCurrentCoffeeBonus } from "./v2-coffee-system";
import { getConferenceInfo } from "./v2-conference-catalog";
import { CONFERENCES, CONFERENCE_LOCATIONS } from "./v2-conference-catalog-data";
import { getCcigLocation } from "./v2-fixed-events-ccig-shared";
import { getInternshipExperimentEffect, getInternshipStatus } from "./v2-internship-system";
import { PAPER_TOPIC_CATALOG } from "./v2-paper-topics";
import { GPU_TIER_DEFINITIONS, SHOP_ITEM_DEFINITIONS, SHOP_UPGRADE_DEFINITIONS } from "./v2-shop-items-shared";
import { isShopItemOwned } from "./v2-shop-items-ownership";
import { SUPPORT_ITEM_DEFINITIONS, isSupportItemOwned } from "./v2-support-items";
import type { AchievementRunProgress } from "./v2-achievement-runtime-types";
import type { AccountProfile, AchievementCollectionProgress, Buff, DispatchPayload, GameActionId, GameState } from "./v2-types";

type CollectionKey = keyof AchievementCollectionProgress;
interface CollectionItem { id: string; label: string }
const ACTIONS = [{ id: "idea", label: "想idea" }, { id: "experiment", label: "做实验" }, { id: "writing", label: "写论文" }] as const;
const unique = (items: CollectionItem[]): CollectionItem[] => [...new Map(items.map((item) => [item.id, item])).values()];

/** Semantic effects, independent of source IDs, magnitude and duration. Every entry is obtainable in normal play. */
const BUFF_REQUIREMENTS: CollectionItem[] = [
  ...ACTIONS.flatMap((action) => [
    { id: `action:${action.id}:bonus`, label: `${action.label}分数加成` },
    { id: `action:${action.id}:multiplier`, label: `${action.label}倍率` },
    { id: `action:${action.id}:extraActions`, label: `${action.label}额外次数` },
    { id: `action:${action.id}:sanDelta`, label: `${action.label}SAN消耗调整` },
  ]),
  { id: "reading:sanDelta", label: "看论文SAN消耗调整" },
  { id: "reading:manualExtraReads", label: "看论文额外次数" },
  { id: "reading:automaticReads", label: "自动看论文" },
  { id: "paper-polish", label: "自动科研" },
  { id: "monthly:san", label: "每月SAN变化" },
  { id: "san:multiplier", label: "SAN消耗倍率" },
  { id: "san:delta", label: "SAN消耗固定调整" },
  { id: "relationship:san", label: "人际操作SAN消耗调整" },
  { id: "experiment:money", label: "实验费用调整" },
  { id: "scholarship:disqualified", label: "举报风险" },
  { id: "shop:ai", label: "AI报销" },
  { id: "shop:gpu", label: "显卡报销" },
  { id: "shop:workstation", label: "工位报销" },
  { id: "shop:gift", label: "恋人回礼" },
  { id: "coffee:bonus", label: "冰美式额外恢复" },
  { id: "season:summer-protection", label: "夏季炎热已抵消" },
];

/** Static catalogs never depend on what this account has already encountered. */
export const COLLECTION_REQUIREMENTS: Record<CollectionKey, CollectionItem[]> = {
  buffs: BUFF_REQUIREMENTS,
  products: unique([
    ...SHOP_ITEM_DEFINITIONS.filter((item) => item.id !== "gpu_buy" && item.id !== "bike").map((item) => ({ id: item.id, label: item.name })),
    ...GPU_TIER_DEFINITIONS.map((tier) => ({ id: `gpu:${tier.level}`, label: tier.name })),
    ...BIKE_TIER_DEFINITIONS.map((tier) => ({ id: `bike:${tier.level}`, label: tier.name })),
    ...SHOP_UPGRADE_DEFINITIONS.map((item) => ({ id: item.id, label: item.name })),
    { id: "coffee", label: "冰美式" }, { id: "coffee-machine", label: "咖啡机" },
    ...COFFEE_MACHINE_UPGRADE_DEFINITIONS.map((item) => ({ id: `coffee-machine:${item.id}`, label: item.name })),
    ...SUPPORT_ITEM_DEFINITIONS.map((item) => ({ id: item.id, label: item.name })),
    ...AI_SLOT_IDS.map((slot) => ({ id: `ai:${slot}`, label: getAiSlotLabel(slot) })),
  ]),
  conferences: unique(Object.values(CONFERENCES).flatMap((month) => Object.values(month).flatMap((conference) => (
    conference.alternates ? [conference.alternates.odd.name, conference.alternates.even.name] : [conference.name]
  )).map((name) => ({ id: name, label: name })))),
  // VALSE's later-year "外地" is an unspecified placeholder, not a collectible destination.
  locations: unique([...CONFERENCE_LOCATIONS.map((location) => location.city), ...[1, 2, 3, 4, 5, 6].map(getCcigLocation)]
    .filter((city) => city !== "外地" && city !== "未知").map((city) => ({ id: city, label: city }))),
  directions: PAPER_TOPIC_CATALOG.map((topic) => ({ id: topic.id, label: topic.label })),
};

const COLLECTOR_KEYS: Record<string, CollectionKey> = {
  "global:buff-collector": "buffs", "global:product-collector": "products", "global:conference-collector": "conferences",
  "global:travel-collector": "locations", "global:direction-collector": "directions",
};

export function getCollectorAchievementKey(id: string): CollectionKey | undefined { return COLLECTOR_KEYS[id]; }

export function getMissingAchievementCollectionItems(account: AccountProfile, key: CollectionKey): CollectionItem[] {
  const obtained = new Set(account.achievementCollectionProgress?.[key] ?? []);
  return COLLECTION_REQUIREMENTS[key].filter((item) => !obtained.has(item.id));
}

function add(run: AchievementRunProgress, key: CollectionKey, id: string): void {
  if (COLLECTION_REQUIREMENTS[key].some((item) => item.id === id) && !run.collections[key].includes(id)) run.collections[key].push(id);
}

/**
 * Return the semantic entries that would be visible in the Buff panel for the
 * supplied active Buff objects. Magnitudes, source IDs, and duration are
 * deliberately discarded: two +1 and +5 idea bonuses are the same kind of
 * effect for the collection and simultaneous-Buff achievements.
 */
function getNormalizedActiveBuffIds(buffs: readonly Buff[]): string[] {
  const ids = new Set<string>();
  for (const buff of buffs) {
    if (buff.id.includes("debug") || (buff.remainingMonths !== null && buff.remainingMonths <= 0)) continue;
    const record = (id: string, value: number | undefined, neutral = 0) => {
      if (value !== undefined && Number.isFinite(value) && value !== neutral) ids.add(id);
    };
    for (const action of ACTIONS) {
      const effect = buff.actionEffects?.[action.id];
      for (const key of ["bonus", "multiplier", "extraActions", "sanDelta"] as const) {
        record(`action:${action.id}:${key}`, effect?.[key], key === "multiplier" ? 1 : 0);
      }
    }
    for (const key of ["sanDelta", "manualExtraReads", "automaticReads"] as const) record(`reading:${key}`, buff.readingEffect?.[key]);
    if (Object.values(buff.paperPolishEffects ?? {}).some((value) => value !== 0)) ids.add("paper-polish");
    record("monthly:san", buff.monthlyStats?.san);
    record("san:multiplier", buff.activeOperationSanMultiplier, 1);
    record("san:delta", buff.activeOperationSanDelta);
    record("relationship:san", buff.relationshipOperationSanDelta);
    record("experiment:money", buff.labExperimentMoneyDelta);
    if (buff.scholarshipDisqualified) ids.add("scholarship:disqualified");
    if (buff.shopEffects?.aiCostsCovered && (buff.shopEffects.aiCostsCoveredUses ?? 1) > 0) ids.add("shop:ai");
  }
  return [...ids].filter((id) => COLLECTION_REQUIREMENTS.buffs.some((item) => item.id === id));
}

/** Semantic snapshot used by the runtime evaluator for “Buff之神”. */
export function getCurrentAchievementBuffIds(state: GameState): string[] {
  const aiBuffIds = new Set(AI_SLOT_IDS.map((slot) => `ai-${slot}`));
  const buffs = state.buffs.filter((buff) => !aiBuffIds.has(buff.id)).concat(createAiBuffs(state.aiShopState));
  const ids = new Set(getNormalizedActiveBuffIds(buffs));
  const hasCurrentAiCoverage = buffs.some((buff) => buff.shopEffects?.aiCostsCovered
    && (buff.remainingMonths === null || buff.remainingMonths > 0)
    && (buff.shopEffects.aiCostsCoveredUses ?? 1) > 0
    && (buff.shopEffects.aiCostsCoveredAtTotalMonths === undefined || [state.totalMonths, state.totalMonths + 1].includes(buff.shopEffects.aiCostsCoveredAtTotalMonths)));
  if (!hasCurrentAiCoverage) ids.delete("shop:ai");
  const shop = state.shopState;
  if (shop.gpuLevel > 0) { ids.add("action:experiment:bonus"); ids.add("action:experiment:extraActions"); }
  if (shop.gpuLevel >= 4) ids.add("experiment:money");
  if (shop.keyboardOwned) ids.add("action:writing:sanDelta");
  if (shop.monitorOwned) ids.add("reading:sanDelta");
  if (shop.entitlements.gpuTransaction > 0 || (shop.labReimbursements.totalMonths === state.totalMonths && shop.labReimbursements.gpuTransaction > 0)) ids.add("shop:gpu");
  if (shop.entitlements.workstationTransaction > 0 || (shop.labReimbursements.totalMonths === state.totalMonths && shop.labReimbursements.workstationTransaction > 0)) ids.add("shop:workstation");
  if ((state.loverProgressState.giftCoupons ?? 0) > 0) ids.add("shop:gift");
  if (getCurrentCoffeeBonus(state.coffeeState) > 0) ids.add("coffee:bonus");
  if (state.eventSupport.hasParasol && state.month >= 10 && state.month <= 12) ids.add("season:summer-protection");
  const internship = getInternshipStatus(state);
  if (internship.active) {
    const effect = getInternshipExperimentEffect(state);
    if (effect.bonus) ids.add("action:experiment:bonus");
    if (effect.multiplier !== 1) ids.add("action:experiment:multiplier");
    if (effect.moneyDiscount) ids.add("experiment:money");
  }
  return [...ids].filter((id) => COLLECTION_REQUIREMENTS.buffs.some((item) => item.id === id));
}

function observeState(run: AchievementRunProgress, state: GameState): void {
  for (const id of getCurrentAchievementBuffIds(state)) add(run, "buffs", id);
  for (const item of SHOP_ITEM_DEFINITIONS) {
    if (item.id !== "gpu_buy" && item.id !== "bike" && isShopItemOwned(state, item.id)) add(run, "products", item.id);
  }
  const shop = state.shopState;
  if (shop.gpuLevel > 0) {
    add(run, "products", `gpu:${shop.gpuLevel}`);
    add(run, "buffs", "action:experiment:bonus"); add(run, "buffs", "action:experiment:extraActions");
  }
  if (shop.bikeOwned) add(run, "products", `bike:${shop.bikeLevel || 1}`);
  if (shop.chairOwned && shop.chairUpgrade) add(run, "products", `chair-${shop.chairUpgrade}`);
  if (shop.keyboardOwned) add(run, "buffs", "action:writing:sanDelta");
  if (shop.monitorOwned) add(run, "buffs", "reading:sanDelta");
  if (shop.entitlements.gpuTransaction > 0 || (shop.labReimbursements.totalMonths === state.totalMonths && shop.labReimbursements.gpuTransaction > 0)) add(run, "buffs", "shop:gpu");
  if (shop.entitlements.workstationTransaction > 0 || (shop.labReimbursements.totalMonths === state.totalMonths && shop.labReimbursements.workstationTransaction > 0)) add(run, "buffs", "shop:workstation");
  if ((state.loverProgressState.giftCoupons ?? 0) > 0) add(run, "buffs", "shop:gift");
  if (state.coffeeState.machineOwned) {
    add(run, "products", "coffee-machine");
    if (state.coffeeState.machineUpgrade) add(run, "products", `coffee-machine:${state.coffeeState.machineUpgrade}`);
  }
  if (state.coffeeState.coffeeProducedCountThisMonth > 0 || state.coffeeState.coffeePurchaseCountThisMonth > 0 || state.coffeeState.machineTrackedCoffeeCount > 0) add(run, "products", "coffee");
  if (getCurrentCoffeeBonus(state.coffeeState) > 0) add(run, "buffs", "coffee:bonus");
  for (const item of SUPPORT_ITEM_DEFINITIONS) if (isSupportItemOwned(state.eventSupport, item.id)) add(run, "products", item.id);
  if (state.eventSupport.hasParasol && state.month >= 10 && state.month <= 12) add(run, "buffs", "season:summer-protection");
  for (const slot of AI_SLOT_IDS) if (state.aiShopState.subscriptions[slot].active) add(run, "products", `ai:${slot}`);
  if (getInternshipStatus(state).active) {
    const effect = getInternshipExperimentEffect(state);
    if (effect.bonus) add(run, "buffs", "action:experiment:bonus");
    if (effect.multiplier !== 1) add(run, "buffs", "action:experiment:multiplier");
    if (effect.moneyDiscount) add(run, "buffs", "experiment:money");
  }
  // This is evaluated from this state only. A previous state's Buffs are
  // lifetime evidence for collection achievements, but cannot be combined into
  // a simultaneous Buff panel snapshot.
  if (getCurrentAchievementBuffIds(state).length >= 10 && !run.satisfied.includes("global:buff-god")) {
    run.satisfied.push("global:buff-god");
  }
  for (const paper of [...state.papers, ...state.externalPublications]) {
    if (paper.status !== "published") continue;
    add(run, "directions", paper.topicId);
    if (!paper.journalTarget && !paper.publication?.journalTarget && paper.target && paper.submittedMonth && paper.submittedYear) {
      add(run, "conferences", getConferenceInfo(paper.submittedMonth, paper.target, paper.submittedYear).name);
    }
  }
  // This preview exists only after actual arrival, unlike a scheduled trip or a proxy presentation.
  for (const event of state.eventQueue) if (event.conferenceActivityPreview) add(run, "locations", event.conferenceActivityPreview.context.city);
}

export function observeAchievementCollections(
  prev: GameState, next: GameState, run: AchievementRunProgress, actionId?: GameActionId, payload?: DispatchPayload,
): void {
  if (actionId?.startsWith("debug-")) return;
  observeState(run, prev);
  observeState(run, next);
  // A trip can arrive and finish during one state transition; its committed counter distinguishes attendance from cancellations.
  if (next.eventCounters.meetingCount > prev.eventCounters.meetingCount) {
    const remaining = new Set((next.conferenceAttendancePlans ?? []).map((plan) => plan.context.id));
    for (const plan of prev.conferenceAttendancePlans ?? []) {
      if (plan.mode !== "proxy" && !remaining.has(plan.context.id) && (plan.context.availableAtTotalMonths ?? 0) <= next.totalMonths) add(run, "locations", plan.context.city);
    }
    if (actionId === "resolve-event" && payload?.eventChoiceId?.startsWith("ccig-enter-venue-")) {
      const event = prev.eventQueue.find((item) => item.id === payload.eventId);
      const year = event?.id.match(/-y(\d+)-m/);
      add(run, "locations", getCcigLocation(year ? Number(year[1]) : prev.year));
    }
  }
}

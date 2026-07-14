import { createPublicationEffectsState } from "./v2-publication-rules";
import { createReadingState } from "./v2-reading-system";
import { createCoffeeState } from "./v2-coffee-system";
import { createShopState } from "./v2-shop-items";
import { createTemporaryActionEffects } from "./v2-temporary-action-rules";
import type { GameState } from "./v2-types";
import { isObject } from "./v2-persistence-normalize-shared";

export function normalizeBestCareerOffer(value: unknown): GameState["bestCareerOffer"] {
  if (!isObject(value)) return null;
  if (
    typeof value.type === "string" &&
    typeof value.typeName === "string" &&
    typeof value.level === "string" &&
    typeof value.threshold === "number" &&
    typeof value.progress === "number"
  ) {
    return value as unknown as GameState["bestCareerOffer"];
  }
  return null;
}

export function normalizeActionBonuses(value: Record<string, unknown>): GameState["actionBonuses"] {
  if (!isObject(value.actionBonuses)) {
    return { idea: 0, experiment: 0, writing: 0 };
  }

  return {
    idea: typeof value.actionBonuses.idea === "number" ? value.actionBonuses.idea : 0,
    experiment: typeof value.actionBonuses.experiment === "number" ? value.actionBonuses.experiment : 0,
    writing: typeof value.actionBonuses.writing === "number" ? value.actionBonuses.writing : 0,
  };
}

export function normalizeShopState(value: Record<string, unknown>): GameState["shopState"] {
  const baseState = createShopState();
  if (!isObject(value.shopState)) {
    return baseState;
  }

  return {
    gpuServersBought: typeof value.shopState.gpuServersBought === "number" ? value.shopState.gpuServersBought : baseState.gpuServersBought,
    chairOwned: value.shopState.chairOwned === true,
    chairUpgrade: value.shopState.chairUpgrade === "advanced"
      || value.shopState.chairUpgrade === "massage"
      || value.shopState.chairUpgrade === "torture"
      || value.shopState.chairUpgrade === "spike"
      || value.shopState.chairUpgrade === "hammock"
      ? value.shopState.chairUpgrade
      : null,
    keyboardOwned: value.shopState.keyboardOwned === true,
    monitorOwned: value.shopState.monitorOwned === true,
    monitorUpgrade: value.shopState.monitorUpgrade === "4k"
      || value.shopState.monitorUpgrade === "smart"
      || value.shopState.monitorUpgrade === "dual"
      ? value.shopState.monitorUpgrade
      : null,
    bikeOwned: value.shopState.bikeOwned === true,
    bikeUpgrade: value.shopState.bikeUpgrade === "road" || value.shopState.bikeUpgrade === "ebike" ? value.shopState.bikeUpgrade : null,
    bikeSanSpent: typeof value.shopState.bikeSanSpent === "number" ? value.shopState.bikeSanSpent : 0,
    bikeSanCapGains: typeof value.shopState.bikeSanCapGains === "number" ? value.shopState.bikeSanCapGains : 0,
  };
}

export function normalizeCoffeeState(value: Record<string, unknown>): GameState["coffeeState"] {
  const baseState = createCoffeeState();
  if (!isObject(value.coffeeState)) {
    return baseState;
  }

  return {
    machineOwned: value.coffeeState.machineOwned === true,
    machineUpgrade: value.coffeeState.machineUpgrade === "automatic"
      || value.coffeeState.machineUpgrade === "advanced"
      || value.coffeeState.machineUpgrade === "unlimited"
      ? value.coffeeState.machineUpgrade
      : null,
    manualCoffeeBoughtThisMonth: typeof value.coffeeState.manualCoffeeBoughtThisMonth === "number" ? value.coffeeState.manualCoffeeBoughtThisMonth : 0,
    totalCoffeeBought: typeof value.coffeeState.totalCoffeeBought === "number" ? value.coffeeState.totalCoffeeBought : 0,
    machineTrackedCoffeeCount: typeof value.coffeeState.machineTrackedCoffeeCount === "number" ? value.coffeeState.machineTrackedCoffeeCount : 0,
  };
}

export function normalizeReadingState(value: Record<string, unknown>): GameState["readingState"] {
  const baseState = createReadingState();
  if (!isObject(value.readingState)) {
    return baseState;
  }

  return {
    readCount: typeof value.readingState.readCount === "number" ? value.readingState.readCount : 0,
    smartMonitorReadCount: typeof value.readingState.smartMonitorReadCount === "number" ? value.readingState.smartMonitorReadCount : 0,
    dualMonitorIdeaBonus: typeof value.readingState.dualMonitorIdeaBonus === "number" ? value.readingState.dualMonitorIdeaBonus : 0,
  };
}

export function normalizePersistentExtraActions(value: Record<string, unknown>): GameState["persistentExtraActions"] {
  if (!isObject(value.persistentExtraActions)) {
    return { idea: 0, experiment: 0, writing: 0 };
  }

  return {
    idea: typeof value.persistentExtraActions.idea === "number" ? value.persistentExtraActions.idea : 0,
    experiment: typeof value.persistentExtraActions.experiment === "number" ? value.persistentExtraActions.experiment : 0,
    writing: typeof value.persistentExtraActions.writing === "number" ? value.persistentExtraActions.writing : 0,
  };
}

export function normalizeTemporaryActionEffect(value: unknown): GameState["temporaryActionEffects"]["idea"] {
  if (!isObject(value)) {
    return createTemporaryActionEffects().idea;
  }

  return {
    bonus: typeof value.bonus === "number" ? value.bonus : 0,
    multiplier: typeof value.multiplier === "number" ? value.multiplier : 1,
    extraActions: typeof value.extraActions === "number" ? value.extraActions : 0,
  };
}

export function normalizeTemporaryActionEffects(value: Record<string, unknown>): GameState["temporaryActionEffects"] {
  if (!isObject(value.temporaryActionEffects)) {
    return createTemporaryActionEffects();
  }

  return {
    idea: normalizeTemporaryActionEffect(value.temporaryActionEffects.idea),
    experiment: normalizeTemporaryActionEffect(value.temporaryActionEffects.experiment),
    writing: normalizeTemporaryActionEffect(value.temporaryActionEffects.writing),
  };
}

export function normalizePublicationEffects(value: Record<string, unknown>): GameState["publicationEffects"] {
  if (!isObject(value.publicationEffects) || !Array.isArray(value.publicationEffects.nextCitationMultipliers)) {
    return createPublicationEffectsState();
  }

  return {
    nextCitationMultipliers: value.publicationEffects.nextCitationMultipliers.filter(
      (multiplier): multiplier is number => typeof multiplier === "number" && Number.isFinite(multiplier) && multiplier > 0,
    ),
    citationPenaltyMultiplier:
      typeof value.publicationEffects.citationPenaltyMultiplier === "number"
        && Number.isFinite(value.publicationEffects.citationPenaltyMultiplier)
        && value.publicationEffects.citationPenaltyMultiplier > 0
        ? value.publicationEffects.citationPenaltyMultiplier
        : 1,
  };
}

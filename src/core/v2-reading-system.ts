import { applyTemporaryActionEffectUpdates } from "./v2-temporary-action-rules";
import type { ReadingState, ShopState, TemporaryActionEffects } from "./v2-types";

export interface ReadActionResult {
  readingState: ReadingState;
  temporaryActionEffects: TemporaryActionEffects;
  sanCost: number;
  researchDelta: number;
  ideaBonus: number;
}

export interface DualMonitorMonthlyResult {
  readingState: ReadingState;
  temporaryActionEffects: TemporaryActionEffects;
  sanDelta: number;
  researchDelta: number;
  logs: string[];
}

export function createReadingState(): ReadingState {
  return {
    readCount: 0,
    smartMonitorReadCount: 0,
    dualMonitorIdeaBonus: 0,
  };
}

export function getReadSanCost(shopState: ShopState): number {
  if (shopState.monitorUpgrade === "4k") return 0;
  if (shopState.monitorUpgrade === "smart" || shopState.monitorUpgrade === "dual") return 2;
  if (shopState.monitorOwned) return 1;
  return 2;
}

export function getMonitorIdeaBonus(shopState: ShopState, readingState: ReadingState): number {
  if (shopState.monitorUpgrade !== "4k") {
    return 0;
  }
  return Math.floor(readingState.readCount / 10);
}

export function applyReadAction(
  readingState: ReadingState,
  shopState: ShopState,
  temporaryActionEffects: TemporaryActionEffects,
): ReadActionResult {
  const nextReadingState: ReadingState = {
    ...readingState,
    readCount: readingState.readCount + 1,
  };

  if (shopState.monitorUpgrade === "smart") {
    nextReadingState.smartMonitorReadCount += 1;
  }

  let ideaBonus = 1 + Math.floor((nextReadingState.readCount - 1) / 10);
  if (shopState.monitorUpgrade === "smart") {
    ideaBonus += Math.floor(nextReadingState.smartMonitorReadCount / 10);
  }

  const nextTemporaryActionEffects = applyTemporaryActionEffectUpdates(temporaryActionEffects, {
    idea: { bonus: ideaBonus },
  });

  return {
    readingState: nextReadingState,
    temporaryActionEffects: nextTemporaryActionEffects,
    sanCost: getReadSanCost(shopState),
    researchDelta: nextReadingState.readCount % 10 === 1 && nextReadingState.readCount >= 11 ? 1 : 0,
    ideaBonus,
  };
}

export function applyDualMonitorMonthlyRead(
  readingState: ReadingState,
  shopState: ShopState,
  temporaryActionEffects: TemporaryActionEffects,
): DualMonitorMonthlyResult {
  const clearedReadingState: ReadingState = {
    ...readingState,
    dualMonitorIdeaBonus: 0,
  };
  if (shopState.monitorUpgrade !== "dual") {
    return {
      readingState: clearedReadingState,
      temporaryActionEffects,
      sanDelta: 0,
      researchDelta: 0,
      logs: [],
    };
  }

  const nextReadingState: ReadingState = {
    ...clearedReadingState,
    readCount: clearedReadingState.readCount + 1,
  };
  const ideaBonus = 1 + Math.floor((nextReadingState.readCount - 1) / 10);
  nextReadingState.dualMonitorIdeaBonus = ideaBonus;

  return {
    readingState: nextReadingState,
    temporaryActionEffects,
    sanDelta: -2,
    researchDelta: nextReadingState.readCount % 10 === 1 && nextReadingState.readCount >= 11 ? 1 : 0,
    logs: [`双屏显示器自动阅读，SAN -2，下次想 idea +${ideaBonus}。`],
  };
}

export function consumeReadingIdeaBonus(readingState: ReadingState): ReadingState {
  if (readingState.dualMonitorIdeaBonus === 0) {
    return readingState;
  }

  return {
    ...readingState,
    dualMonitorIdeaBonus: 0,
  };
}

import type { EventQueueItem, LoverState, LoverTypeId } from "./v2-types";

const BASE_BEAUTIFUL_RECOVERY_RATE = 0.1;
const LOVER_MONTHLY_MONEY_COST = 2;

export interface LoverMonthlyEffectResult {
  loverState: LoverState;
  sanDelta: number;
  moneyDelta: number;
  logs: string[];
}

export function createLoverState(): LoverState {
  return {
    active: false,
    type: null,
    startTotalMonths: null,
    beautifulExtraRecoveryRate: 0,
  };
}

export function activateLover(type: LoverTypeId, totalMonths: number): LoverState {
  return {
    active: true,
    type,
    startTotalMonths: totalMonths,
    beautifulExtraRecoveryRate: 0,
  };
}

export function shouldEnqueueLoverDevelopment(input: {
  type: LoverTypeId;
  encounterCount: number;
  permanentlyBlocked: boolean;
  loverState: LoverState;
  eventQueue: EventQueueItem[];
}): boolean {
  return input.encounterCount >= 2
    && !input.permanentlyBlocked
    && !input.loverState.active
    && !input.eventQueue.some((event) => event.chainId === "lover-development");
}

export function getBeautifulMonthlyRecovery(loverState: LoverState, san: number, sanCap: number): number {
  if (!loverState.active || loverState.type !== "beautiful") {
    return 0;
  }

  const recoveryRate = BASE_BEAUTIFUL_RECOVERY_RATE + loverState.beautifulExtraRecoveryRate / 100;
  return Math.ceil(Math.max(0, sanCap - san) * recoveryRate);
}

export function applyLoverMonthlyEffect(loverState: LoverState, currentSan: number, sanCap: number): LoverMonthlyEffectResult {
  if (!loverState.active) {
    return {
      loverState,
      sanDelta: 0,
      moneyDelta: 0,
      logs: [],
    };
  }

  const sanDelta = getBeautifulMonthlyRecovery(loverState, currentSan, sanCap);
  const logs = loverState.type === "beautiful"
    ? [`恋人陪伴：SAN +${sanDelta}，约会开销 -${LOVER_MONTHLY_MONEY_COST}。`]
    : [`恋爱日常：约会开销 -${LOVER_MONTHLY_MONEY_COST}。`];

  return {
    loverState,
    sanDelta,
    moneyDelta: -LOVER_MONTHLY_MONEY_COST,
    logs,
  };
}

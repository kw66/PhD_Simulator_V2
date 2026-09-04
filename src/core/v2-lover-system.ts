import type { Gender, LoverState, LoverTypeId } from "./v2-types";

const BASE_BEAUTIFUL_RECOVERY_RATE = 0.1;

export function createLoverState(): LoverState {
  return {
    active: false,
    type: null,
    gender: null,
    startTotalMonths: null,
    beautifulExtraRecoveryRate: 0,
  };
}

export function getOppositeGender(gender: Gender): Gender {
  return gender === "male" ? "female" : "male";
}

export function activateLover(type: LoverTypeId, totalMonths: number, playerGender: Gender): LoverState {
  return {
    active: true,
    type,
    gender: getOppositeGender(playerGender),
    startTotalMonths: totalMonths,
    beautifulExtraRecoveryRate: 0,
  };
}

export function getBeautifulMonthlyRecovery(loverState: LoverState, san: number, sanCap: number): number {
  if (!loverState.active || loverState.type !== "beautiful") {
    return 0;
  }

  const recoveryRate = BASE_BEAUTIFUL_RECOVERY_RATE + loverState.beautifulExtraRecoveryRate / 100;
  return Math.ceil(Math.max(0, sanCap - san) * recoveryRate);
}

import type { Gender, LoverState, LoverTypeId } from "./v2-types";
import { pickStableRandomName } from "./v2-random-name";

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
  const gender = getOppositeGender(playerGender);
  return {
    active: true,
    name: getLoverName({ type, gender, startTotalMonths: totalMonths }),
    type,
    gender,
    startTotalMonths: totalMonths,
    beautifulExtraRecoveryRate: 0,
  };
}

export function getLoverName(lover: Pick<LoverState, "name" | "type" | "gender" | "startTotalMonths">): string {
  return lover.name?.trim() || pickStableRandomName(`lover:${lover.type}:${lover.startTotalMonths}:${lover.gender}`);
}

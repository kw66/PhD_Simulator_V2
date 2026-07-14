import type { GameState } from "./v2-types";

export type RandomRollProvider = () => number;

export function getControllerBonus(state: GameState): number {
  return state.eventSupport.hasGameController ? 2 : 0;
}

import {
  clampSan,
  clonePlayer,
} from "./v2-engine-helpers";
import { abandonThesis } from "./v2-thesis-rules";
import type { EventChoice, GameState } from "./v2-types";

export interface PlayerThesisResolution {
  nextPlayer: GameState["player"];
  nextSanCap: number;
  nextThesis: GameState["thesis"];
}

export function applyPlayerAndThesisChoiceEffects(
  state: GameState,
  choice: EventChoice,
): PlayerThesisResolution {
  const nextPlayer = clonePlayer(state.player);
  const nextSanCap = Math.max(0, state.sanCap + (choice.effects.sanCapDelta ?? 0));
  nextPlayer.san = clampSan(nextPlayer.san + (choice.effects.san ?? 0), nextSanCap);
  nextPlayer.research += choice.effects.research ?? 0;
  nextPlayer.social += choice.effects.social ?? 0;
  nextPlayer.favor += choice.effects.favor ?? 0;
  nextPlayer.money += choice.effects.money ?? 0;

  let nextThesis = state.thesis;
  if (choice.effects.abandonThesis === true) {
    nextThesis = abandonThesis(state.thesis);
  } else if ((choice.effects.thesisProgress ?? 0) > 0) {
    const nextProgress = Math.min(100, state.thesis.progress + (choice.effects.thesisProgress ?? 0));
    nextThesis = {
      ...state.thesis,
      started: true,
      progress: nextProgress,
      completed: nextProgress >= 100,
    };
  }

  return {
    nextPlayer,
    nextSanCap,
    nextThesis,
  };
}

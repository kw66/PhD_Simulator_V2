import { queueAdvisorGuidance, settleAdvisorGuidance } from "./v2-advisor-guidance";
import type { GameState } from "./v2-types";

export const PROJECT_PROGRESS_MAX = 100;
export const ADVISOR_HORIZONTAL_REWARD = 20;
export const PROJECT_LABOR_REWARD = 5;
export type LabProjectType = "horizontal" | "vertical";

export function advanceSharedLabProject(
  state: GameState,
  type: LabProjectType,
  amount: number,
  random: () => number = Math.random,
): { state: GameState; gain: number; completed: number } {
  const gain = Math.max(0, Math.floor(amount));
  if (state.phase !== "playing" || gain === 0) return { state, gain: 0, completed: 0 };
  const field = type === "horizontal" ? "horizontalProgress" : "verticalProgress";
  const total = (state.advisorProgressState[field] ?? 0) + gain;
  const completed = Math.floor(total / PROJECT_PROGRESS_MAX);
  let nextState: GameState = {
    ...state,
    advisorProgressState: { ...state.advisorProgressState, [field]: total % PROJECT_PROGRESS_MAX },
  };
  for (let index = 0; index < completed; index += 1) {
    if (type === "horizontal") {
      nextState = {
        ...nextState,
        player: { ...nextState.player, money: nextState.player.money + PROJECT_LABOR_REWARD },
        advisorProgressState: {
          ...nextState.advisorProgressState,
          funding: nextState.advisorProgressState.funding + ADVISOR_HORIZONTAL_REWARD,
        },
      };
    } else {
      const accumulation = nextState.advisorProgressState.researchAccumulation;
      nextState = {
        ...nextState,
        advisorProgressState: {
          ...nextState.advisorProgressState,
          researchAccumulation: accumulation + Math.floor(accumulation * 0.1),
        },
      };
      nextState = settleAdvisorGuidance(queueAdvisorGuidance(settleAdvisorGuidance(nextState, random)), random);
    }
  }
  return { state: nextState, gain, completed };
}

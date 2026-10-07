import { getAdvisorGuidanceAmount, queueAdvisorGuidance, settleAdvisorGuidance } from "./v2-advisor-guidance";
import { pushMilestoneLog } from "./v2-engine-helpers";
import type { GameState } from "./v2-types";

export const PROJECT_PROGRESS_MAX = 100;
export const ADVISOR_HORIZONTAL_REWARD = 60;
export const PROJECT_LABOR_REWARD = 5;
export const LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD = 60;
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
    let completionSummary: string;
    if (type === "horizontal") {
      nextState = {
        ...nextState,
        player: { ...nextState.player, money: nextState.player.money + PROJECT_LABOR_REWARD },
        advisorProgressState: {
          ...nextState.advisorProgressState,
          funding: nextState.advisorProgressState.funding + ADVISOR_HORIZONTAL_REWARD - PROJECT_LABOR_REWARD,
        },
      };
      completionSummary = `科研经费 +${ADVISOR_HORIZONTAL_REWARD}，劳务费经费 -${PROJECT_LABOR_REWARD}；金币 +${PROJECT_LABOR_REWARD}`;
    } else {
      nextState = settleAdvisorGuidance(nextState, random);
      const accumulation = nextState.advisorProgressState.researchAccumulation;
      nextState = {
        ...nextState,
        advisorProgressState: {
          ...nextState.advisorProgressState,
          researchAccumulation: accumulation + Math.floor(accumulation * 0.1),
        },
      };
      completionSummary = `科研积累 +${Math.floor(accumulation * 0.1)}`;
    }
    nextState = pushMilestoneLog(nextState,
      `${type === "horizontal" ? "横向" : "纵向"}项目完成：${completionSummary}`, `lab-project-${type}`);
    if (type === "vertical") {
      const previousPending = nextState.advisorProgressState.pendingGuidanceToPlayer;
      nextState = settleAdvisorGuidance(queueAdvisorGuidance(nextState), random);
      if (previousPending == null && nextState.advisorProgressState.pendingGuidanceToPlayer != null) {
        nextState = pushMilestoneLog(nextState,
          `导师指导：你的论文写作协作待使用（${getAdvisorGuidanceAmount()}分）`, "advisor-guidance-pending");
      }
    }
  }
  return { state: nextState, gain, completed };
}

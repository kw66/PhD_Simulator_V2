import { getAdvisorGuidanceAmount, queueAdvisorGuidance, settleAdvisorGuidance } from "./v2-advisor-guidance";
import { pushMilestoneLog } from "./v2-engine-helpers";
import { creditFellowMoney, ensureFellowFinanceAccounts, getFellowFinanceAccount } from "./v2-fellow-finance";
import { roundMoney } from "./v2-money";
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
  contributorId?: string,
): { state: GameState; gain: number; completed: number } {
  const gain = Math.max(0, Math.floor(amount));
  if (state.phase !== "playing" || gain === 0) return { state, gain: 0, completed: 0 };
  state = ensureFellowFinanceAccounts(state);
  const field = type === "horizontal" ? "horizontalProgress" : "verticalProgress";
  const total = (state.advisorProgressState[field] ?? 0) + gain;
  const completed = Math.floor(total / PROJECT_PROGRESS_MAX);
  let contributors = new Set(state.advisorProgressState.horizontalContributorIds ?? []);
  if (type === "horizontal" && contributorId) contributors.add(contributorId);
  let nextState: GameState = {
    ...state,
    advisorProgressState: { ...state.advisorProgressState, [field]: total % PROJECT_PROGRESS_MAX,
      ...(type === "horizontal" ? { horizontalContributorIds: [...contributors] } : {}),
    },
  };
  for (let index = 0; index < completed; index += 1) {
    let completionSummary: string;
    if (type === "horizontal") {
      const laborCost = PROJECT_LABOR_REWARD * (contributors.size + 1);
      const recipientNames = [...contributors].map((id) => getFellowFinanceAccount(nextState, id).name);
      for (const id of contributors) nextState = creditFellowMoney(nextState, id, PROJECT_LABOR_REWARD);
      nextState = {
        ...nextState,
        player: { ...nextState.player, money: roundMoney(nextState.player.money + PROJECT_LABOR_REWARD) },
        advisorProgressState: {
          ...nextState.advisorProgressState,
          funding: roundMoney(nextState.advisorProgressState.funding + ADVISOR_HORIZONTAL_REWARD - laborCost),
        },
      };
      completionSummary = `科研经费 +${ADVISOR_HORIZONTAL_REWARD}，科研经费 -${laborCost}（劳务费）；金币 +${PROJECT_LABOR_REWARD}${recipientNames.length ? `；${recipientNames.join("、")}各领${PROJECT_LABOR_REWARD}金币` : ""}`;
      contributors = new Set(contributorId ? [contributorId] : []);
      nextState = { ...nextState, advisorProgressState: { ...nextState.advisorProgressState,
        horizontalContributorIds: index === completed - 1 && total % PROJECT_PROGRESS_MAX === 0 ? [] : [...contributors],
      } };
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

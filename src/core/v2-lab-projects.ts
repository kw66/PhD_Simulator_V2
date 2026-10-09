import { getAdvisorGuidanceAmount, queueAdvisorGuidance, settleAdvisorGuidance } from "./v2-advisor-guidance";
import { pushMilestoneLog } from "./v2-engine-helpers";
import { creditFellowMoney, ensureFellowFinanceAccounts, getFellowFinanceAccount } from "./v2-fellow-finance";
import { roundMoney } from "./v2-money";
import { recordLabFinance } from "./v2-lab-finance-ledger";
import type { AdvisorProgressState, GameState } from "./v2-types";

export const PROJECT_PROGRESS_MAX = 100;
const HORIZONTAL_REWARD_BY_RANK = [50, 60, 70, 80, 90, 100] as const;
const PROJECT_LABOR_SHARE = 0.05;
export const LAB_PROJECT_VERTICAL_FUNDING_THRESHOLD = 60;
export type LabProjectType = "horizontal" | "vertical";

function getAdvisorRankIndex(advisor: AdvisorProgressState): number {
  const grantOrder = ["youth", "general", "excellent", "distinguished", "academician"] as const;
  return grantOrder.reduce((highest, id, index) => advisor.awards.some((award) => award.id === id) ? index : highest, -1) + 1;
}

export function getAdvisorHorizontalReward(advisor: AdvisorProgressState): number {
  return HORIZONTAL_REWARD_BY_RANK[getAdvisorRankIndex(advisor)]!;
}

export function advanceSharedLabProject(
  state: GameState,
  type: LabProjectType,
  amount: number,
  random: () => number = Math.random,
): { state: GameState; gain: number; completed: number } {
  const gain = Math.max(0, Math.floor(amount));
  if (state.phase !== "playing" || gain === 0) return { state, gain: 0, completed: 0 };
  state = ensureFellowFinanceAccounts(state);
  const field = type === "horizontal" ? "horizontalProgress" : "verticalProgress";
  const total = Math.floor(state.advisorProgressState[field] ?? 0) + gain;
  const completed = Math.floor(total / PROJECT_PROGRESS_MAX);
  let nextState: GameState = {
    ...state,
    advisorProgressState: { ...state.advisorProgressState, [field]: total % PROJECT_PROGRESS_MAX },
  };
  for (let index = 0; index < completed; index += 1) {
    let completionSummary: string;
    if (type === "horizontal") {
      const reward = getAdvisorHorizontalReward(nextState.advisorProgressState);
      const laborReward = roundMoney(reward * PROJECT_LABOR_SHARE);
      const recipients = nextState.fellowProgressState;
      const laborCost = roundMoney(laborReward * (recipients.length + 1));
      const recipientNames = recipients.map((profile) => getFellowFinanceAccount(nextState, profile.id).name);
      for (const profile of recipients) nextState = creditFellowMoney(nextState, profile.id, laborReward);
      nextState = {
        ...nextState,
        player: { ...nextState.player, money: roundMoney(nextState.player.money + laborReward) },
        advisorProgressState: {
          ...nextState.advisorProgressState,
          funding: roundMoney(nextState.advisorProgressState.funding + reward - laborCost),
        },
      };
      nextState = recordLabFinance(nextState, "horizontal-income", reward);
      nextState = recordLabFinance(nextState, "labor", -laborCost);
      completionSummary = `科研经费 +${reward}，科研经费 -${laborCost}（劳务费）；金币 +${laborReward}${recipientNames.length ? `；${recipientNames.join("、")}各领${laborReward}金币` : ""}`;
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

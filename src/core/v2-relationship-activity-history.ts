import { formatMoney } from "./v2-money";
import type { GameState } from "./v2-types";
import type { FellowProgressProfile, RelationshipActivityRecord } from "./v2-types-relationship";

export function getRelationshipActivityDetails(
  state: GameState,
  type: "advisor" | "lover" | "fellow",
  fellow?: FellowProgressProfile,
  historySnapshot = false,
): string {
  const activity = type === "fellow" ? fellow?.monthlyActivity
    : type === "advisor" ? state.advisorProgressState.monthlyActivity : state.loverProgressState.monthlyActivity;
  const costs = fellow?.monthlyPublicationCosts?.totalMonths === state.totalMonths
    ? fellow.monthlyPublicationCosts : undefined;
  const support = fellow?.lastSupportTotalMonths === state.totalMonths ? fellow.monthlySupportActivity : undefined;
  const annualActivity = type === "fellow" ? fellow?.annualResearchActivity
    : type === "lover" ? state.loverProgressState.annualResearchActivity : undefined;
  const annualGrowthMonth = type === "fellow" ? fellow?.lastAnnualGrowthTotalMonths
    : type === "lover" ? state.loverProgressState.lastAnnualGrowthTotalMonths : undefined;
  return [activity ?? "暂无活动",
    ...(costs?.registration ? [`注册经费-${formatMoney(costs.registration)}`] : []),
    ...(costs?.journal ? [`OA经费-${formatMoney(costs.journal)}`] : []),
    ...(support ? [support] : []),
    ...(annualActivity && (!historySnapshot || annualGrowthMonth === state.totalMonths)
      ? [`最近年度成长：${annualActivity.split("；")[0]}`] : []),
  ].join("\n");
}

export function recordRelationshipActivityMonth(state: GameState): GameState {
  if (state.totalMonths <= 0) return state;
  const record = (history: RelationshipActivityRecord[] | undefined, text: string): RelationshipActivityRecord[] => [
    { totalMonths: state.totalMonths, text }, ...(history ?? []).filter((entry) => entry.totalMonths !== state.totalMonths),
  ];
  return {
    ...state,
    advisorProgressState: {
      ...state.advisorProgressState,
      activityHistory: record(state.advisorProgressState.activityHistory, getRelationshipActivityDetails(state, "advisor")),
    },
    loverProgressState: !state.loverState.active ? state.loverProgressState : {
      ...state.loverProgressState,
      activityHistory: record(state.loverProgressState.activityHistory, getRelationshipActivityDetails(state, "lover", undefined, true)),
    },
    fellowProgressState: state.fellowProgressState.map((fellow) => ({
      ...fellow,
      activityHistory: record(fellow.activityHistory, getRelationshipActivityDetails(state, "fellow", fellow, true)),
      monthlyActivity: undefined,
    })),
  };
}

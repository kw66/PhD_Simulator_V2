import { roundMoney } from "./v2-money";
import type { GameState, LabFinanceCategory } from "./v2-types";

export type { LabFinanceCategory } from "./v2-types";

const CATEGORY_LABELS: Record<LabFinanceCategory, string> = {
  "conference-registration": "论文注册",
  "conference-travel": "论文差旅",
  "journal-fee": "期刊版面费",
  labor: "劳务费",
  "student-wages": "学生工资",
  "student-experiment": "学生实验",
  "player-experiment": "本人实验",
  "student-reimbursement": "学生报销",
  "horizontal-income": "横向收入",
  "grant-income": "基金收入",
  "initial-funding": "启动经费",
  other: "其他收支",
};

export function recordLabFinance(state: GameState, category: LabFinanceCategory, amount: number): GameState {
  const change = roundMoney(amount);
  if (!Number.isFinite(change) || change === 0) return state;
  const amounts = state.labFinanceLedger?.totalMonths === state.totalMonths ? state.labFinanceLedger.amounts : {};
  return {
    ...state,
    labFinanceLedger: {
      totalMonths: state.totalMonths,
      amounts: { ...amounts, [category]: roundMoney((amounts[category] ?? 0) + change) },
    },
  };
}

export function getLabFinanceMonthSummary(state: Pick<GameState, "labFinanceLedger" | "totalMonths">): {
  net: number;
  items: Array<{ label: string; amount: number }>;
} {
  const amounts = state.labFinanceLedger?.totalMonths === state.totalMonths ? state.labFinanceLedger.amounts : {};
  const items = (Object.entries(CATEGORY_LABELS) as Array<[LabFinanceCategory, string]>).flatMap(([category, label]) => {
    const amount = roundMoney(amounts[category] ?? 0);
    return amount === 0 ? [] : [{ label, amount }];
  });
  return { net: roundMoney(items.reduce((sum, item) => sum + item.amount, 0)), items };
}

import { getAdvisorSalaryPayment } from "./v2-advisor-progress";
import { MONTHLY_LIVING_COST } from "./v2-content";
import { getFellowAcademicYear } from "./v2-fellow-academic";
import { creditFellowMoney } from "./v2-fellow-finance";
import { roundMoney } from "./v2-money";
import { recordLabFinance } from "./v2-lab-finance-ledger";
import { settleFellowAcademicYear } from "./v2-fellow-lifecycle";
import { getCalendarForTotalMonths } from "./v2-progression";
import type { GameState } from "./v2-types";

export function getLabMonthlySalaryTotal(state: GameState): number {
  if (!state.selectedAdvisorName) return 0;
  return roundMoney(state.fellowProgressState.reduce((total, profile) => total + (getFellowAcademicYear(state, profile) > 0
    ? getAdvisorSalaryPayment(state.advisorProgressState, profile.degree ?? "master").payment : 0),
  getAdvisorSalaryPayment(state.advisorProgressState, state.degree).payment));
}

export function getLabPayroll(state: GameState) {
  const player = { payment: state.selectedAdvisorName && state.totalMonths > 1
    ? getAdvisorSalaryPayment(state.advisorProgressState, state.degree).payment : 0 };
  const fellows = state.fellowProgressState.map((profile) => ({ id: profile.id,
    payment: state.selectedAdvisorName && state.totalMonths > 1 && getFellowAcademicYear(state, profile) > 0
      && state.totalMonths > profile.startTotalMonths
      ? getAdvisorSalaryPayment(state.advisorProgressState, profile.degree ?? "master").payment : 0,
  }));
  return { player, fellows, total: roundMoney(player.payment + fellows.reduce((sum, payment) => sum + payment.payment, 0)) };
}

export function getNextMonthLabPayroll(state: GameState): ReturnType<typeof getLabPayroll> {
  if (state.phase !== "playing" || state.totalMonths >= state.maxMonths) {
    return { player: { payment: 0 }, fellows: [], total: 0 };
  }
  const totalMonths = state.totalMonths + 1;
  const calendar = getCalendarForTotalMonths(totalMonths, state.degree);
  return getLabPayroll({ ...settleFellowAcademicYear(state), totalMonths, year: calendar.year, month: calendar.month });
}

export function settleLabPayroll(state: GameState): GameState {
  if (state.totalMonths <= 1) return state;
  const payroll = getLabPayroll(state);
  let paidState = state;
  for (const payment of payroll.fellows) {
    const profile = state.fellowProgressState.find((entry) => entry.id === payment.id)!;
    if (state.totalMonths <= profile.startTotalMonths) continue;
    const familySupport = getFellowAcademicYear(state, profile) === 0 ? MONTHLY_LIVING_COST : 0;
    paidState = creditFellowMoney(paidState, payment.id, payment.payment + familySupport - MONTHLY_LIVING_COST);
  }
  return recordLabFinance({ ...paidState,
    advisorProgressState: { ...state.advisorProgressState,
      funding: roundMoney(state.advisorProgressState.funding - payroll.total) },
    fellowProgressState: state.fellowProgressState.map((profile) => {
      const payment = payroll.fellows.find((entry) => entry.id === profile.id)!;
      return { ...profile,
        monthlySalaryPaid: payment.payment, lastSalaryTotalMonths: state.totalMonths };
    }),
  }, "student-wages", -payroll.total);
}

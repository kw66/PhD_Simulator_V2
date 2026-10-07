import { getAdvisorMonthlySalary } from "./v2-advisor-progress";
import { getFellowAcademicYear } from "./v2-fellow-academic";
import { getAccumulatedPayment } from "./v2-numeric-modifiers";
import type { GameState } from "./v2-types";

export function getLabMonthlySalaryTotal(state: GameState): number {
  if (!state.selectedAdvisorName) return 0;
  return state.fellowProgressState.reduce((total, profile) => total + (getFellowAcademicYear(state, profile) > 0
    ? getAdvisorMonthlySalary(state.advisorProgressState, profile.degree ?? "master") : 0),
  getAdvisorMonthlySalary(state.advisorProgressState, state.degree));
}

export function getLabPayroll(state: GameState) {
  const player = state.selectedAdvisorName
    ? getAccumulatedPayment(getAdvisorMonthlySalary(state.advisorProgressState, state.degree), state.advisorProgressState.salaryRemainder)
    : { payment: 0, remainder: state.advisorProgressState.salaryRemainder ?? 0 };
  const fellows = state.fellowProgressState.map((profile) => ({ id: profile.id,
    ...getAccumulatedPayment(state.selectedAdvisorName && getFellowAcademicYear(state, profile) > 0
      && state.totalMonths > profile.startTotalMonths
      ? getAdvisorMonthlySalary(state.advisorProgressState, profile.degree ?? "master") : 0, profile.salaryRemainder),
  }));
  return { player, fellows, total: player.payment + fellows.reduce((sum, payment) => sum + payment.payment, 0) };
}

export function settleLabPayroll(state: GameState): GameState {
  if (!state.selectedAdvisorName || state.totalMonths <= 1) return state;
  const payroll = getLabPayroll(state);
  return { ...state,
    advisorProgressState: { ...state.advisorProgressState,
      funding: Math.max(0, state.advisorProgressState.funding - payroll.total), salaryRemainder: payroll.player.remainder },
    fellowProgressState: state.fellowProgressState.map((profile) => {
      const payment = payroll.fellows.find((entry) => entry.id === profile.id)!;
      return { ...profile, salaryRemainder: payment.remainder,
        monthlySalaryPaid: payment.payment, lastSalaryTotalMonths: state.totalMonths };
    }),
  };
}

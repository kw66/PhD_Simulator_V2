import type { RandomRollProvider } from "./v2-random-events-lab-shared";
import { getActualSanChange } from "./v2-sanity-rules";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorMeetingRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const isHighResearch = state.player.research >= 6;
  const advisorPresentForSeries = getRoll() < 0.5;
  const advisorPresentForSlack = getRoll() < 0.5;
  const seriesSanChange = getActualSanChange(-3, state.month, state.eventSupport);

  return {
    id: `random-6-y${state.year}-m${state.month}-n${serial}`,
    title: "组会汇报",
    description: "这次周组会轮到你汇报。你可以搏高上限、走稳妥路线，或者选择临时应付。",
    preview: "轮到你汇报了",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-6",
    stage: "act1",
    choices: [
      {
        id: `random-6-deep-${serial}`,
        label: "讲深奥论文",
        outcome: isHighResearch ? "导师好感 +1。" : "导师好感 -1。",
        effects: { favor: isHighResearch ? 1 : -1 },
      },
      {
        id: `random-6-series-${serial}`,
        label: "讲系列论文",
        outcome: advisorPresentForSeries ? `SAN ${seriesSanChange}，导师好感 +2。` : `SAN ${seriesSanChange}。`,
        effects: advisorPresentForSeries ? { san: seriesSanChange, favor: 2 } : { san: seriesSanChange },
      },
      {
        id: `random-6-slack-${serial}`,
        label: "随便水一下",
        outcome: advisorPresentForSlack ? "导师好感 -1。" : "无事发生。",
        effects: advisorPresentForSlack ? { favor: -1 } : {},
      },
    ],
  };
}

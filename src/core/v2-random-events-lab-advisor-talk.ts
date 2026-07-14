import { getActualSanChange } from "./v2-sanity-rules";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorTalkRandomEvent(state: GameState): PendingEvent {
  const serial = state.totalRandomEventCount;
  const isHighResearch = state.player.research >= 6;
  const isHighFavor = state.player.favor >= 6;
  const internshipSanChange = getActualSanChange(-6, state.month, state.eventSupport);

  return {
    id: `random-5-y${state.year}-m${state.month}-n${serial}`,
    title: "导师约谈",
    description: "导师找你谈话。你可以选择如实汇报、请教方法，或者争取一段实习经历。",
    preview: "导师找你谈话",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-5",
    stage: "act1",
    choices: [
      {
        id: `random-5-report-${serial}`,
        label: "认真汇报",
        outcome: isHighResearch ? "下次想 idea +5。" : "导师好感 -1。",
        effects: isHighResearch
          ? {
            temporaryActionEffectUpdates: {
              idea: { bonus: 5 },
            },
          }
          : {
            favor: -1,
          },
      },
      {
        id: `random-5-ask-${serial}`,
        label: "请教推进方法",
        outcome: isHighFavor ? "科研 +1。" : "导师好感 -1。",
        effects: isHighFavor ? { research: 1 } : { favor: -1 },
      },
      {
        id: `random-5-intern-${serial}`,
        label: "提出去实习",
        outcome: isHighFavor ? `SAN ${internshipSanChange}，金钱 +5，下次实验 +5。` : "导师好感 -1。",
        effects: isHighFavor
          ? {
            san: internshipSanChange,
            money: 5,
            temporaryActionEffectUpdates: {
              experiment: { bonus: 5 },
            },
          }
          : {
            favor: -1,
          },
      },
    ],
  };
}

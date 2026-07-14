import { getActualSanChange } from "./v2-sanity-rules";
import type { GameState, PendingEvent } from "./v2-types";

export function createAdvisorAuthorshipRandomEvent(state: GameState): PendingEvent {
  const serial = state.totalRandomEventCount;
  const lowFavor = state.player.favor < 6;
  const isTeacherChild = state.selectedRoleId === "teacher-child";
  const argueSanChange = getActualSanChange(-2, state.month, state.eventSupport);

  return {
    id: `random-12-y${state.year}-m${state.month}-n${serial}`,
    title: "署名风波",
    description: "合作论文的署名安排让你陷入被动。你得决定是忍耐、转移矛盾，还是直接正面施压。",
    preview: "导师抢一作了",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-12",
    stage: "act1",
    choices: [
      {
        id: `random-12-complain-${serial}`,
        label: "向导师诉苦",
        outcome: lowFavor ? "下次想 idea -5。" : "导师愿意安抚你，这次没有额外代价。",
        effects: lowFavor
          ? {
            temporaryActionEffectUpdates: {
              idea: { bonus: -5 },
            },
          }
          : {},
      },
      {
        id: `random-12-transfer-${serial}`,
        label: "转移到别人",
        outcome: isTeacherChild ? "社交 -2，直接获得一篇已发表 C 类论文。" : "社交 -1。",
        effects: isTeacherChild
          ? {
            social: -2,
            score: 1,
            grantedPublication: {
              target: "C",
              acceptedScore: 15,
            },
          }
          : {
            social: -1,
          },
      },
      {
        id: `random-12-argue-${serial}`,
        label: "据理力争",
        outcome: lowFavor ? `SAN ${argueSanChange}。` : "你把话说开了，这次没有额外代价。",
        effects: lowFavor ? { san: argueSanChange } : {},
      },
      {
        id: `random-12-pressure-${serial}`,
        label: "极端施压",
        outcome: "金钱 +2，导师好感 -2。",
        effects: {
          money: 2,
          favor: -2,
        },
      },
    ],
  };
}

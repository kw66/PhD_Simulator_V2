import { getActualSanChange } from "./v2-sanity-rules";
import { getControllerBonus } from "./v2-random-events-campus-shared";
import type { GameState, PendingEvent } from "./v2-types";

export function createEntertainmentCampusRandomEvent(state: GameState): PendingEvent {
  const serial = state.totalRandomEventCount;
  const controllerBonus = getControllerBonus(state);
  const terrariaCount = state.eventCounters.terrariaCount + 1;
  const magicTowerCount = state.eventCounters.magicTowerCount + 1;
  const gradSimCount = state.eventCounters.gradSimCount + 1;

  return {
    id: `random-15-y${state.year}-m${state.month}-n${serial}`,
    title: "游戏放松",
    description: "一天高强度学习和科研结束后，你决定留一点时间给娱乐。不同游戏会把你带向不同后果：有的更像社交补给，有的能练脑子，有的恢复快，也有的能换点零花钱。",
    preview: "学了一天，想放松一下...",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-15",
    stage: "act1",
    choices: [
      {
        id: `random-15-terraria-${serial}`,
        label: "玩泰拉瑞亚",
        outcome: `社交 +1，SAN ${getActualSanChange(-(4 - controllerBonus), state.month, state.eventSupport)}。`,
        effects: {
          social: 1,
          san: getActualSanChange(-(4 - controllerBonus), state.month, state.eventSupport),
          counterDeltas: { gamePlayCount: 1, terrariaCount: 1 },
          achievementFlags: terrariaCount >= 3 ? ["terraria300"] : [],
        },
      },
      {
        id: `random-15-magic-tower-${serial}`,
        label: "玩魔塔50层",
        outcome: `科研 +1，SAN ${getActualSanChange(-(6 - controllerBonus), state.month, state.eventSupport)}。`,
        effects: {
          research: 1,
          san: getActualSanChange(-(6 - controllerBonus), state.month, state.eventSupport),
          counterDeltas: { gamePlayCount: 1, magicTowerCount: 1 },
          achievementFlags: magicTowerCount >= 3 ? ["magicTowerMaster"] : [],
        },
      },
      {
        id: `random-15-grad-sim-${serial}`,
        label: "玩研究生模拟器",
        outcome: "SAN +2。",
        effects: {
          san: 2,
          counterDeltas: { gamePlayCount: 1, gradSimCount: 1 },
          achievementFlags: gradSimCount >= 3 ? ["thankYouPlaying"] : [],
        },
      },
      {
        id: `random-15-kings-${serial}`,
        label: "打王者荣耀",
        outcome: `金钱 +2，SAN ${getActualSanChange(-(5 - controllerBonus), state.month, state.eventSupport)}。`,
        effects: {
          money: 2,
          san: getActualSanChange(-(5 - controllerBonus), state.month, state.eventSupport),
          counterDeltas: { gamePlayCount: 1 },
        },
      },
    ],
  };
}

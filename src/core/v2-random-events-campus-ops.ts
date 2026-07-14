import { getActualSanChange } from "./v2-sanity-rules";
import type { GameState, PendingEvent } from "./v2-types";
import type { RandomRollProvider } from "./v2-random-events-campus-shared";

export function createOpsCampusRandomEvent(state: GameState, getRoll: RandomRollProvider): PendingEvent {
  const serial = state.totalRandomEventCount;
  const reinstallSanChange = getActualSanChange(-3, state.month, state.eventSupport);
  const taobaoFailureSanChange = getActualSanChange(-2, state.month, state.eventSupport);
  const reinstallSuccess = getRoll() < 0.5;
  const taobaoSuccess = getRoll() < 0.5;

  return {
    id: `random-13-y${state.year}-m${state.month}-n${serial}`,
    title: "服务器宕机",
    description: "实验跑到一半时服务器突然报错中断。你得判断是先止血、追责，还是自己承担修复风险。",
    preview: "服务器又出问题了",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-13",
    stage: "act1",
    choices: [
      {
        id: `random-13-advisor-${serial}`,
        label: "催导师修",
        outcome: "永久实验 -2。",
        effects: {
          experimentBonus: -2,
        },
      },
      {
        id: `random-13-report-${serial}`,
        label: "举报挖矿",
        outcome: "社交 -2。",
        effects: {
          social: -2,
        },
      },
      {
        id: `random-13-reinstall-${serial}`,
        label: "自己重装",
        outcome: reinstallSuccess
          ? `SAN ${reinstallSanChange}。`
          : `SAN ${reinstallSanChange}，社交 -1，下次实验 x0.5。`,
        effects: reinstallSuccess
          ? { san: reinstallSanChange }
          : {
            san: reinstallSanChange,
            social: -1,
            temporaryActionEffectUpdates: {
              experiment: { multiplier: 0.5 },
            },
          },
      },
      {
        id: `random-13-taobao-${serial}`,
        label: "淘宝找人",
        outcome: taobaoSuccess
          ? "金钱 -2。"
          : `金钱 -4，SAN ${taobaoFailureSanChange}。`,
        effects: taobaoSuccess
          ? { money: -2 }
          : { money: -4, san: taobaoFailureSanChange },
      },
    ],
  };
}

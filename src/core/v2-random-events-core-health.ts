import { applyTierResist, getActualSanChange } from "./v2-sanity-rules";
import { createRandomEventChoice, type RandomRollProvider } from "./v2-random-events-core-shared";
import type { EventChoice, GameState, PendingEvent } from "./v2-types";

export function createIllnessRandomEvent(
  state: GameState,
  getRoll: RandomRollProvider,
): { nextState: GameState; event: PendingEvent } {
  const nextColdCount = state.eventCounters.coldCount + 1;
  const nextState: GameState = {
    ...state,
    eventCounters: {
      ...state.eventCounters,
      coldCount: nextColdCount,
    },
    achievementFlags: {
      ...state.achievementFlags,
      sickly: state.achievementFlags.sickly || nextColdCount >= 3,
    },
  };

  const hardWorkResist = applyTierResist(-4, state.player.san, getRoll);
  const hardWorkNextCap = Math.max(0, state.sanCap + hardWorkResist.effectiveChange);
  const medicineResist = applyTierResist(-4, state.player.san, getRoll);
  const restResist = applyTierResist(-8, state.player.san, getRoll);
  const serial = state.totalRandomEventCount;

  const medicineChoice: EventChoice = state.player.money < 2
    ? {
      id: `random-3-medicine-${serial}`,
      label: "先买药",
      outcome: "金钱不足 2，暂时买不起药，只能重新考虑其他方案。",
      effects: {
        stayOnEvent: true,
      },
    }
    : {
      id: `random-3-medicine-${serial}`,
      label: "先买药",
      outcome: `金钱 -2，SAN ${getActualSanChange(medicineResist.effectiveChange, state.month, state.eventSupport)}。`,
      effects: {
        money: -2,
        san: getActualSanChange(medicineResist.effectiveChange, state.month, state.eventSupport),
      },
    };

  const hospitalChoice: EventChoice = state.player.money < 4
    ? {
      id: `random-3-hospital-${serial}`,
      label: "去医院",
      outcome: "金钱不足 4，挂号和检查费用不够，只能改选其他方案。",
      effects: {
        stayOnEvent: true,
      },
    }
    : {
      id: `random-3-hospital-${serial}`,
      label: "去医院",
      outcome: "金钱 -4，SAN +2。",
      effects: {
        money: -4,
        san: 2,
      },
    };

  return {
    nextState,
    event: {
      id: `random-3-y${state.year}-m${state.month}-n${serial}`,
      title: "疾病来袭",
      description: "早上闹钟响了三次你才爬起来，喉咙发紧、四肢发沉，体温已经到 38.5°C。偏偏这周排着组会和实验节点，你得立刻在“保进度”和“保身体”之间做决定。",
      preview: "身体不舒服，需要休息",
      source: "random",
      blocking: true,
      deadlineMonths: 0,
      chainId: "random-3",
      stage: "act1",
      choices: [
        {
          id: `random-3-strong-${serial}`,
          label: "硬撑工作",
          outcome: hardWorkResist.effectiveChange < 0
            ? `SAN 上限 ${hardWorkResist.effectiveChange}；这次感冒拖得很久，后续恢复明显变差。`
            : "这次居然扛住了，SAN 上限没有继续下降。",
          effects: {
            sanCapDelta: hardWorkResist.effectiveChange,
            achievementFlags: hardWorkResist.effectiveChange < 0 && hardWorkNextCap <= 10 ? ["nearDeath"] : [],
          },
        },
        medicineChoice,
        hospitalChoice,
        {
          id: `random-3-rest-${serial}`,
          label: "休息一天",
          outcome: `SAN ${getActualSanChange(restResist.effectiveChange, state.month, state.eventSupport)}。`,
          effects: {
            san: getActualSanChange(restResist.effectiveChange, state.month, state.eventSupport),
          },
        },
      ],
    },
  };
}

export function createImmuneColdEvent(state: GameState): PendingEvent {
  const serial = state.totalRandomEventCount;
  return {
    id: `random-immune-cold-y${state.year}-m${state.month}-n${serial}`,
    title: "💪 抵抗感冒",
    description: "本来你要感冒了，但今年打过羽毛球强化了身体，成功把这次疾病来袭扛了过去。",
    preview: "今年打过羽毛球，身体倍儿棒！",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-3",
    stage: "act1",
    choices: createRandomEventChoice(serial),
  };
}

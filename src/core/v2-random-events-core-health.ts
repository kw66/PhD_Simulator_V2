import { applyTierResist, getActualSanChange } from "./v2-sanity-rules";
import {
  createRandomEventChoice,
  createThreeStageRandomEvent,
  type RandomRollProvider,
} from "./v2-random-events-core-shared";
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

  const event: PendingEvent = {
    id: `random-3-y${state.year}-m${state.month}-n${serial}`,
    title: "疾病来袭",
    description: "一觉醒来烧到 38.5°C，脑子沉得连消息都不想回。这周偏偏还有组会和实验，你得决定怎么撑过去。",
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
  };

  return {
    nextState,
    event: createThreeStageRandomEvent(event, {
      introDescription: [
        "早上闹钟响了三次你才爬起来，喉咙发紧、四肢发沉，体温已经到 38.5°C。",
        "偏偏这周排着组会和实验节点，任何掉速都会把后面的计划连锁打乱。",
        "你得在“保进度”和“保身体”之间，立刻做一个不舒服的决定。",
      ].join("\n\n"),
      decisionTitle: "你的选择",
      decisionDescription: [
        "“硬撑：今天进度不掉，但身体账可能变成长债。”",
        "“买药：成本低一些，能换来可控恢复。”",
        "“去医院：最稳的修复方案，但金币支出最大。”",
        "“休息：短期最安全，后续补进度会更焦虑。”你这次不是在选轻松，而是在选哪种后果最可持续。",
      ].join("\n\n"),
      results: {
        [`random-3-strong-${serial}`]: {
          title: "硬扛",
          description: hardWorkResist.effectiveChange < 0
            ? [
                "你还是去了实验室，靠咖啡和止痛药硬把当天安排顶完。",
                "同门劝你回去休息，你嘴上说“没事”，手却一直在发抖。",
                "这次感冒拖得很久，后面几周你明显感觉恢复力变差了。",
                `判定口径：SAN 上限基础 -4，按当前 SAN 执行概率抵消后，实际 ${hardWorkResist.effectiveChange}。`,
              ].join("\n\n")
            : [
                "你把当天关键步骤咬牙做完，晚上才回寝室倒头就睡。",
                "这次虽然冒险，但你意外地扛住了，几天后状态逐步回正。",
                "你心里清楚：这次是侥幸，不该当常规方案。",
                "判定口径：SAN 上限基础 -4，本次被概率抵消。",
              ].join("\n\n"),
        },
        [`random-3-medicine-${serial}`]: {
          title: "吃药",
          description: medicineResist.effectiveChange < 0
            ? [
                "你先去药店配了药，把高热先压下去，再按时休息补水。",
                "白天效率确实掉了，但至少没有把病拖成更大事故。",
                "几天后症状缓解，你把延误控制在可接受范围内。",
                `判定口径：SAN 基础 -4，按当前 SAN 执行概率抵消后，实际 ${medicineResist.effectiveChange}。`,
              ].join("\n\n")
            : [
                "你迅速买药处理，休息节奏也跟上了。",
                "恢复速度比预想更快，基本没被这次感冒拖垮。",
                "判定口径：SAN 基础 -4，本次被概率抵消。",
              ].join("\n\n"),
        },
        [`random-3-hospital-${serial}`]: {
          title: "去医院",
          description: [
            "你去校医院挂号、验血、输液，流程虽然慢，但处理很扎实。",
            "医生让你强制休息两天，别再拿身体硬拼进度。",
            "花钱买来了确定性恢复，后续计划基本没有大幅偏航。",
          ].join("\n\n"),
        },
        [`random-3-rest-${serial}`]: {
          title: "休息",
          description: restResist.effectiveChange < 0
            ? [
                "你给导师发消息请假，把手机调成静音，整天只做喝水和睡觉两件事。",
                "病是慢慢压下去了，但想到堆积的任务，心理负担并没有立刻消失。",
                "恢复后你还要补回进度，整体精神消耗仍然很大。",
                `判定口径：SAN 基础 -8，按当前 SAN 执行概率抵消后，实际 ${restResist.effectiveChange}。`,
              ].join("\n\n")
            : [
                "你果断停工休息，把恢复放在第一优先级。",
                "这一觉睡得很实，第二天状态回升得比预期更快。",
                "你意识到：及时止损本身也是一种效率。",
                "判定口径：SAN 基础 -8，本次被概率抵消。",
              ].join("\n\n"),
        },
      },
    }),
  };
}

export function createImmuneColdEvent(state: GameState): PendingEvent {
  const serial = state.totalRandomEventCount;
  return {
    id: `random-immune-cold-y${state.year}-m${state.month}-n${serial}`,
    title: "疾病来袭 ➜ 你的选择 ➜ 抵抗感冒",
    description: "本来你要感冒了……\n\n但是今年打过羽毛球强化了身体，成功抵抗了感冒！",
    preview: "今年打过羽毛球，身体倍儿棒！",
    source: "random",
    blocking: true,
    deadlineMonths: 0,
    chainId: "random-3",
    stage: "result",
    choices: createRandomEventChoice(serial).map((choice) => ({
      ...choice,
      label: "身体倍儿棒！",
      outcome: "今年打过羽毛球，成功抵抗感冒！",
    })),
  };
}

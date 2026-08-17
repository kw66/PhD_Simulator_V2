import {
  createFixedEvent,
  drawInclusiveInt,
  drawWeightedTriplet,
  type FixedResolutionResult,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import { applyTierResist } from "./v2-sanity-rules";
import type { FixedEventResolution, GameState, PendingEvent } from "./v2-types";

function createWinterVacationDescription(branchDescription: string, moneyGain: number, isRich: boolean): string {
  return [
    branchDescription,
    "你把闹钟关掉，按自己的节奏吃饭、见人、散步。",
    "过年串门、家庭饭局、老同学消息，把你从“只盯指标”的状态里拽了出来。",
    "临返校前，你盘了一遍下学期计划，发现自己终于又能把目标看清了。",
    `长辈们给了你${moneyGain}个红包${isRich ? "（家境殷实，红包格外丰厚！）" : ""}，你收下了这份心意。`,
  ].join("\n\n");
}

function createWinterVacationResultEvent(params: {
  year: number;
  month: number;
  description: string;
  outcome: string;
  moneyGain: number;
  sanRecovery: number;
  socialChange: number;
}): PendingEvent {
  return createFixedEvent({
    id: `winter-vacation-result-y${params.year}-m${params.month}`,
    title: "寒假 ➜ 假期计划 ➜ 假期结束",
    description: params.description,
    preview: "寒假结束，查看这次休整的结果",
    chainId: "winter-vacation",
    stage: "result",
    choices: [
      {
        id: `winter-vacation-finish-y${params.year}-m${params.month}`,
        label: "继续",
        outcome: params.outcome,
        effects: {
          ...(params.moneyGain !== 0 ? { money: params.moneyGain } : {}),
          ...(params.sanRecovery !== 0 ? { san: params.sanRecovery } : {}),
          ...(params.socialChange !== 0 ? { social: params.socialChange } : {}),
        },
      },
    ],
  });
}

function createWinterVacationPlanEvent(state: GameState): PendingEvent {
  return createFixedEvent({
    id: `winter-vacation-plan-y${state.year}-m${state.month}`,
    title: "寒假 ➜ 假期计划",
    description: [
      "“这学期我一直在被进度追着跑，脑子像过热了一样。”",
      "“这次假期要是休整到位，开学时状态会更稳。”",
      "“回家这段时间会混着人情往来、家庭期待和旧同学重逢，情绪不一定全是轻松，但总归比硬撑更可持续。”",
      "你决定给自己一次完整的“降速窗口”，把积压疲惫先处理掉，再用更清晰的状态回到赛道。",
    ].join("\n\n"),
    preview: "让假期先帮你降速、重置状态",
    chainId: "winter-vacation",
    stage: "act2",
    choices: [
      {
        id: `winter-vacation-rest-y${state.year}-m${state.month}`,
        label: "好好休息",
        outcome: "好好休息。",
        effects: {
          fixedEventResolution: { kind: "winter-vacation-rest" },
        },
      },
    ],
  });
}

export function createWinterVacationEvent(state: GameState): PendingEvent {
  return createFixedEvent({
    id: `winter-vacation-y${state.year}-m${state.month}`,
    title: "寒假",
    description: [
      "放假通知刚发，实验楼的灯就比平时早灭了。",
      "你拖着行李箱走出校门，脑子里还挂着没清完的待办清单。",
      "回到家后，热饭热汤和父母的碎碎念，把你从论文节奏里拉回了生活现场。",
      "你知道这一段时间并不只是“回家休息”，更像一次系统重启：先让身体和情绪从高压里脱钩，再决定下学期怎么跑。",
    ].join("\n\n"),
    preview: "寒假到了，准备回家过年",
    chainId: "winter-vacation",
    choices: [
      {
        id: `winter-vacation-continue-y${state.year}-m${state.month}`,
        label: "继续",
        outcome: "开始过年。",
        effects: {
          enqueueEvents: [createWinterVacationPlanEvent(state)],
        },
      },
    ],
  });
}

export function resolveWinterVacationFixedEvent(
  state: GameState,
  resolution: FixedEventResolution,
  getRoll: RandomRollProvider,
): FixedResolutionResult | null {
  if (resolution.kind !== "winter-vacation-rest") {
    return null;
  }

  const missingSan = Math.max(0, state.sanCap - state.player.san);
  const sanRecovery = Math.ceil(missingSan * 0.1);
  const redEnvelope = state.selectedRoleId === "rich"
    ? drawWeightedTriplet(4, 6, getRoll)
    : drawWeightedTriplet(1, 3, getRoll);
  const branch = drawInclusiveInt(1, 3, getRoll);

  if (branch === 1) {
    const socialChange = applyTierResist(1, state.player.social, getRoll).effectiveChange;
    return {
      nextState: state,
      outcome: socialChange > 0
        ? `金钱 +${redEnvelope}，SAN +${sanRecovery}，社交 +${socialChange}。`
        : `金钱 +${redEnvelope}，SAN +${sanRecovery}。`,
      enqueueEvents: [createWinterVacationResultEvent({
        year: state.year,
        month: state.month,
        description: createWinterVacationDescription([
          "在商场逛街时，你偶遇了高中同学。",
          "“好久不见！听说你在读研？”老同学热情地和你聊了起来。",
          "你们一起喝了杯咖啡，聊着各自的近况。虽然已经很久没见，但那种熟悉的感觉还在。",
        ].join("\n\n"), redEnvelope, state.selectedRoleId === "rich"),
        outcome: socialChange > 0
          ? `金钱 +${redEnvelope}，SAN +${sanRecovery}，社交 +${socialChange}。`
          : `金钱 +${redEnvelope}，SAN +${sanRecovery}。`,
        moneyGain: redEnvelope,
        sanRecovery,
        socialChange,
      })],
    };
  }

  if (branch === 2) {
    if (state.loverState.active) {
      const doubledEnvelope = redEnvelope * 2;
      return {
        nextState: state,
        outcome: `金钱 +${doubledEnvelope}，SAN +${sanRecovery}。`,
        enqueueEvents: [createWinterVacationResultEvent({
          year: state.year,
          month: state.month,
          description: createWinterVacationDescription([
            "你带着恋人回家见父母。",
            "父母对你的另一半很满意，笑得合不拢嘴：“不错不错，什么时候结婚啊？”",
            "长辈们纷纷给你们包了大红包，你感受到了家人的祝福和期待。",
            "虽然有点害羞，但心里暖暖的。",
          ].join("\n\n"), doubledEnvelope, state.selectedRoleId === "rich"),
          outcome: `金钱 +${doubledEnvelope}，SAN +${sanRecovery}。`,
          moneyGain: doubledEnvelope,
          sanRecovery,
          socialChange: 0,
        })],
      };
    }

    return {
      nextState: state,
      outcome: `金钱 +${redEnvelope}，SAN +${sanRecovery}。`,
      enqueueEvents: [createWinterVacationResultEvent({
        year: state.year,
        month: state.month,
        description: createWinterVacationDescription([
          "年夜饭上，七大姑八大姨开始了例行“关心”。",
          "“有对象了吗？”“什么时候结婚啊？”“你看隔壁小王都生二胎了！”",
          "你尴尬地笑着应付，心里却感到一阵疲惫……",
          "读研已经够累了，还要被催婚，真是雪上加霜。",
        ].join("\n\n"), redEnvelope, state.selectedRoleId === "rich"),
        outcome: `金钱 +${redEnvelope}，SAN +${sanRecovery}。`,
        moneyGain: redEnvelope,
        sanRecovery,
        socialChange: 0,
      })],
    };
  }

  return {
    nextState: state,
    outcome: `金钱 +${redEnvelope}，SAN +${sanRecovery}。`,
    enqueueEvents: [createWinterVacationResultEvent({
      year: state.year,
      month: state.month,
      description: createWinterVacationDescription([
        "假期过得很平静，没有什么特别的事情发生。",
        "你享受着难得的悠闲时光，每天睡到自然醒，陪父母看看电视，和老朋友线上聊聊天。",
      ].join("\n\n"), redEnvelope, state.selectedRoleId === "rich"),
      outcome: `金钱 +${redEnvelope}，SAN +${sanRecovery}。`,
      moneyGain: redEnvelope,
      sanRecovery,
      socialChange: 0,
    })],
  };
}

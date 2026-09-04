import {
  appendMechanismSettlement,
  createFixedEvent,
  drawInclusiveInt,
  type FixedResolutionResult,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import { applyTierResist, formatTierResistedOutcome, getTierResistedNarrative } from "./v2-sanity-rules";
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
    description: appendMechanismSettlement(params.description, params.outcome),
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
      "回家少不了串门、饭局和亲戚问话，但至少不用每天盯着实验。",
      "这个寒假先好好休息，开学后再继续忙。",
    ].join("\n\n"),
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
      "回到家后，热饭热汤和父母的碎碎念，很快把实验和论文挤到了脑后。",
      "你决定先把这个年过完。",
    ].join("\n\n"),
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
    ? drawInclusiveInt(4, 6, getRoll)
    : drawInclusiveInt(1, 3, getRoll);
  const branch = drawInclusiveInt(1, 3, getRoll);

  if (branch === 1) {
    const socialResult = applyTierResist(1, state.player.social, getRoll);
    const socialChange = socialResult.effectiveChange;
    const socialText = formatTierResistedOutcome("社交", 1, socialResult);
    const socialNarrative = getTierResistedNarrative("社交", 1, socialResult);
    return {
      nextState: state,
      outcome: `金币 +${redEnvelope}，SAN +${sanRecovery}，${socialText}。`,
      enqueueEvents: [createWinterVacationResultEvent({
        year: state.year,
        month: state.month,
        description: createWinterVacationDescription([
          "在商场逛街时，你偶遇了高中同学。",
          "“好久不见！听说你在读研？”老同学热情地和你聊了起来。",
          "你们一起喝了杯咖啡，聊着各自的近况。虽然已经很久没见，但那种熟悉的感觉还在。",
          ...(socialNarrative ? [socialNarrative] : []),
        ].join("\n\n"), redEnvelope, state.selectedRoleId === "rich"),
        outcome: `金币 +${redEnvelope}，SAN +${sanRecovery}，${socialText}。`,
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
        outcome: `金币 +${doubledEnvelope}，SAN +${sanRecovery}。`,
        enqueueEvents: [createWinterVacationResultEvent({
          year: state.year,
          month: state.month,
          description: createWinterVacationDescription([
            "你带着恋人回家见父母。",
            "饭桌上，父母从学校生活问到平时怎么相处，聊着聊着又自然地问起以后有什么打算。",
            "你们一时不知道怎么回答，只好一起低头夹菜。长辈笑着把红包递过来，没有继续追问。",
            "回房间后，你们对着彼此刚才的窘样笑了很久。",
          ].join("\n\n"), doubledEnvelope, state.selectedRoleId === "rich"),
          outcome: `金币 +${doubledEnvelope}，SAN +${sanRecovery}。`,
          moneyGain: doubledEnvelope,
          sanRecovery,
          socialChange: 0,
        })],
      };
    }

    return {
      nextState: state,
      outcome: `金币 +${redEnvelope}，SAN +${sanRecovery}。`,
      enqueueEvents: [createWinterVacationResultEvent({
        year: state.year,
        month: state.month,
        description: createWinterVacationDescription([
          "年夜饭刚吃到一半，亲戚的话题就从学校转到了有没有对象。",
          "你用“最近都在做实验”挡了几轮，下一位长辈又接着问毕业以后准备去哪。",
          "好不容易等到话题换走，你赶紧低头吃菜，决定下次坐得离长辈远一点。",
        ].join("\n\n"), redEnvelope, state.selectedRoleId === "rich"),
        outcome: `金币 +${redEnvelope}，SAN +${sanRecovery}。`,
        moneyGain: redEnvelope,
        sanRecovery,
        socialChange: 0,
      })],
    };
  }

  return {
    nextState: state,
    outcome: `金币 +${redEnvelope}，SAN +${sanRecovery}。`,
    enqueueEvents: [createWinterVacationResultEvent({
      year: state.year,
      month: state.month,
      description: createWinterVacationDescription([
        "这个假期没有特别的安排，日子过得很慢。",
        "你睡到自然醒，陪父母看电视，也和老朋友断断续续聊了几次。",
        "返校前一晚，你收好行李，觉得这一阵休息已经够了。",
      ].join("\n\n"), redEnvelope, state.selectedRoleId === "rich"),
      outcome: `金币 +${redEnvelope}，SAN +${sanRecovery}。`,
      moneyGain: redEnvelope,
      sanRecovery,
      socialChange: 0,
    })],
  };
}

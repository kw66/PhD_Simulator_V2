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
    `这几天，你不再天天盯着进度，陪家里人吃饭散步。长辈给的红包共${moneyGain}金币${isRich ? "（家境殷实，红包格外丰厚！）" : ""}，你收好，留作日常开销。`,
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
      "这学期，你的作息几乎跟着实验和截止日期走，连周末睡个懒觉都惦记着进度。",
      "回家少不了串门和亲戚问话，不过眼下总算能歇一歇。你打算先把觉睡好，暂时不往假期里塞任务。",
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
      "放假通知发到群里时，你还在整理实验记录。合上电脑、拖着行李出校门，脑子里那份待办清单却没跟着放假。",
      "到家后，热饭热汤端上桌，家里人问你一路累不累。你把电脑包放到一边，决定先踏实吃顿饭。",
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
          "“最近在忙什么？”逛街时碰到高中同学，你们顺势聊起近况。你讲起实验室的日常，也听对方吐槽生活琐事，聊着聊着就找回了熟悉的感觉。",
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
            "你带恋人回家吃饭，父母问完学校生活，又聊起你们以后的打算。你们默契地低头夹菜，长辈笑着打住，还特意给你多包了一份红包。",
            "离开饭桌后，你们对视一眼，忍不住笑了。",
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
          "家里聚餐吃到一半，亲戚从课题问到对象，又问毕业后想去哪。你用“最近忙实验，还没想好”应付过去，趁话题转向别处赶紧夹菜：这顿饭比组会还考验临场发挥。",
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
        "这个假期，你没有安排远行。白天睡到自然醒，帮家里收拾屋子；晚上窝在沙发上看电视，偶尔回几条老朋友的消息。待办清单还在电脑里，至少这会儿不用盯着它。",
      ].join("\n\n"), redEnvelope, state.selectedRoleId === "rich"),
      outcome: `金币 +${redEnvelope}，SAN +${sanRecovery}。`,
      moneyGain: redEnvelope,
      sanRecovery,
      socialChange: 0,
    })],
  };
}

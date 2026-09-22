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
    `长辈给的红包共${moneyGain}金币${isRich ? "（家境殷实，红包格外丰厚！）" : ""}。你嘴上说着“都这么大了”，还是仔细收好；家里人又往碗里添了菜，催你趁热吃。`,
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
      "你点开手机里的闹钟，手指停在平日起床的时间上。真把它关掉，又怕一觉睡到中午，醒来先为没干活心虚。",
      "可电脑都一路背回来了，也不差今晚这一会儿。串门和亲戚问话留到明天应付，你想先睡个不用赶去实验室的觉。",
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
      "到家后，热饭热汤端上桌，家里人问你一路累不累。电脑包刚放下，筷子就递到了手里，碗里的菜很快堆出了一个小尖。",
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
          "逛街碰到高中同学，对方问你最近在忙什么。你刚讲到课题名称，就看见那张熟悉的脸露出迷茫，只好换成实验室的日常。聊到吃饭和作息，你们倒又像课间趴在走廊上那样有话说了。",
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
            "离开饭桌后，你们对视一眼，才发现刚才光顾着夹菜，谁都没吃几口。",
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
        "这个假期，你没安排远行。睡醒时家里人已经买菜回来，电视里放着你小时候看过的剧。你窝在沙发上剥橘子，明明知道下一句台词，还是跟着看了下去。",
      ].join("\n\n"), redEnvelope, state.selectedRoleId === "rich"),
      outcome: `金币 +${redEnvelope}，SAN +${sanRecovery}。`,
      moneyGain: redEnvelope,
      sanRecovery,
      socialChange: 0,
    })],
  };
}

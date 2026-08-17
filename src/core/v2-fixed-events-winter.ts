import {
  createFixedEvent,
  drawInclusiveInt,
  drawWeightedTriplet,
  type FixedResolutionResult,
  type RandomRollProvider,
} from "./v2-fixed-events-shared";
import { applyTierResist } from "./v2-sanity-rules";
import type { FixedEventResolution, GameState, PendingEvent } from "./v2-types";

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
    title: "寒假 ➜ 假期结束",
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
    description: "回家后，论文和实验终于离得远了一点。先休息几天。",
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
    description: "寒假到了。你拖着行李回家。",
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
        description: `休息几天，又和老同学聊了近况。收到 ${redEnvelope} 个红包。`,
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
          description: `陪恋人见了家里长辈，气氛比想象中轻松。共收到 ${doubledEnvelope} 个红包。`,
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
        description: `年夜饭又被问起婚恋。应付过去后，收到 ${redEnvelope} 个红包。`,
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
      description: `假期没什么插曲，你也难得放松下来。收到 ${redEnvelope} 个红包。`,
      outcome: `金钱 +${redEnvelope}，SAN +${sanRecovery}。`,
      moneyGain: redEnvelope,
      sanRecovery,
      socialChange: 0,
    })],
  };
}

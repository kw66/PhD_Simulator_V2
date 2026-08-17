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
    description: "难得回家过年，你决定先放下论文，好好休息几天。",
    preview: "让假期先帮你降速、重置状态",
    chainId: "winter-vacation",
    stage: "act2",
    choices: [
      {
        id: `winter-vacation-rest-y${state.year}-m${state.month}`,
        label: "好好休息",
        outcome: "你决定先把这次假期过完，再看它给你留下了什么。",
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
    description: "寒假到了。你拖着行李回家，暂时从论文和实验中抽身。",
    preview: "寒假到了，准备回家过年",
    chainId: "winter-vacation",
    choices: [
      {
        id: `winter-vacation-continue-y${state.year}-m${state.month}`,
        label: "继续",
        outcome: "你先把行李放好，开始认真规划这次寒假。",
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
        ? `你把假期过成了一次温和重启，还偶遇了老同学；接下来结算红包、SAN 恢复与社交 +${socialChange}。`
        : "你把假期过成了一次温和重启，还偶遇了老同学；接下来结算红包与 SAN 恢复。",
      enqueueEvents: [createWinterVacationResultEvent({
        year: state.year,
        month: state.month,
        description: `你休息了几天，又碰见老同学聊了聊近况。长辈们给了你 ${redEnvelope} 个红包。`,
        outcome: socialChange > 0
          ? `你收下红包，恢复了 ${sanRecovery} 点 SAN，社交 +${socialChange}。`
          : `你收下红包，恢复了 ${sanRecovery} 点 SAN。`,
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
        outcome: `你在家里陪恋人见了长辈；接下来结算双倍红包与 ${sanRecovery} 点 SAN 恢复。`,
        enqueueEvents: [createWinterVacationResultEvent({
          year: state.year,
          month: state.month,
          description: `你陪恋人见了家里长辈，气氛比想象中轻松。你们共收到 ${doubledEnvelope} 个红包。`,
          outcome: `你收下双倍红包，恢复了 ${sanRecovery} 点 SAN。`,
          moneyGain: doubledEnvelope,
          sanRecovery,
          socialChange: 0,
        })],
      };
    }

    return {
      nextState: state,
      outcome: `年夜饭上的催问没有改变真实结算；接下来只按基础口径结算红包与 ${sanRecovery} 点 SAN 恢复。`,
      enqueueEvents: [createWinterVacationResultEvent({
        year: state.year,
        month: state.month,
        description: `年夜饭上，长辈又问起恋爱和婚姻。应付过去后，你收到了 ${redEnvelope} 个红包。`,
        outcome: `你收下红包，恢复了 ${sanRecovery} 点 SAN。`,
        moneyGain: redEnvelope,
        sanRecovery,
        socialChange: 0,
      })],
    };
  }

  return {
    nextState: state,
    outcome: `这个寒假没有额外插曲；接下来结算红包与 ${sanRecovery} 点 SAN 恢复。`,
    enqueueEvents: [createWinterVacationResultEvent({
      year: state.year,
      month: state.month,
      description: `假期平静地过去，你终于放松下来，也收到了 ${redEnvelope} 个红包。`,
      outcome: `你收下红包，恢复了 ${sanRecovery} 点 SAN。`,
      moneyGain: redEnvelope,
      sanRecovery,
      socialChange: 0,
    })],
  };
}

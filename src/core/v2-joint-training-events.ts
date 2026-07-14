import type { ConferenceEncounterState, GameState, PendingEvent } from "./v2-types";

export interface JointTrainingContext {
  rejectedBigBullCoopCount: number;
  pendingCitationCapBonus: number;
}

export function buildJointTrainingContext(
  state: Pick<GameState, "conferenceEncounterState" | "totalCitations">,
): JointTrainingContext {
  return {
    rejectedBigBullCoopCount: state.conferenceEncounterState.rejectedBigBullCoopCount,
    pendingCitationCapBonus: Math.min(Math.floor(state.totalCitations / 500) * 2, 10),
  };
}

function createJointTrainingDeclineResult(context: JointTrainingContext): PendingEvent {
  const nextRejectCount = context.rejectedBigBullCoopCount + 1;
  const permanentlyBlocked = nextRejectCount >= 2;

  return {
    id: `joint-training-result-decline-${nextRejectCount}`,
    title: "联合培养 ➜ 暂不接受",
    description: permanentlyBlocked
      ? `你再次婉拒了这次联培机会。拒绝计数来到 ${nextRejectCount} / 2，旧版真实口径下这条联培线会被永久关闭。`
      : `你决定暂时不接这次联培。拒绝计数 +1，当前为 ${nextRejectCount} / 2；后续若再次把合作推进到位，仍可能再收到一次邀约。`,
    preview: "联合培养",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "joint-training",
    stage: "result",
    choices: [{
      id: "close",
      label: "继续",
      outcome: "你先把节奏留在当前主线上。",
      effects: {},
    }],
  };
}

function createJointTrainingAcceptResult(context: JointTrainingContext): PendingEvent {
  return {
    id: "joint-training-result-accept",
    title: "联合培养 ➜ 已确认",
    description: `你接受了这次联合培养。按旧版真实口径，本次会立刻带来：科研上限 +${context.pendingCitationCapBonus}（按当前总引用计算）、导师科研资源 +2、永久想 idea +5、永久做实验 +5。`,
    preview: "联合培养",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "joint-training",
    stage: "result",
    choices: [{
      id: "close",
      label: "继续",
      outcome: "你正式进入联培合作阶段。",
      effects: {},
    }],
  };
}

function createJointTrainingAct2(context: JointTrainingContext): PendingEvent {
  const nextRejectCount = context.rejectedBigBullCoopCount + 1;
  const permanentlyBlocked = nextRejectCount >= 2;

  return {
    id: "joint-training-act2",
    title: "联合培养 ➜ 联培抉择",
    description: "对方把合作推进到了更正式的层级：你可以借这条线拿到更强的学术回流，但也要接受它带来的持续绑定和额外负担。",
    preview: "联合培养",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "joint-training",
    stage: "act2",
    choices: [
      {
        id: "decline",
        label: "暂不接受",
        outcome: "你决定先把节奏留在当前课题上。",
        effects: {
          conferenceEncounterUpdates: {
            rejectedBigBullCoopCount: nextRejectCount,
            permanentlyBlockedBigBullCoop: permanentlyBlocked,
          } satisfies Partial<ConferenceEncounterState>,
          enqueueEvents: [createJointTrainingDeclineResult(context)],
        },
      },
      {
        id: "accept",
        label: "接受联培",
        outcome: "你决定接下这次联合培养。",
        effects: {
          conferenceEncounterUpdates: {
            bigBullCooperation: true,
          } satisfies Partial<ConferenceEncounterState>,
          jointTrainingStateUpdates: {
            citationBonusApplied: context.pendingCitationCapBonus,
          },
          researchCapacityStateDeltas: {
            jointTrainingCitationCapBonus: context.pendingCitationCapBonus,
          },
          advisorProgressStateDeltas: {
            researchResource: 2,
          },
          ideaBonus: 5,
          experimentBonus: 5,
          enqueueEvents: [createJointTrainingAcceptResult(context)],
        },
      },
    ],
  };
}

export function createJointTrainingAct1(context: JointTrainingContext): PendingEvent {
  return {
    id: "joint-training-act1",
    title: "联合培养邀约",
    description: "大牛把你们前几次会后的交流正式推进成了一次联合培养邀约。它不是一次轻量合作，而是会持续改写你后续学术节奏的深绑定选项。",
    preview: "联合培养",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "joint-training",
    stage: "act1",
    choices: [{
      id: "continue",
      label: "继续",
      outcome: "进入联培抉择。",
      effects: {
        enqueueEvents: [createJointTrainingAct2(context)],
      },
    }],
  };
}
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
      ? `你再次拒绝联培，合作线关闭（${nextRejectCount}/2）。`
      : `你决定先做完手头课题（${nextRejectCount}/2）。以后还有一次机会。`,
    preview: "联合培养",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "joint-training",
    stage: "result",
    choices: [{
      id: "close",
      label: "继续",
      outcome: "继续当前课题。",
      effects: {},
    }],
  };
}

function createJointTrainingAcceptResult(context: JointTrainingContext): PendingEvent {
  return {
    id: "joint-training-result-accept",
    title: "联合培养 ➜ 已确认",
    description: `你接受联合培养。科研上限 +${context.pendingCitationCapBonus}，导师资源 +2，永久想 idea +5、做实验 +5。`,
    preview: "联合培养",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "joint-training",
    stage: "result",
    choices: [{
      id: "close",
      label: "继续",
      outcome: "联合培养开始。",
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
    description: "换一个环境，会有更多资源，也会多出不少任务。接受吗？",
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
        outcome: permanentlyBlocked ? "合作线关闭。" : "以后还会收到一次邀请。",
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
        outcome: "接受联合培养。",
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
    description: "合作导师发来联合培养邀请。你有些期待，也担心打乱现有课题。",
    preview: "联合培养",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "joint-training",
    stage: "act1",
    choices: [{
      id: "continue",
      label: "继续",
      outcome: "查看联培条件。",
      effects: {
        enqueueEvents: [createJointTrainingAct2(context)],
      },
    }],
  };
}

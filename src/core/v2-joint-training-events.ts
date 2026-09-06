import { getJointTrainingCitationCapBonus } from "./v2-joint-training-system";
import type { ConferenceEncounterState, GameState, PendingEvent } from "./v2-types";

export interface JointTrainingContext {
  rejectedBigBullCoopCount: number;
  pendingCitationCapBonus: number;
  origin?: string;
}

export function buildJointTrainingContext(
  state: Pick<GameState, "conferenceEncounterState" | "totalCitations">,
): JointTrainingContext {
  return {
    rejectedBigBullCoopCount: state.conferenceEncounterState.rejectedBigBullCoopCount,
    pendingCitationCapBonus: getJointTrainingCitationCapBonus(state.totalCitations),
  };
}

function createJointTrainingDeclineResult(context: JointTrainingContext): PendingEvent {
  const nextRejectCount = context.rejectedBigBullCoopCount + 1;
  const permanentlyBlocked = nextRejectCount >= 2;

  return {
    id: `joint-training-result-decline-${nextRejectCount}`,
    title: "联合培养 ➜ 联培抉择 ➜ 暂不接受",
    description: permanentlyBlocked
      ? [
          "你又和导师确认了一遍，还是决定不参加联培。给对方回信时，你把原因讲清楚，也说明以后不再考虑这类安排。",
          "发完邮件，你回到自己的工位。没多出新的合作资源，手头的课题也不用为联培另做调整，多少松了口气。",
          "机制结算",
          `联培拒绝计数 +1（当前 ${nextRejectCount}/2）`,
          "达到 2 次后，联培机会永久关闭。",
        ].join("\n\n")
      : [
          "你和导师商量后，决定这次先不参加联培。邀请确实让人动心，只是你还想先把手头的课题做明白，不急着改安排。",
          "你在回复里谢过对方，把暂不接受的原因说清楚。这次合作先放下，以后若再有邀请，你仍可以重新考虑。",
          "机制结算",
          `联培拒绝计数 +1（当前 ${nextRejectCount}/2）`,
          "继续深入合作还有一次机会。",
        ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "joint-training",
    stage: "result",
    completionLog: permanentlyBlocked
      ? "你拒绝了联合培养，联培机会永久关闭。"
      : "你暂不接受联合培养，以后还有一次机会。",
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
    title: "联合培养 ➜ 联培抉择 ➜ 已确认",
    description: [
      "你回信确认了联培安排，也抄送给导师。原先要自己摸索的实验设置，现在有了可供参考的资料和讨论对象。",
      "你把合作笔记放进课题文件夹，准备先核清后续实验的设置。新的条件总算落实了，实验该重跑的还是得重跑。",
      "机制结算",
      `科研上限 +${context.pendingCitationCapBonus}`,
      "导师科研资源 +2",
      "永久：想 idea +5 分、做实验 +5 分",
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "joint-training",
    stage: "result",
    completionLog: `你接受了联合培养，科研上限 +${context.pendingCitationCapBonus}，导师科研资源 +2。`,
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
    description: [
      "你把方案拿去和导师商量：能用上对方的资源，也要让两边都清楚你在做什么。",
      "接受就按合作安排继续做；不接受，仍留在原组完成课题。",
      context.rejectedBigBullCoopCount === 0
        ? "若这次暂不接受，以后还有一次机会。"
        : "这已经是最后一次联培机会。",
    ].join("\n\n"),
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
    title: "联合培养",
    description: [
      `${context.origin ? `${context.origin}结束后` : "会后"}，之前一起讨论课题的那位学者发来联培邀请，也把方案抄送给了你的导师。`,
      "你点开附件，里面列了可共享的设备和课题资料。原先只是会后继续交流，现在对方想把合作长期做下去。",
    ].join("\n\n"),
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

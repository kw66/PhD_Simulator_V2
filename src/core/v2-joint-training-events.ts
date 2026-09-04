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
          "你和导师反复沟通后，决定暂时不加入联合培养，先把当前主线做扎实。",
          "眼前的课题和安排都不用改变，不过这次合作也就错过了。",
          "这是你第二次拒绝，以后不会再收到联培邀请。",
          "机制结算",
          `联培拒绝计数 +1（当前 ${nextRejectCount}/2）`,
          "达到 2 次后，联培机会永久关闭。",
        ].join("\n\n")
      : [
          "你和导师反复沟通后，决定暂时不加入联合培养，先把当前主线做扎实。",
          "眼前的课题和安排都不用改变，不过这次合作也就错过了。",
          "如果以后再次收到邀请，你还可以重新考虑。",
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
      "你正式加入联合培养，之后要同时参加两边的组会，也会接触新的课题和合作者。",
      "能用的资源更多了，对方对进度和成果的要求也更高。",
      "接下来一段时间，你的日程会排得更满。",
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
      "导师把联培方案发给你：课题和资源都不错，但两边都要汇报进度。",
      "接受以后会认识更多合作者，也会多出不少会议和任务。",
      "不接受的话，继续按现在的安排做自己的课题。",
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
      `${context.origin ? `离开${context.origin}后` : "会后"}，一位领域大牛向你和导师提出联合培养，语气不重，却把整个课题组的注意力都拉了过去。`,
      "对方愿意开放设备和课题资源，也要求你定期参加两边的组会。",
      "导师很重视这件事，让你先仔细看看联培条件。",
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

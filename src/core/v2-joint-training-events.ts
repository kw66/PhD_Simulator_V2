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
    title: "联合培养 ➜ 联培抉择 ➜ 暂不接受",
    description: permanentlyBlocked
      ? [
          "你和导师反复沟通后，决定暂时不加入联合培养，先把当前主线做扎实。",
          "这个决定让你的节奏保持可控，也意味着你主动放过了一个更高上限的加速通道。",
          "你没有把门彻底关死，但也清楚，下一次再出现同等窗口的概率不会太高。",
          "机制结算",
          `联培拒绝计数 +1（当前 ${nextRejectCount}/2）`,
          "达到 2 次后，联培机会永久关闭。",
        ].join("\n\n")
      : [
          "你和导师反复沟通后，决定暂时不加入联合培养，先把当前主线做扎实。",
          "这个决定让你的节奏保持可控，也意味着你主动放过了一个更高上限的加速通道。",
          "你没有把门彻底关死，但也清楚，下一次再出现同等窗口的概率不会太高。",
          "机制结算",
          `联培拒绝计数 +1（当前 ${nextRejectCount}/2）`,
          "继续深入合作还有一次机会。",
        ].join("\n\n"),
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
    title: "联合培养 ➜ 联培抉择 ➜ 已确认",
    description: [
      "你正式加入联合培养，课题、会议和协作对象的密度一下子上了一个台阶。",
      "资源确实更多了，但每一份资源背后都附带更高的交付预期和更低的容错空间。",
      "从这一刻起，你不再只是“按部就班完成学业”，而是在主动押注更高上限的科研路径。",
      "机制结算",
      `科研上限 +${context.pendingCitationCapBonus}`,
      "导师科研资源 +2",
      "永久：想 idea +5 分、做实验 +5 分",
    ].join("\n\n"),
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
    description: [
      "导师把联培方案推到你面前时，你第一眼看到的是资源，第二眼看到的却是责任。",
      "接下这条线，你会被放进更高强度的协作网络，接触到更稀缺的课题和人脉，同时也会被放在更亮的灯下，容错空间比现在小得多。",
      "不接则能维持当前节奏，路径更稳、压力更可预测，但你心里清楚，有些“上限窗口”一旦错过，很难再原样出现。",
      "你要决定的不是“是否努力”，而是“是否愿意把未来几年交给更陡的斜坡”。",
      context.rejectedBigBullCoopCount === 0
        ? "若这次暂不接受，以后还有一次机会。"
        : "这已经是最后一次联培机会。",
    ].join("\n\n"),
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
    title: "联合培养",
    description: [
      "会后，一位领域大牛向你和导师提出联合培养，语气不重，却把整个课题组的注意力都拉了过去。",
      "这意味着你可能进入更高层级的合作网络，拿到平时接触不到的资源和议题，但同时也要接受更密集的目标与评估。",
      "你能感到导师对这件事很重视，而你自己也明白，这不是“多一个机会”，而是“换一条更陡的轨道”。",
      "这会是一次典型的“上限与稳定”抉择。",
    ].join("\n\n"),
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

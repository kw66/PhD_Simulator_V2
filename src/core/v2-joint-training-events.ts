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
          "你和导师谈过，还是决定不参加联培。这次回信没有再写‘以后有机会’，而是认真谢过对方，说明今后也不考虑了。",
          "邮件发出，你把联培材料归进文件夹，打开原来的实验记录。屏幕上还是那几个没解决的问题，至少接下来该忙什么，已经定了。",
          "机制结算",
          `联培拒绝计数 +1（当前 ${nextRejectCount}/2）`,
          "达到 2 次后，联培机会永久关闭。",
        ].join("\n\n")
      : [
          "你和导师商量后，回信婉拒了这次联培。附件里的条件确实让人心动，只是手头的课题还没理顺，你想先把这一头做好。",
          "对方回了句‘以后有机会再聊’。你把邮件留在收件箱里，暂时不再往日历上添新安排。",
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
      "你回信确认了联培安排，也抄送给导师。对方发来课题资料和讨论时间，你翻出从前读过的那几篇论文——参考文献里的名字，如今进了邮件收件人一栏。",
      "你把合作笔记放进课题文件夹，准备先核清后续实验的设置。新的条件总算落实了，实验该重跑的还是得重跑。",
      "机制结算",
      `科研上限 +${context.pendingCitationCapBonus}`,
      "永久：想 idea +5 分、做实验 +5 分",
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "joint-training",
    stage: "result",
    completionLog: `你接受了联合培养，科研上限 +${context.pendingCitationCapBonus}。`,
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
      "你把方案拿去和导师商量，对方能提供的设备和研究支持让你圈出好几处。" + (context.pendingCitationCapBonus > 0
        ? "对方提到同行读过你的论文，还想让你试试几个更难的问题。你翻回自己的成果列表，头一回觉得那些引用不只是数字。"
        : "对方对你的工作还不太熟悉，打算先从眼前的课题合作起。你把一直缺条件验证的那套方案翻出来，准备再仔细讲讲。"),
      "兴奋过后，你又翻回合作安排，想到以后要和两边讨论进展，还是有点紧张。" + (context.rejectedBigBullCoopCount === 0
        ? "对方说不必急着答复，之后有合适的时间还可以再谈。"
        : "这份邀请已经为你留过一回，对方也要排下一轮计划，再推辞就不好一直让人等着了。"),
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
        outcome: `科研上限 +${context.pendingCitationCapBonus}；永久想 idea +5、做实验 +5。`,
        effects: {
          conferenceEncounterUpdates: {
            bigBullCooperation: true,
          } satisfies Partial<ConferenceEncounterState>,
          researchCapacityStateDeltas: {
            jointTrainingCitationCapBonus: context.pendingCitationCapBonus,
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
      "你点开附件，设备、课题和合作安排列了好几页。原以为会场上的‘以后多联系’是句客气话，对方连方案都写好了。",
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

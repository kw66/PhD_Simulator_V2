import { activateInternship, getInternshipMonthlyIncome, getPublishedAPaperCount } from "./v2-internship-system";
import type { ConferenceCareerState, GameState, PendingEvent } from "./v2-types";

export interface InternshipInviteContext {
  totalMonths: number;
  rejectedInternshipCount: number;
  currentMonthlyIncome: number;
  origin?: string;
}

export function buildInternshipInviteContext(
  state: Pick<GameState, "totalMonths" | "conferenceCareerState" | "papers" | "externalPublications" | "totalCitations">,
): InternshipInviteContext {
  return {
    totalMonths: state.totalMonths,
    rejectedInternshipCount: state.conferenceCareerState.rejectedInternshipCount,
    currentMonthlyIncome: getInternshipMonthlyIncome(getPublishedAPaperCount(state), state.totalCitations),
  };
}

function createInternshipDeclineResult(context: InternshipInviteContext): PendingEvent {
  const nextRejectCount = context.rejectedInternshipCount + 1;
  const permanentlyBlocked = nextRejectCount >= 2;
  const description = permanentlyBlocked
    ? [
        "你最终决定把重心留在当前课题上，先不接受这次实习邀请。",
        "你把回复写得很克制：感谢认可、说明阶段目标、保留未来合作可能。",
        "邮件发出去后，这次实习机会也就放下了。",
        "机制结算",
        `实习拒绝计数 +1（当前 ${nextRejectCount}/2）`,
        "达到 2 次后，实习机会永久关闭。",
      ].join("\n\n")
    : [
        "你最终决定把重心留在当前课题上，先不接受这次实习邀请。",
        "你把回复写得很克制：感谢认可、说明阶段目标、保留未来合作可能。",
        "邮件发出去后，这次实习机会也就放下了。",
        "机制结算",
        `实习拒绝计数 +1（当前 ${nextRejectCount}/2）`,
        "下次企业交流还有一次机会。",
      ].join("\n\n");

  return {
    id: `internship-invite-result-decline-${nextRejectCount}`,
    title: "实习邀请 ➜ 实习抉择 ➜ 暂不实习",
    description,
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "internship-invite",
    stage: "result",
    completionLog: permanentlyBlocked
      ? "你拒绝了实习，企业线永久关闭。"
      : "你暂不实习，以后还会收到一次邀请。",
    choices: [{
      id: "close",
      label: "继续",
      outcome: "继续科研。",
      effects: {},
    }],
  };
}

function createInternshipAcceptResult(context: InternshipInviteContext): PendingEvent {
  return {
    id: `internship-invite-result-accept-${context.totalMonths}`,
    title: "实习邀请 ➜ 实习抉择 ➜ 实习已确认",
    description: [
      "你签下了远程实习，接下来几个月要同时做课题和项目交付。",
      "白天开会写代码，晚上还得顾着实验和论文，肯定会比现在更累。",
      "不过这份实习能带来行业经验，也能多一笔收入。",
      "机制结算",
      "实习周期：6 个月",
      "实习期间：做实验分数 ×1.25",
      `每月收益：金币 +${context.currentMonthlyIncome}`,
      "每月压力：SAN -2",
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "internship-invite",
    stage: "result",
    completionLog: `你接受了 6 个月远程实习，每月金币 +${context.currentMonthlyIncome}、SAN -2。`,
    choices: [{
      id: "close",
      label: "继续",
      outcome: "实习开始。",
      effects: {},
    }],
  };
}

function createInternshipInviteAct2(context: InternshipInviteContext): PendingEvent {
  const warningText = context.rejectedInternshipCount === 0
    ? "拒绝后还有一次机会。"
    : "再次拒绝将关闭企业线。";
  const nextRejectCount = context.rejectedInternshipCount + 1;
  const permanentlyBlocked = nextRejectCount >= 2;

  return {
    id: `internship-invite-act2-${context.totalMonths}`,
    title: "实习邀请 ➜ 实习抉择",
    description: [
      "你把邀请邮件又读了一遍：项目方向合适，周期和报酬也写得很清楚。",
      "接下以后，实验、组会、论文和实习交付都得同时做。",
      "不接可以继续专心科研，不过企业给你的机会次数有限。",
      warningText,
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "internship-invite",
    stage: "act2",
    choices: [
      {
        id: "decline",
        label: "先不去实习",
        outcome: permanentlyBlocked ? "企业线关闭。" : "以后还会收到一次邀请。",
        effects: {
          conferenceCareerUpdates: {
            rejectedInternshipCount: nextRejectCount,
            permanentlyBlockedInternship: permanentlyBlocked,
          } satisfies Partial<ConferenceCareerState>,
          enqueueEvents: [createInternshipDeclineResult(context)],
        },
      },
      {
        id: "accept",
        label: "接受这份实习",
        outcome: "接受 6 个月远程实习。",
        effects: {
          internshipStateUpdates: activateInternship(),
          enqueueEvents: [createInternshipAcceptResult(context)],
        },
      },
    ],
  };
}

export function createInternshipInviteAct1(context: InternshipInviteContext): PendingEvent {
  return {
    id: `internship-invite-act1-${context.totalMonths}`,
    title: "实习邀请",
    description: [
      `${context.origin ? `离开${context.origin}后` : "会后"}，你收到一封远程实习邀请，对方给出的方向和你现在的研究并不冲突，甚至有一定互补。`,
      "对方希望你尽快回复，入职后每周都有固定的项目任务。",
      "这份机会能让你提前接触工业研发，也会挤掉不少做科研的时间。",
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "internship-invite",
    stage: "act1",
    choices: [{
      id: "continue",
      label: "继续",
      outcome: "查看实习条件。",
      effects: {
        enqueueEvents: [createInternshipInviteAct2(context)],
      },
    }],
  };
}

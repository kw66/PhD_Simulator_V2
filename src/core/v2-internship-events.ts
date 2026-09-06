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
        "你再次婉拒了实习邀请，说明目前还是顾不过来。回复写到最后，你删掉了‘下次一定’，免得又给对方一个含糊的答复。",
        "这回你也把话说清楚了，之后不再考虑这类实习。关掉邮件时有点可惜，不过桌上没整理完的实验记录还等着你。",
        "机制结算",
        `实习拒绝计数 +1（当前 ${nextRejectCount}/2）`,
        "达到 2 次后，实习机会永久关闭。",
      ].join("\n\n")
    : [
        "你回复说，手头的课题暂时腾不出空来，这次先不接受实习。写到‘以后有机会再聊’时，你还是停了一下，毕竟这份邀请确实合适。",
        "邮件发出后，你关掉附件，回去整理实验记录。眼下不必兼顾项目交付，但这份实习收入也只能先放下。",
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
      ? "你再次拒绝了实习，之后不再收到实习邀请。"
      : "你暂不实习，之后仍有一次接受邀请的机会。",
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
      "你确认了远程实习安排，把每周交付记进日历。报酬会随论文和引用情况调整，你又核对了一遍邮件里按目前情况列出的金额。",
      "课题还得继续，项目也要交差。你把两边的待办放到一起，才发现最难安排的不是工作地点，而是晚上几点能合上电脑。",
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
    ? "这次不接，以后仍有一次机会。"
    : "若再次婉拒，之后就不再考虑实习了。";
  const nextRejectCount = context.rejectedInternshipCount + 1;
  const permanentlyBlocked = nextRejectCount >= 2;

  return {
    id: `internship-invite-act2-${context.totalMonths}`,
    title: "实习邀请 ➜ 实习抉择",
    description: [
      "你对照实验计划核了一遍实习安排，项目交付和组会都不能落下，接了就得挤出时间。",
      "远程不用搬家，但也不是挂着聊天软件就能领钱。你得想清楚，眼下有没有余力兼顾。",
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
      `${context.origin ? `${context.origin}结束后` : "会后"}，你收到企业代表发来的远程实习邀请。附件里列着项目任务，正好用得上你现在做课题的方法。`,
      "你往下翻，报酬和工作安排都写得挺具体。对方希望你尽快答复，你先保存了附件，准备看看能不能和手头的课题兼顾。",
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

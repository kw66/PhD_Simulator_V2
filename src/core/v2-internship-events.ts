import { activateInternship, getInternshipMonthlyIncome, getPublishedAPaperCount } from "./v2-internship-system";
import type { ConferenceCareerState, GameState, PendingEvent } from "./v2-types";

export interface InternshipInviteContext {
  totalMonths: number;
  rejectedInternshipCount: number;
  currentMonthlyIncome: number;
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
    ? `你再次拒绝实习，企业线关闭（${nextRejectCount}/2）。`
    : `你还是想先把论文做完（${nextRejectCount}/2）。以后还有一次机会。`;

  return {
    id: `internship-invite-result-decline-${nextRejectCount}`,
    title: "实习邀请 ➜ 暂不实习",
    description,
    preview: "实习邀请",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "internship-invite",
    stage: "result",
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
    title: "实习邀请 ➜ 实习已确认",
    description: `你接下 6 个月远程实习。实验 ×1.25，每月金钱 +${context.currentMonthlyIncome}、SAN -2；收入随 A 类论文与引用变化。`,
    preview: "实习邀请",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "internship-invite",
    stage: "result",
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
    description: `实习能补贴生活，也会挤占科研时间。${warningText}`,
    preview: "实习邀请",
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
          internshipStateUpdates: activateInternship(context.totalMonths),
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
    description: "会后，一家相关企业发来远程实习邀请。你有些心动，也担心时间不够用。",
    preview: "实习邀请",
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

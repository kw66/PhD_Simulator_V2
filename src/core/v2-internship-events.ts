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
    ? `你再次拒绝实习邀请，这条企业线已关闭（${nextRejectCount}/2）。`
    : `你暂时拒绝实习邀请（${nextRejectCount}/2），以后仍可能再收到一次。`;

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
      outcome: "你决定继续当前的学术节奏。",
      effects: {},
    }],
  };
}

function createInternshipAcceptResult(context: InternshipInviteContext): PendingEvent {
  return {
    id: `internship-invite-result-accept-${context.totalMonths}`,
    title: "实习邀请 ➜ 实习已确认",
    description: `你接受了 6 个月远程实习：实验分 ×1.25，每月金钱 +${context.currentMonthlyIncome}、SAN -2。收益会随 A 类论文与引用变化。`,
    preview: "实习邀请",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "internship-invite",
    stage: "result",
    choices: [{
      id: "close",
      label: "继续",
      outcome: "你开始进入实习期。",
      effects: {},
    }],
  };
}

function createInternshipInviteAct2(context: InternshipInviteContext): PendingEvent {
  const warningText = context.rejectedInternshipCount === 0
    ? "如果这次不接，窗口未必立刻关上，但下一次同级别机会通常不会来得这么准时。"
    : "这已经是你手里最后一张企业线入场券。";
  const nextRejectCount = context.rejectedInternshipCount + 1;
  const permanentlyBlocked = nextRejectCount >= 2;

  return {
    id: `internship-invite-act2-${context.totalMonths}`,
    title: "实习邀请 ➜ 实习抉择",
    description: `远程实习能带来收入和产业经验，也会持续消耗时间与精力。${warningText}`,
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
        outcome: "你决定暂时把重心留在学术线上。",
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
        outcome: "你决定接下这份远程实习。",
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
    description: "会后，你收到一份与研究方向相关的远程实习邀请。",
    preview: "实习邀请",
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "internship-invite",
    stage: "act1",
    choices: [{
      id: "continue",
      label: "继续",
      outcome: "进入实习抉择。",
      effects: {
        enqueueEvents: [createInternshipInviteAct2(context)],
      },
    }],
  };
}

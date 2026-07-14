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
    ? `你最终还是把这次机会放回了邮箱深处。实习拒绝计数来到 ${nextRejectCount} / 2，这条企业线按旧版真实口径已永久关闭。`
    : `你决定先把节奏稳在学术线上。实习拒绝计数 +1，当前为 ${nextRejectCount} / 2；后续若再次通过企业交流接触产业线，仍可能再收到一次邀请。`;

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
    description: `你接受了这份远程实习。已确认口径：实习周期 6 个月；实习激活后做实验分数 ×1.25；按当前状态估算，月收益为金钱 +${context.currentMonthlyIncome}；旧版真实运行口径为每月 SAN -2，收益会随 A 类发表数与总引用实时变化。`,
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
    description: `你又把邀请邮件完整读了一遍：工业研发流程、交付压力和短期资源回流都写得很清楚。${warningText}`,
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
    description: "会后你收到一封远程实习邀请。对方给出的方向和你现在的研究并不冲突，甚至有一定互补；真正的问题在于，你必须立刻决定是否把接下来几个月的缓冲时间压缩掉。",
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
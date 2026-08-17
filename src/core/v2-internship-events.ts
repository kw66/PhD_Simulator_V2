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
    ? [
        "你最终决定把重心留在当前课题上，先不接受这次实习邀请。",
        "你把回复写得很克制：感谢认可、说明阶段目标、保留未来合作可能。",
        "短期看你保住了可控节奏，但你也明白，这等于主动放弃了一次提前进入产业线的窗口。",
        "机制结算",
        `实习拒绝计数 +1（当前 ${nextRejectCount}/2）`,
        "达到 2 次后，实习机会永久关闭。",
      ].join("\n\n")
    : [
        "你最终决定把重心留在当前课题上，先不接受这次实习邀请。",
        "你把回复写得很克制：感谢认可、说明阶段目标、保留未来合作可能。",
        "短期看你保住了可控节奏，但你也明白，这等于主动放弃了一次提前进入产业线的窗口。",
        "机制结算",
        `实习拒绝计数 +1（当前 ${nextRejectCount}/2）`,
        "下次企业交流还有一次机会。",
      ].join("\n\n");

  return {
    id: `internship-invite-result-decline-${nextRejectCount}`,
    title: "实习邀请 ➜ 实习抉择 ➜ 暂不实习",
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
    title: "实习邀请 ➜ 实习抉择 ➜ 实习已确认",
    description: [
      "你签下了远程实习，接下来几个月会进入“白天课题、晚上交付”的并行状态。",
      "这不是一次短期尝鲜，而是对时间管理、执行稳定性和抗压能力的持续考验。",
      "你知道自己会更累，但也清楚这条线能给你带来真实的行业经验和资源回流。",
      "机制结算",
      "实习周期：6 个月",
      "实习期间：做实验分数 ×1.25",
      `每月收益：金币 +${context.currentMonthlyIncome}`,
      "每月压力：SAN -2",
    ].join("\n\n"),
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
    description: [
      "你把邀请邮件又读了一遍：项目方向很硬，周期明确，回报也不低，但每一行都在暗示同一件事——你接下来几个月会更累。",
      "接下实习，意味着你能更早摸到工业研发的真实节奏，也能缓解一点经济压力；可实验、组会、论文和交付并行后，任何一个环节失控都会连锁反应。",
      "不接则能把重心稳稳压在学术线上，节奏更可控、容错更高，但你也明白，很多机会从来不是“错过一次，下次还有”。",
      "你不是在选“好坏”，而是在选“哪一种忙碌更值得”。",
      warningText,
    ].join("\n\n"),
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
    description: [
      "会后你收到一封远程实习邀请，对方给出的方向和你现在的研究并不冲突，甚至有一定互补。",
      "邮件里的项目节奏写得很清楚：回报真实、要求也真实，意味着你很难再用“有空再说”来拖延决定。",
      "这份机会能让你提前接触工业研发流程，也会实打实压缩你在学术线上的缓冲时间。",
      "你需要在“长期学术节奏”和“短期机会窗口”之间，尽快给出一个明确答案。",
    ].join("\n\n"),
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

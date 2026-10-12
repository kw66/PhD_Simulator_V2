import { activateInternship, createInternshipLead, createInternshipOffer, getInternshipMonthlyIncome, getPublishedAPaperCount, hasOngoingInternship, type InternshipLead } from "./v2-internship-system";
import type { ConferenceCareerState, GameState, InternshipOffer, PendingEvent } from "./v2-types";

type InternshipInviteState = Pick<GameState, "totalMonths" | "conferenceCareerState" | "internshipState" | "papers" | "externalPublications">;

export interface InternshipInviteContext {
  offer: InternshipOffer;
  lead?: InternshipLead;
  totalMonths: number;
  rejectedInternshipCount: number;
  currentMonthlyIncome: number;
  publishedAPaperCount?: number;
  unavailable: boolean;
  origin?: string;
}

const PENDING_OFFER: InternshipOffer = {
  id: "pending", company: "企业", position: "大模型相关岗位", baseMonthlyIncome: 1,
  monthlySanCost: 5, experimentBonus: 5,
};

export function buildInternshipInviteContext(
  state: InternshipInviteState,
  _getRoll: () => number = Math.random,
): InternshipInviteContext {
  return refreshInternshipInviteContext(state, {
    offer: PENDING_OFFER,
    totalMonths: state.totalMonths,
    rejectedInternshipCount: 0,
    currentMonthlyIncome: 0,
    unavailable: false,
  });
}

export function refreshInternshipInviteContext(state: InternshipInviteState, context: InternshipInviteContext): InternshipInviteContext {
  const publishedAPaperCount = getPublishedAPaperCount(state);
  return {
    ...context,
    rejectedInternshipCount: state.conferenceCareerState.rejectedInternshipCount,
    currentMonthlyIncome: getInternshipMonthlyIncome(publishedAPaperCount, context.offer.baseMonthlyIncome),
    publishedAPaperCount,
    unavailable: hasOngoingInternship(state),
  };
}

function createInternshipDeclineResult(context: InternshipInviteContext): PendingEvent {
  const nextRejectCount = context.rejectedInternshipCount + 1;
  const result = "结果：婉拒实习";
  const description = [
        `${context.offer.company}后来发来了${context.offer.position}的具体安排。你看完仍觉得眼下无法兼顾，于是给联系人发出📩回信，感谢他们认真考虑你的研究经历。`,
        "对方表示理解，也说以后还有机会。你收好联系人，回到没分析完的实验记录前；刚才犹豫的那几分钟，倒帮你想清了手头最该先做什么。",
        "机制结算",
        result,
      ].join("\n\n");

  return {
    id: `internship-invite-result-decline-${nextRejectCount}`,
    title: "实习邀请 ➜ 实习抉择 ➜ 婉拒实习",
    description,
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "internship-invite",
    stage: "result",
    internshipInvitePreview: { context, decision: "decline" },
    completionLog: "你婉拒了本次实习，以后仍可收到邀请。",
    choices: [{
      id: "close",
      label: "确定",
      outcome: "婉拒实习",
      effects: {
        conferenceCareerUpdates: {
          rejectedInternshipCount: nextRejectCount,
          permanentlyBlockedInternship: false,
          ...(context.offer.id !== "pending" ? { lastInternshipOffer: context.offer } : {}),
        } satisfies Partial<ConferenceCareerState>,
      },
    }],
  };
}

function createInternshipAcceptResult(context: InternshipInviteContext): PendingEvent {
  if (context.unavailable) {
    const outcome = "已有实习安排，本次不新增、不延期，原实习保持不变。";
    return {
      id: `internship-invite-result-accept-${context.totalMonths}`,
      title: "实习邀请 ➜ 实习抉择 ➜ 实习安排未变更",
      description: [
        `你核对📅日程后发现，现有实习已经占满了能腾出的时间。你向${context.offer.company}说明近况，原实习照常进行。`,
        "两份安排没法同时答应，你先把已经接下的工作做好。",
        "机制结算",
        "结果：原实习保持不变",
      ].join("\n\n"),
      source: "fixed",
      blocking: true,
      deadlineMonths: 0,
      chainId: "internship-invite",
      stage: "result",
      internshipInvitePreview: { context, decision: "accept" },
      completionLog: outcome,
      choices: [{ id: "close", label: "确定", outcome: "原实习保持不变", effects: {} }],
    };
  }
  const teamInterest = [
    "团队认可你的想法，但基础待遇比较谨慎",
    "团队希望你参与正在推进的方向",
    "团队很看重你已有的研究，基础待遇也更积极",
  ][context.offer.baseMonthlyIncome] ?? "团队希望你参与正在推进的方向";
  const teamResources = [
    "工作偏业务交付，能共享一些实验资源",
    "团队能开放部分算力和数据",
    "方向与你的课题贴近，算力和数据也更充足",
  ][context.offer.experimentBonus - 4] ?? "团队能开放部分算力和数据";
  return {
    id: `internship-invite-result-accept-${context.totalMonths}`,
    title: "实习邀请 ➜ 实习抉择 ➜ 实习已确认",
    description: [
      `和${context.offer.company}的团队聊过后，具体岗位定为${context.offer.position}。负责人介绍了手头的项目，${teamInterest}；${teamResources}。你听到熟悉的模型名字，也发现交付要求比论文里一句话复杂得多。`,
      "你把六个月的实习和组会排在同一张📅日历上，特意空出改论文的晚上。新团队发来第一份任务说明，你读到一半就开始记问题：这些不同的数据和交付要求，得从头摸清。",
      "机制结算",
      "结果：企业实习（6个月）",
      `结果：每月SAN -${context.offer.monthlySanCost}｜每月金币 +${context.currentMonthlyIncome}`,
      `结果：实验 ×1.25、+${context.offer.experimentBonus}`,
      "结果：实验费用 -2",
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "internship-invite",
    stage: "result",
    internshipInvitePreview: { context, decision: "accept" },
    completionLog: `你接受了${context.offer.company}的${context.offer.position}岗位实习，持续6个月，每月金币 +${context.currentMonthlyIncome}、SAN -${context.offer.monthlySanCost}，每次实验 +${context.offer.experimentBonus}、×1.25，实验费用 -2。`,
    choices: [{
      id: "close",
      label: "确定",
      outcome: "实习开始。",
      effects: {
        internshipStateUpdates: activateInternship(context.offer),
        conferenceCareerUpdates: { hasInternshipExperience: true, lastInternshipOffer: context.offer },
      },
    }],
  };
}

function createInternshipInviteAct2(context: InternshipInviteContext): PendingEvent {
  const warningText = "这次不接，以后仍可收到实习邀请。";
  const company = context.lead?.company ?? context.offer.company;
  const direction = context.lead?.direction ?? "大模型研究";

  return {
    id: `internship-invite-act2-${context.totalMonths}`,
    title: "实习邀请 ➜ 实习抉择",
    description: [
      `联系你的是${company}的${direction}团队。对方看过你${(context.publishedAPaperCount ?? 0) > 0 ? "的一作 A 类论文" : "在会上的展示"}，觉得有些方法或许能用在他们的项目里；目前谈的只是方向，具体负责哪部分、待遇和工作节奏还要继续聊。`,
      `你顺手查了他们公开的工作，又在📅日历上对照组会、实验和项目交付。${context.unavailable ? "已有实习安排，没法再接第二份。" : "想试试真实业务，也舍不得让课题停摆；六个月能不能两边兼顾，你还得认真掂量。"}${warningText}`,
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "internship-invite",
    stage: "act2",
    internshipInvitePreview: { context },
    choices: [
      {
        id: "decline",
        label: "婉拒实习",
        outcome: "婉拒实习",
        effects: {
          enqueueEvents: [createInternshipDeclineResult(context)],
        },
      },
      {
        id: "accept",
        label: "接受实习",
        outcome: `企业实习（6个月）｜${company} · ${direction}｜具体岗位和待遇待沟通`,
        ...(context.unavailable ? { disabledReason: "已有实习安排，本次不新增、不延期。" } : {}),
        effects: {
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
      `📩${context.origin ? `${context.origin}结束后` : "会后"}，有企业联系人问你愿不愿意聊聊大模型相关的实习。对方记得你介绍过的方法，说他们正在找能把研究想法用进项目的人。你又翻了翻自己的展示稿，没想到当时讲得最仓促的那页也有人记住。`,
      "邮件没有催你立刻答复。你看着桌上还没跑完的实验，先把简历和一段工作介绍找出来：机会有点突然，至少值得听听他们想做什么。",
      "小提示：出现条件：企业交流≥2次（含本次），有A会论文或实习经历（含远程），且暂无实习安排。",
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "internship-invite",
    stage: "act1",
    internshipInvitePreview: { context },
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

export function revealInternshipInviteResult(event: PendingEvent, getRoll: () => number = Math.random): PendingEvent {
  const preview = event.internshipInvitePreview;
  if (event.stage !== "result" || !preview?.decision || preview.context.offer.id !== "pending") return event;
  const offer = createInternshipOffer(getRoll, preview.context.lead);
  const context = {
    ...preview.context,
    offer,
    currentMonthlyIncome: getInternshipMonthlyIncome(preview.context.publishedAPaperCount ?? 0, offer.baseMonthlyIncome),
  };
  return preview.decision === "accept" ? createInternshipAcceptResult(context) : createInternshipDeclineResult(context);
}

export function revealInternshipInviteLead(event: PendingEvent, getRoll: () => number = Math.random): PendingEvent {
  const preview = event.internshipInvitePreview;
  if (event.stage !== "act2" || !preview || preview.context.lead) return event;
  const lead = createInternshipLead(getRoll);
  return createInternshipInviteAct2({
    ...preview.context,
    lead,
    offer: { ...preview.context.offer, company: lead.company },
  });
}

export function refreshInternshipInviteEvent<Event extends PendingEvent>(state: InternshipInviteState, event: Event): Event {
  const preview = event.internshipInvitePreview;
  if (!preview) return event;
  const context = refreshInternshipInviteContext(state, preview.context);
  const fresh = preview.decision === "accept" ? createInternshipAcceptResult(context)
    : preview.decision === "decline" ? createInternshipDeclineResult(context)
      : event.stage === "act2" ? createInternshipInviteAct2(context) : createInternshipInviteAct1(context);
  const merge = (current: PendingEvent, rebuilt: PendingEvent): PendingEvent => ({
    ...current,
    title: rebuilt.title,
    description: rebuilt.description,
    completionLog: rebuilt.completionLog,
    deferredStatePatch: undefined,
    internshipInvitePreview: rebuilt.internshipInvitePreview,
    choices: rebuilt.choices.map((choice) => {
      const previous = current.choices.find((entry) => entry.id === choice.id);
      return {
        ...choice,
        effects: {
          ...choice.effects,
          ...(choice.effects.enqueueEvents ? {
            enqueueEvents: choice.effects.enqueueEvents.map((next, index) => {
              const old = previous?.effects.enqueueEvents?.[index];
              return old?.internshipInvitePreview ? merge(old, next) : next;
            }),
          } : {}),
        },
      };
    }),
  });
  return merge(event, fresh) as Event;
}

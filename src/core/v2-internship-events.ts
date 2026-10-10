import { activateInternship, createInternshipOffer, getInternshipMonthlyIncome, getPublishedAPaperCount, hasOngoingInternship } from "./v2-internship-system";
import type { ConferenceCareerState, GameState, InternshipOffer, PendingEvent } from "./v2-types";

type InternshipInviteState = Pick<GameState, "totalMonths" | "conferenceCareerState" | "internshipState" | "papers" | "externalPublications">;

export interface InternshipInviteContext {
  offer: InternshipOffer;
  totalMonths: number;
  rejectedInternshipCount: number;
  currentMonthlyIncome: number;
  publishedAPaperCount?: number;
  unavailable: boolean;
  origin?: string;
}

export function buildInternshipInviteContext(
  state: InternshipInviteState,
  getRoll: () => number = Math.random,
): InternshipInviteContext {
  return refreshInternshipInviteContext(state, {
    offer: createInternshipOffer(getRoll),
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
  const result = "结果：暂不实习";
  const description = [
        "你把课题安排说明白，婉拒了这次实习。发送前又看了眼报酬那一栏，才把鼠标移回发送键。",
        "对方表示以后还可以联系。你关掉附件，继续整理实验记录，今晚的待办总算没有再多一份。",
        "机制结算",
        result,
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
    internshipInvitePreview: { context, decision: "decline" },
    completionLog: "你婉拒了本次实习，以后仍可收到邀请。",
    choices: [{
      id: "close",
      label: "确定",
      outcome: "继续科研。",
      effects: {
        conferenceCareerUpdates: {
          rejectedInternshipCount: nextRejectCount,
          permanentlyBlockedInternship: false,
          lastInternshipOffer: context.offer,
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
      description: `确认前，你核对了现有实习安排，暂时放下这份邀请。\n\n机制结算\n${outcome}`,
      source: "fixed",
      blocking: true,
      deadlineMonths: 0,
      chainId: "internship-invite",
      stage: "result",
      internshipInvitePreview: { context, decision: "accept" },
      completionLog: outcome,
      choices: [{ id: "close", label: "确定", outcome, effects: {} }],
    };
  }
  return {
    id: `internship-invite-result-accept-${context.totalMonths}`,
    title: "实习邀请 ➜ 实习抉择 ➜ 实习已确认",
    description: [
      "你确认了实习安排，把每周交付记进日历。公司的工作群很快发来欢迎消息，你刚回完“请多指教”，就收到了第一份任务文档。",
      "课题还得继续，项目也要交差。你把两边的待办放到一起，才发现最难排的不是哪天去公司，而是晚上几点能合上电脑。",
      "机制结算",
      `结果：${context.offer.company} · ${context.offer.position}（持续6个月）`,
      `结果：SAN -${context.offer.monthlySanCost}（每月）`,
      `结果：金币 +${context.currentMonthlyIncome}（每月）`,
      `结果：实验 +${context.offer.experimentBonus}（每次）`,
      "结果：实验 ×1.25（每次）",
      "结果：实验费用 -2（每次）",
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

  return {
    id: `internship-invite-act2-${context.totalMonths}`,
    title: "实习邀请 ➜ 实习抉择",
    description: [
      `${context.offer.company}邀请你担任${context.offer.position}。${(context.publishedAPaperCount ?? 0) > 0 ? "对方看过你的一作 A 类论文" : "对方看过你在会上的展示"}，为六个月的实习开出每月 ${context.currentMonthlyIncome} 金币。熟悉的方法真用到公司业务里又是另一回事，你有点跃跃欲试。`,
      `${context.offer.baseMonthlyIncome === 0 ? "这家初创公司的基础待遇不算丰厚" : context.offer.baseMonthlyIncome === 1 ? "这份算法岗位的基础待遇中规中矩" : "大公司的研究岗位给出了较优厚的基础待遇"}，对方也愿意根据你之后发表的论文重新谈报酬。${context.offer.monthlySanCost === 6 ? "项目交付排得很紧，连晚上的时间也未必保得住" : context.offer.monthlySanCost === 4 ? "项目节奏相对从容，但每周的交付还是要挤占课余时间" : "项目交付稳定，两边的进度都得按时跟上"}；${context.offer.experimentBonus === 6 ? "好在那边的设备和数据很齐全，能帮你推进不少实验" : context.offer.experimentBonus === 4 ? "那边也能开放一些实验资源，课题多少能跟着受益" : "公司的实验资源比组里宽裕，正好能补上课题需要的条件"}。`,
      "再看组会日期，你又有些心虚。实习每周都要交付，课题这边也停不下来。" + (context.unavailable
        ? "可先前的安排还摆在那里，这回实在接不下来。"
        : "你在日历上找了又找，想挪出几个完整的晚上。") + warningText,
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
        label: "先不去实习",
        outcome: "暂不实习，以后仍可收到邀请。",
        effects: {
          enqueueEvents: [createInternshipDeclineResult(context)],
        },
      },
      {
        id: "accept",
        label: "接受这份实习",
        outcome: `企业实习（持续6个月）｜SAN -${context.offer.monthlySanCost}（每月）｜金币 +${context.currentMonthlyIncome}（每月）｜实验 +${context.offer.experimentBonus}（每次）｜实验 ×1.25（每次）｜实验费用 -2（每次）`,
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
      `${context.origin ? `${context.origin}结束后` : "会后"}，你收到${context.offer.company}发来的${context.offer.position}实习邀请。附件里列着项目任务，正好用得上你现在做课题的方法。`,
      "你往下翻到报酬那一栏，停了几秒，又往上翻回工作要求。对方希望尽快答复，邮件末尾还附了联系人和入职流程。",
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

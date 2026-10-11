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
  const result = "结果：婉拒实习";
  const description = [
        `你给${context.offer.company}写了封回信，📩认真谢过对方对你的认可，也说明了眼下的课题进度。删掉“我应该能挤出时间”那句话时，你还有些舍不得；可与其接下来再反复解释延期，不如现在就把无法兼顾的事说清楚。`,
        "对方回复理解，表示以后有合适的机会还可以联系。你把岗位说明和联系人一起存好，报酬那一栏仍让人心动，但今晚终于不用再拿组会和项目交付互相挪时间。你重新打开那份还没分析完的实验记录，决定先把手头的问题做扎实。",
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
      description: [
        `📅确认前，你重新核对日程，发现现有实习已经占住了能腾出的时间。${context.offer.company}的岗位确实有吸引力，但把两份安排叠在一起，最先被挤掉的恐怕就是自己的课题。`,
        "你给联系人解释了目前的安排，收好这份邀请，没有再许下一个难以兑现的到岗日期。原实习的任务文档还开着，你把视线移回那张进度表，先把已经答应的事做好。",
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
  return {
    id: `internship-invite-result-accept-${context.totalMonths}`,
    title: "实习邀请 ➜ 实习抉择 ➜ 实习已确认",
    description: [
      `你确认了${context.offer.company}的${context.offer.position}岗位，💼把六个月的实习安排记进日历。联系人发来入职材料和项目文档，你先把需要准备的东西列成清单，又在组会那天画了一道线，提醒自己别把两边都答应得太满。`,
      "公司的工作群很快弹出欢迎消息。你回了句“请多指教”，点开第一份任务说明，发现熟悉的方法要面对不同的数据和交付要求。能接触真实业务、用上更齐全的实验条件，正是你想来试试的原因；只是论文里一句带过的细节，在这里都得落实。",
      "晚上，你把课题和实习的待办并排放在桌上。报酬能让生活宽裕一些，项目经验也值得期待，但白天没做完的事不会自己消失。你给明天留下一个明确的小目标，先把环境跑通，再一点点找两边都能持续推进的节奏。",
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

  return {
    id: `internship-invite-act2-${context.totalMonths}`,
    title: "实习邀请 ➜ 实习抉择",
    description: [
      `💼你把${context.offer.company}的${context.offer.position}岗位说明摊在实验记录旁。${(context.publishedAPaperCount ?? 0) > 0 ? "对方看过你的一作 A 类论文" : "对方看过你在会上的展示"}，为六个月的实习开出每月 ${context.currentMonthlyIncome} 金币。比起只看报酬，你更想知道自己的方法在真实业务里能不能站住脚，于是把项目要解决的问题逐条圈了出来。`,
      `💰${context.offer.baseMonthlyIncome === 0 ? "这家初创公司的基础待遇不算丰厚" : context.offer.baseMonthlyIncome === 1 ? "这份算法岗位的基础待遇中规中矩" : "大公司的研究岗位给出了较优厚的基础待遇"}，对方也愿意根据你之后发表的论文重新谈报酬。${context.offer.monthlySanCost === 6 ? "项目交付排得很紧，连晚上的时间也未必保得住" : context.offer.monthlySanCost === 4 ? "项目节奏相对从容，但每周的交付还是要挤占课余时间" : "项目交付稳定，两边的进度都得按时跟上"}；${context.offer.experimentBonus === 6 ? "好在那边的设备和数据很齐全，能帮你推进不少实验" : context.offer.experimentBonus === 4 ? "那边也能开放一些实验资源，课题多少能跟着受益" : "公司的实验资源比组里宽裕，正好能补上课题需要的条件"}。`,
      "你打开日历，📅组会、实验和项目交付挤在同一页。实习能缓解生活开销，也能积累以后找工作的经验，可课题停下来之后，再接上思路往往比想象中费劲。" + (context.unavailable
        ? "先前的实习安排还在执行，这回实在接不下来；你不想让两个团队都等着自己的答复。"
        : "你试着找出几个完整的晚上，又把休息时间留了一些，免得计划从第一周起就只能靠熬夜兑现。") + warningText,
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
        outcome: `企业实习（6个月）｜每月SAN -${context.offer.monthlySanCost}｜每月金币 +${context.currentMonthlyIncome}｜实验 ×1.25、+${context.offer.experimentBonus}｜实验费用 -2`,
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
      `📩${context.origin ? `${context.origin}结束后` : "会后"}，你正在整理交流时记下的笔记，收到${context.offer.company}发来的${context.offer.position}实习邀请。对方在邮件里提起你介绍过的方法，附件中的项目也确实能用上它。原以为只是互留联系方式，没想到后续真的找到了自己。`,
      "你翻到报酬那一栏，心里先算了一遍日常开销，又往上拉回工作要求。设备和数据让人心动，陌生的业务问题也有趣，但桌边还压着等你修改的课题方案。邮件末尾附了联系人和入职流程，你没有马上回复，先打开日历，想看看这份机会该放进生活的哪里。",
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

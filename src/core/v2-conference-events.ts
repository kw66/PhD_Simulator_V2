import { createConferenceActivityAct1, type ConferenceActivityBuildState, type ConferenceActivityContext } from "./v2-conference-activity";
import { getConferenceInfo, getConferenceLocation } from "./v2-conference-catalog";
import type { EventCounters, EventSupportState, PendingEvent, PaperTarget, ShopState } from "./v2-types";
import type { ConferenceDecisionMode, ConferenceRegionId } from "./v2-conference-system";
import { resolveConferenceDecisionCost } from "./v2-conference-system";

export interface ConferenceAcceptedPaperCandidate {
  id: string;
  target: PaperTarget;
  submittedMonth: number;
  submittedYear: number;
}

export interface ConferenceEventContext extends ConferenceActivityContext {
  region: ConferenceRegionId;
  paperIds: string[];
}

export interface ConferenceEventBuilderState extends ConferenceActivityBuildState {
  favor: number;
  shopState: ShopState;
  eventSupport: EventSupportState;
  eventCounters: EventCounters;
}

function getRegionName(region: ConferenceRegionId): string {
  if (region === "domestic") return "国内";
  if (region === "asia") return "亚太";
  return "欧美";
}

function getPaperTargetPriority(target: PaperTarget): number {
  if (target === "A") return 3;
  if (target === "B") return 2;
  return 1;
}

function createPaperHandledUpdates(context: ConferenceEventContext) {
  return context.paperIds.map((id) => ({ id, conferenceHandled: true }));
}

function createConferenceDecisionAct3(
  context: ConferenceEventContext,
  state: ConferenceEventBuilderState,
  decision: ReturnType<typeof resolveConferenceDecisionCost>,
  getRoll: () => number,
): PendingEvent {
  const modeText = decision.mode === "self" ? "自费参会" : decision.mode === "advisor" ? "导师报销" : "同学代参会";
  const costText = decision.resource === "favor"
    ? `好感 -${decision.actualCost}`
    : `金钱 -${decision.actualCost}`;

  return {
    id: `${context.id}-act3-${decision.mode}`,
    title: "论文参会 ➜ 开会方式抉择 ➜ 参会确认",
    description: [
      "你已经敲定了本次参会方式，预算、人情和行程也随之落定。",
      "这一刻开始，你不再纠结“去不去、怎么去”，而是进入下一层问题：到会场后，把有限精力投向哪里。",
      "真正决定产出的，往往不是抵达本身，而是抵达后的每一次取舍。",
      "机制结算",
      `${modeText}，目的地是${getRegionName(context.region)}的${context.city}，${costText}。`,
    ].join("\n\n"),
    preview: `${context.conferenceName} @ ${context.city}`,
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "conference-decision",
    stage: "act3",
    choices: decision.countsAsMeeting
      ? [{
          id: "enter-venue",
          label: "进入会场活动",
          outcome: "进入会场。",
          effects: {
            counterDeltas: { meetingCount: 1 },
            paperUpdates: createPaperHandledUpdates(context),
            enqueueEvents: [createConferenceActivityAct1(context, state, getRoll)],
          },
        }]
      : [{
          id: "proxy-finish",
          label: "结束本次流程",
          outcome: "由同学代参会。",
          effects: {
            paperUpdates: createPaperHandledUpdates(context),
          },
        }],
  };
}

function createConferenceDecisionAct2(
  context: ConferenceEventContext,
  state: ConferenceEventBuilderState,
  getRoll: () => number,
): PendingEvent {
  const baseInput = {
    region: context.region,
    favor: state.favor,
    social: state.social,
    shopState: state.shopState,
    eventSupport: state.eventSupport,
    eventCounters: state.eventCounters,
  };
  const selfDecision = resolveConferenceDecisionCost({ ...baseInput, mode: "self" }, getRoll);
  const advisorDecision = resolveConferenceDecisionCost({ ...baseInput, mode: "advisor" }, getRoll);
  const proxyDecision = resolveConferenceDecisionCost({ ...baseInput, mode: "proxy" }, getRoll);
  const hasFullGear = selfDecision.fullGearDiscount > 0;
  const discount = selfDecision.fullGearDiscount;
  const regionName = getRegionName(context.region);

  const createChoice = (mode: ConferenceDecisionMode, decision: ReturnType<typeof resolveConferenceDecisionCost>) => ({
    id: mode,
    label: mode === "self" ? "自费参会" : mode === "advisor" ? "导师报销" : "请同学代参会",
    outcome: mode === "proxy"
      ? "委托同学代参会。"
      : `${decision.resource === "favor" ? "导师好感" : "金钱"} -${decision.actualCost}。`,
    effects: {
      ...(decision.resource === "money" && decision.actualCost > 0 ? { money: -decision.actualCost } : {}),
      ...(decision.resource === "favor" && decision.actualCost > 0 ? { favor: -decision.actualCost } : {}),
      enqueueEvents: [createConferenceDecisionAct3(context, state, decision, getRoll)],
    },
  });

  return {
    id: `${context.id}-act2`,
    title: "论文参会 ➜ 开会方式抉择",
    description: [
      `你站在行程确认页前，把这次参会当成一次“资源调度题”来算：地点在${regionName}，成本和后续收益都会被地域放大。`,
      context.paperCount >= 2
        ? `这次同会有 ${context.paperCount} 篇论文需要你处理，现场投入越深，通常回报也越高，但任何失误都会被成倍放大。`
        : "这次只有 1 篇展示任务，整体投入可控，但也更考验你是否愿意为单点机会付出成本。",
      hasFullGear
        ? `你现在有整装待发加成，自费路径可减免 ${discount}，相当于给了你一次“硬扛成本”的缓冲。`
        : "你这次没有整装待发减免，任何自费支出都会实打实落到账上。",
      "自费最直接，现金压力也最明确；导师报销最省钱，但会消耗关系资本；请同学代参会最省精力，却常常意味着你把现场机会让给了别人。",
      "你并不是在选“哪个按钮”，而是在选“哪一种代价最符合你当前阶段”。",
    ].join("\n\n"),
    preview: `${context.conferenceName} @ ${context.city}`,
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "conference-decision",
    stage: "act2",
    choices: [
      createChoice("self", selfDecision),
      createChoice("advisor", advisorDecision),
      createChoice("proxy", proxyDecision),
    ],
  };
}

export function createConferenceDecisionAct1(
  context: ConferenceEventContext,
  state: ConferenceEventBuilderState,
  getRoll: () => number = Math.random,
): PendingEvent {
  return {
    id: `${context.id}-act1`,
    title: "论文参会",
    description: [
      "你的论文收到了会议录用通知，邮箱里的那封确认信让你兴奋了几秒，也立刻带来了现实问题：这次到底怎么参会。",
      `会议是 ${context.conferenceName} ${context.conferenceYear}，地点在 ${context.city}, ${context.country}。行程、预算和关系成本都会在这一步一起结算。`,
      context.paperCount >= 2
        ? `更关键的是，本次同会有 ${context.paperCount} 篇论文需要展示。你投入方式的不同，会直接影响这几篇工作的曝光质量和后续连锁机会。`
        : "这是一次单篇展示，看似负担更轻，但每一次露面质量都更容易被放大解读。",
      "你准备先把参会方式定下来，再决定进入会场后把精力押在哪一条线。",
    ].join("\n\n"),
    preview: `${context.conferenceName} @ ${context.city}`,
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "conference-decision",
    stage: "act1",
    choices: [{
      id: "continue",
      label: "继续",
      outcome: "选择参会方式。",
      effects: {
        enqueueEvents: [createConferenceDecisionAct2(context, state, getRoll)],
      },
    }],
  };
}

export function buildConferenceDecisionEventsForAcceptedPapers(
  papers: ConferenceAcceptedPaperCandidate[],
  state: ConferenceEventBuilderState,
  getRoll: () => number = Math.random,
): PendingEvent[] {
  const groupedContexts = new Map<string, ConferenceEventContext>();

  for (const paper of papers) {
    const conferenceInfo = getConferenceInfo(paper.submittedMonth, paper.target, paper.submittedYear);
    const conferenceLocation = getConferenceLocation(paper.submittedMonth, paper.target, paper.submittedYear);
    const key = `${conferenceInfo.name}_${conferenceInfo.year}_${conferenceLocation.city}`;
    const existing = groupedContexts.get(key);
    if (existing) {
      existing.paperCount += 1;
      existing.paperIds.push(paper.id);
      if (getPaperTargetPriority(paper.target) > getPaperTargetPriority(existing.grade)) {
        existing.grade = paper.target;
      }
      continue;
    }

    groupedContexts.set(key, {
      id: `conference-${paper.submittedYear}-${paper.submittedMonth}-${paper.target}-${conferenceLocation.city}`,
      conferenceName: conferenceInfo.name,
      conferenceYear: conferenceInfo.year,
      city: conferenceLocation.city,
      country: conferenceLocation.country,
      region: conferenceLocation.region,
      grade: paper.target,
      paperCount: 1,
      paperIds: [paper.id],
    });
  }

  return Array.from(groupedContexts.values()).map((context) => createConferenceDecisionAct1(context, state, getRoll));
}

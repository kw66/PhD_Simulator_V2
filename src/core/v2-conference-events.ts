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

function getPaperScaleText(paperCount: number): string {
  return paperCount >= 2 ? `这次同会共有 ${paperCount} 篇论文需要处理。` : "这次只涉及 1 篇论文展示。";
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
    title: "论文参会 ➜ 参会确认",
    description: `${modeText}已确定；本次地点为 ${getRegionName(context.region)} · ${context.city}。结算：${costText}。`,
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
          outcome: "已进入会场活动。",
          effects: {
            counterDeltas: { meetingCount: 1 },
            paperUpdates: createPaperHandledUpdates(context),
            enqueueEvents: [createConferenceActivityAct1(context, state, getRoll)],
          },
        }]
      : [{
          id: "proxy-finish",
          label: "结束本次流程",
          outcome: "同学代参会，本次不进入会场活动。",
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

  const createChoice = (mode: ConferenceDecisionMode, decision: ReturnType<typeof resolveConferenceDecisionCost>) => ({
    id: mode,
    label: mode === "self" ? "自费参会" : mode === "advisor" ? "导师报销" : "请同学代参会",
    outcome: mode === "proxy" ? "参会方式已委托同学处理。" : "参会方式已确认。",
    effects: {
      ...(decision.resource === "money" && decision.actualCost > 0 ? { money: -decision.actualCost } : {}),
      ...(decision.resource === "favor" && decision.actualCost > 0 ? { favor: -decision.actualCost } : {}),
      enqueueEvents: [createConferenceDecisionAct3(context, state, decision, getRoll)],
    },
  });

  return {
    id: `${context.id}-act2`,
    title: "论文参会 ➜ 开会方式抉择",
    description: `${context.conferenceName} ${context.conferenceYear} @ ${context.city}（${getRegionName(context.region)}）。${getPaperScaleText(context.paperCount)}`,
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
    description: `${context.conferenceName} ${context.conferenceYear} @ ${context.city}, ${context.country}。${getPaperScaleText(context.paperCount)}`,
    preview: `${context.conferenceName} @ ${context.city}`,
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: "conference-decision",
    stage: "act1",
    choices: [{
      id: "continue",
      label: "继续",
      outcome: "进入参会方式抉择。",
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
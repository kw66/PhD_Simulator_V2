import { createConferenceActivityEvent, type ConferenceActivityBuildState, type ConferenceActivityContext } from "./v2-conference-activity";
import { getConferenceInfo, getConferenceLocation } from "./v2-conference-catalog";
import { getPaperConferencePromotionMultiplier } from "./v2-publication-system";
import { getConferencePaperPresentationResults } from "./v2-conference-activity-shared";
import type { EventCounters, EventSupportState, PaperAcceptType, PendingEvent, PaperTarget, ShopState } from "./v2-types";
import type { ConferenceDecisionMode, ConferenceRegionId } from "./v2-conference-system";
import { resolveConferenceDecisionCost } from "./v2-conference-system";

export interface ConferenceAcceptedPaperCandidate {
  id: string;
  target: PaperTarget;
  submittedMonth: number;
  submittedYear: number;
  title?: string;
  acceptType?: PaperAcceptType;
}

export interface ConferenceEventContext extends ConferenceActivityContext {
  region: ConferenceRegionId;
  locationSeed?: number | null;
  paperIds: string[];
}

export interface ConferenceEventBuilderState extends ConferenceActivityBuildState {
  favor: number;
  conferenceLocationSeed?: number | null;
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
  const costText = decision.actualCost > 0
    ? decision.resource === "favor"
      ? `导师好感 -${decision.actualCost}`
      : `金币 -${decision.actualCost}`
    : decision.mode === "advisor"
      ? "导师好感未变化"
      : decision.mode === "proxy"
        ? "代参会费用 0"
        : "参会费用 0";
  const settlementItems = [modeText, costText];
  const settlementSummary = settlementItems.join("，");
  const presentationResults = getConferencePaperPresentationResults(context);

  return {
    id: `${context.id}-act3-${decision.mode}`,
    title: "论文参会 ➜ 参会方式 ➜ 参会确认",
    description: [
      "参会方式已经选好，预算和行程也排上了。",
      "论文展示就在会议日程里，报告、海报和交流活动都挤在同一天。",
      "你把会场地图存进手机，准备确认这次安排。",
      ...(decision.resistanceNarrative ? [decision.resistanceNarrative] : []),
      "机制结算",
      ...settlementItems,
      ...presentationResults,
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: context.id,
    stage: "act3",
    discardPaperUpdates: createPaperHandledUpdates(context),
    completionLog: decision.countsAsMeeting
      ? [settlementSummary, ...presentationResults, "论文展示已完成"].join("；")
      : [settlementSummary, ...presentationResults, "论文参会已处理"].join("；"),
    choices: decision.countsAsMeeting
      ? [{
          id: "enter-venue",
          label: "进入会场安排",
          outcome: "进入会场安排。",
          effects: {
            ...(decision.resource === "money" && decision.actualCost > 0 ? { money: -decision.actualCost } : {}),
            ...(decision.resource === "favor" && decision.actualCost > 0 ? { favor: -decision.actualCost } : {}),
            counterDeltas: { meetingCount: 1 },
            enqueueEvents: [createConferenceActivityEvent(context, state, settlementItems, getRoll)],
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
  const hasMeetingExperience = selfDecision.meetingDiscount > 0;
  const discount = selfDecision.meetingDiscount;
  const regionName = getRegionName(context.region);
  const selfCostHint = selfDecision.actualCost === 0
    ? "自费参会本次免费。"
    : `自费参会需要 ${selfDecision.actualCost} 金币。`;
  const proxyCostHint = proxyDecision.actualCost === 0
    ? "请同学代参会不需要花金币。"
    : `请同学代参会需要 ${proxyDecision.actualCost} 金币。`;

  const createChoice = (mode: ConferenceDecisionMode, decision: ReturnType<typeof resolveConferenceDecisionCost>) => ({
    id: mode,
    label: mode === "self" ? "自费参会" : mode === "advisor" ? "导师报销" : "请同学代参会",
    outcome: mode === "proxy"
      ? "委托同学代参会。"
      : `${decision.resource === "favor" ? "导师好感" : "金币"} -${decision.actualCost}。`,
      effects: {
      enqueueEvents: [createConferenceDecisionAct3(context, state, decision, getRoll)],
    },
  });

  return {
    id: `${context.id}-act2`,
    title: "论文参会 ➜ 参会方式",
    description: [
      `你查了去${context.city}的行程，这次会议在${regionName}，路费和时间都不算少。`,
      context.paperCount >= 2
        ? `同会有 ${context.paperCount} 篇论文需要展示，现场会比平时更忙。`
        : "这次只有 1 篇论文需要展示，安排起来相对简单。",
      hasMeetingExperience
        ? `会务经验可以减免 ${discount} 金币，自费会便宜一些。`
        : "这次自费没有减免，花费要全部自己承担。",
      selfCostHint,
      proxyCostHint,
      "自费最直接，导师报销要开口；请同学代参会，则不用亲自到场。",
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: context.id,
    stage: "act2",
    discardPaperUpdates: createPaperHandledUpdates(context),
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
      "录用通知已经收到，会议也快到了。高兴过后，注册、行程和参会方式都要定下来。",
      `这次是 ${context.conferenceName} ${context.conferenceYear}，地点在 ${context.city}，${context.country}。要不要亲自去，还得一起算路费和时间。`,
      context.paperCount >= 2
        ? `本次同会有 ${context.paperCount} 篇论文需要展示，行程会排得很满。`
        : "这次只有一篇论文需要展示。",
      ...getConferencePaperPresentationResults(context),
      "完成会议展示后，对应的宣传倍率才会开始计入引用。",
      "先把参会方式定下来。",
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: context.id,
    stage: "act1",
    discardPaperUpdates: createPaperHandledUpdates(context),
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
    const conferenceLocation = getConferenceLocation(
      paper.submittedMonth,
      paper.target,
      paper.submittedYear,
      state.conferenceLocationSeed,
    );
    const key = `${conferenceInfo.name}_${conferenceInfo.year}_${conferenceLocation.city}`;
    const existing = groupedContexts.get(key);
    if (existing) {
      existing.paperCount += 1;
      existing.paperIds.push(paper.id);
      existing.paperPresentations?.push({
        id: paper.id,
        title: paper.title ?? "论文",
        acceptType: paper.acceptType ?? "Poster",
        citationPromotionMultiplier: getPaperConferencePromotionMultiplier(paper.acceptType),
      });
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
      locationSeed: state.conferenceLocationSeed,
      grade: paper.target,
      paperCount: 1,
      paperIds: [paper.id],
      paperPresentations: [{
        id: paper.id,
        title: paper.title ?? "论文",
        acceptType: paper.acceptType ?? "Poster",
        citationPromotionMultiplier: getPaperConferencePromotionMultiplier(paper.acceptType),
      }],
    });
  }

  return Array.from(groupedContexts.values()).map((context) => createConferenceDecisionAct1(context, state, getRoll));
}

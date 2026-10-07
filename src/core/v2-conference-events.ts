import { createConferenceActivityEvent } from "./v2-conference-activity-events";
import type { ConferenceActivityBuildState, ConferenceActivityContext } from "./v2-conference-activity-shared";
import { getConferenceInfo, getConferenceLocation } from "./v2-conference-catalog";
import { getPaperConferencePromotionMultiplier } from "./v2-publication-system";
import { getConferencePaperPresentationResults } from "./v2-conference-activity-shared";
import type { EventCounters, EventSupportState, GameState, PaperAcceptType, PendingEvent, PaperTarget, ShopState } from "./v2-types";
import type { ConferenceDecisionMode, ConferenceRegionId } from "./v2-conference-system";
import { getConferenceBaseCosts, resolveConferenceDecisionCost } from "./v2-conference-system";

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
  advisorFunding?: number;
  advisorProgressState?: Pick<GameState["advisorProgressState"], "funding" | "paidPlayerConferenceTrips">;
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

function createPaperHandledUpdates(context: ConferenceEventContext, conferenceHandled = true) {
  return context.paperIds.map((id) => ({ id, conferenceHandled }));
}

function getPlayerConferenceTripId(context: ConferenceEventContext): string {
  return JSON.stringify([context.conferenceName, context.conferenceYear, context.city]);
}

function getConferenceFundingDisabledReason(state: ConferenceEventBuilderState, fundingCost: number): string | undefined {
  const advisorFunding = state.advisorFunding ?? state.advisorProgressState?.funding;
  return advisorFunding !== undefined && advisorFunding < fundingCost
    ? `实验室经费不足，需要 ${fundingCost} 金币。`
    : undefined;
}

function createConferenceDecisionAct3(
  context: ConferenceEventContext,
  state: ConferenceEventBuilderState,
  decision: ReturnType<typeof resolveConferenceDecisionCost>,
  getRoll: () => number,
): PendingEvent {
  const modeText = decision.mode === "self" ? "自费参会" : decision.mode === "advisor" ? "导师报销" : "线上代参会";
  const costText = decision.actualCost > 0
    ? decision.resource === "favor"
      ? `导师好感 -${decision.actualCost}`
      : `金币 -${decision.actualCost}`
    : decision.mode === "advisor"
      ? "导师好感 -0"
      : decision.mode === "proxy"
        ? "代参会费用 0"
        : "参会费用 0";
  const settlementItems = [modeText, costText, ...(decision.fundingCost > 0 ? [`实验室经费 -${decision.fundingCost}`] : [])];
  const settlementSummary = settlementItems.join("，");
  const presentationResults = getConferencePaperPresentationResults(context);
  const regionName = getRegionName(context.region);
  const regionCounterKey = context.region === "domestic" ? "domesticMeetingCount" : context.region === "asia" ? "asiaMeetingCount" : "westMeetingCount";
  const currentRegionCount = state.eventCounters[regionCounterKey] ?? 0;
  const meetingGrowth = decision.countsAsMeeting
    ? `${regionName}参会 ${currentRegionCount}→${currentRegionCount + 1}次`
    : "";
  const resultItems = [
    `结果：${settlementSummary}`,
    ...presentationResults.map((result) => `结果：${result}`),
    ...(meetingGrowth ? [meetingGrowth] : []),
  ];

  return {
    id: `${context.id}-act3-${decision.mode}`,
    title: "论文参会 ➜ 参会方式 ➜ 参会确认",
    description: [
      decision.mode === "proxy"
        ? "你在线上找好代参会服务，把展示材料、时间表和几条可能被问到的问题一并发过去，又核对了一遍对方确认的安排。"
        : "参会方式定下来了，你照着会务邮件准备材料。电脑里存了一份，邮箱里再留一份，毕竟会场的网速还没见识过。",
      "录用时以为终于忙完了，眼下才发现，会务邮件也能攒出一份待办清单。你挨个打上勾，总算把这趟安排妥当。",
      ...(decision.resistanceNarrative ? [decision.resistanceNarrative] : []),
      "机制结算",
      ...resultItems,
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: context.id,
    stage: "act3",
    discardPaperUpdates: createPaperHandledUpdates(context, false),
    completionLog: decision.countsAsMeeting
      ? [settlementSummary, ...presentationResults, meetingGrowth, "论文展示已完成"].join("；")
      : [settlementSummary, ...presentationResults, "论文参会已处理"].join("；"),
    choices: decision.countsAsMeeting
      ? [{
          id: "enter-venue",
          label: "进入会场安排",
          outcome: "进入会场安排。",
          disabledReason: decision.mode === "advisor" ? getConferenceFundingDisabledReason(state, decision.fundingCost) : undefined,
          effects: {
            recordPlayerConferenceTrip: getPlayerConferenceTripId(context),
            ...(decision.resource === "money" && decision.actualCost > 0 ? { money: -decision.actualCost } : {}),
            ...(decision.resource === "favor" && decision.actualCost > 0 ? { favor: -decision.actualCost } : {}),
            ...(decision.fundingCost > 0 ? { advisorProgressStateDeltas: { funding: -decision.fundingCost } } : {}),
            counterDeltas: {
              meetingCount: 1,
              ...(context.region === "domestic" ? { domesticMeetingCount: 1 } : context.region === "asia" ? { asiaMeetingCount: 1 } : { westMeetingCount: 1 }),
            },
            enqueueEvents: [createConferenceActivityEvent(context, state, settlementItems, getRoll)],
          },
        }]
      : [{
          id: "proxy-finish",
          label: "结束本次流程",
          outcome: `由线上服务代参会，金币 -${decision.actualCost}。`,
          effects: {
            money: -decision.actualCost,
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
  const travelAlreadyPaid = state.advisorProgressState?.paidPlayerConferenceTrips?.includes(getPlayerConferenceTripId(context)) ?? false;
  const baseInput = {
    region: context.region,
    paperCount: context.paperCount,
    travelAlreadyPaid,
    favor: state.favor,
    social: state.social,
    shopState: state.shopState,
    eventSupport: state.eventSupport,
    eventCounters: state.eventCounters,
  };
  const selfDecision = resolveConferenceDecisionCost({ ...baseInput, mode: "self" }, getRoll);
  const advisorDecision = resolveConferenceDecisionCost({ ...baseInput, mode: "advisor" }, getRoll);
  const proxyDecision = resolveConferenceDecisionCost({ ...baseInput, mode: "proxy" }, getRoll);
  const regionName = getRegionName(context.region);
  const baseCosts = getConferenceBaseCosts(context.region);
  const selfCostHint = `注册费每篇 1 金币，共 ${context.paperCount} 金币；一作差旅费每场会议只收一次，本次 ${travelAlreadyPaid ? 0 : baseCosts.selfPay - 1} 金币。自费共需 ${selfDecision.actualCost} 金币。`;
  const proxyCostHint = `线上代参会仍需逐篇缴纳注册费，另付服务费 ${baseCosts.proxyCost} 金币，共 ${proxyDecision.actualCost} 金币。`;
  const advisorHint = state.favor >= 6
    ? "导师报销能省下这笔钱，平时的交情也能缓和麻烦老师的顾虑，但未必完全不伤人情。"
    : "导师报销能省下这笔钱，只是你和老师还不熟，这趟开销会欠下一些人情。";

  const createChoice = (mode: ConferenceDecisionMode, decision: ReturnType<typeof resolveConferenceDecisionCost>) => ({
    id: mode,
    label: mode === "self" ? "自费参会" : mode === "advisor" ? "导师报销" : "线上代参会",
    outcome: mode === "proxy"
      ? `委托线上服务代参会，金币 -${decision.actualCost}。`
      : `${decision.resource === "favor" ? "导师好感" : "金币"} -${decision.actualCost}${decision.fundingCost > 0 ? `，实验室经费 -${decision.fundingCost}` : ""}。`,
    disabledReason: mode === "advisor" ? getConferenceFundingDisabledReason(state, decision.fundingCost) : undefined,
    effects: {
      enqueueEvents: [createConferenceDecisionAct3(context, state, decision, getRoll)],
    },
  });

  return {
    id: `${context.id}-act2`,
    title: "论文参会 ➜ 参会方式",
    description: [
      `你查好去${context.city}的行程，把${regionName}参会的费用加了一遍。` + (context.paperCount >= 2
        ? `同会的 ${context.paperCount} 篇论文得一起安排，展示材料也要逐份核对。`
        : "这次有 1 篇论文要展示，你还挺想亲口讲讲自己的工作。") + selfCostHint,
      `${advisorHint}报销将扣除实验室经费 ${advisorDecision.fundingCost} 金币。${proxyCostHint}线上代参会能完成论文展示，却也会错过自己到场交流和安排行程的机会。`,
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: context.id,
    stage: "act2",
    discardPaperUpdates: createPaperHandledUpdates(context, false),
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
  const rolls: number[] = [];
  const root = buildConferenceDecisionAct1(context, state, () => {
    const roll = getRoll();
    rolls.push(roll);
    return roll;
  });
  while (rolls.length < 16) rolls.push(getRoll());
  const attach = (event: PendingEvent, mode?: ConferenceDecisionMode): PendingEvent => event.chainId !== context.id ? event : {
    ...event,
    conferencePreview: { context, rolls, mode },
    choices: event.choices.map((choice) => ({
      ...choice,
      effects: {
        ...choice.effects,
        ...(choice.effects.enqueueEvents ? {
          enqueueEvents: choice.effects.enqueueEvents.map((next) => attach(next,
            choice.id === "self" || choice.id === "advisor" || choice.id === "proxy" ? choice.id : mode)),
        } : {}),
      },
    })),
  };
  const attached = attach(root);
  const decisionEvent = attached.choices[0]!.effects.enqueueEvents![0]!;
  const choices = decisionEvent.choices.map((choice) => {
    const confirmation = choice.effects.enqueueEvents?.[0];
    if (choice.id !== "advisor" || !confirmation?.choices[0]?.disabledReason) return choice;
    return {
      ...choice,
      effects: { ...choice.effects, enqueueEvents: [{
        ...confirmation,
        choices: [...confirmation.choices, {
          id: "change-payment-method",
          label: "重新选择参会方式",
          outcome: "实验室经费不足，重新选择自费或线上代参会。",
          effects: { enqueueEvents: [decisionEvent] },
        }],
      }] },
    };
  });
  return {
    ...attached,
    choices: [{ ...attached.choices[0]!, effects: {
      ...attached.choices[0]!.effects,
      enqueueEvents: [{ ...decisionEvent, choices }],
    } }],
  };
}

export function refreshConferenceDecision<Event extends PendingEvent>(state: GameState, event: Event): Event {
  const preview = event.conferencePreview;
  if (!preview) return event;
  let rollIndex = 0;
  let rebuilt = createConferenceDecisionAct1(preview.context, {
    ...state,
    research: state.player.research,
    social: state.player.social,
    favor: state.player.favor,
    advisorFunding: state.advisorProgressState.funding,
  }, () => preview.rolls[rollIndex++] ?? preview.rolls.at(-1)!);
  if (event.stage === "act2" || event.stage === "act3") rebuilt = rebuilt.choices[0]!.effects.enqueueEvents![0]!;
  if (event.stage === "act3") {
    const result = rebuilt.choices.find((choice) => choice.id === preview.mode)?.effects.enqueueEvents?.[0];
    if (!result) return event;
    rebuilt = result;
  }
  const merge = (current: PendingEvent, fresh: PendingEvent): PendingEvent => ({
    ...current,
    title: fresh.title, description: fresh.description, completionLog: fresh.completionLog,
    discardPaperUpdates: fresh.discardPaperUpdates,
    choices: fresh.choices.map((choice, index) => ({
      ...choice,
      id: current.choices[index]?.id ?? choice.id,
      effects: {
        ...choice.effects,
        ...(choice.effects.enqueueEvents ? {
          enqueueEvents: choice.effects.enqueueEvents.map((next, nextIndex) => {
            const previous = current.choices[index]?.effects.enqueueEvents?.[nextIndex];
            return previous?.conferencePreview ? merge(previous, next) : next;
          }),
        } : {}),
      },
    })),
  });
  return merge(event, rebuilt) as Event;
}

function buildConferenceDecisionAct1(
  context: ConferenceEventContext,
  state: ConferenceEventBuilderState,
  getRoll: () => number = Math.random,
): PendingEvent {
  return {
    id: `${context.id}-act1`,
    title: "论文参会",
    description: [
      `会议临近，会务邮件催你确认展示安排。这次是 ${context.conferenceName} ${context.conferenceYear}，地点在${context.city}，${context.country}。`,
      context.paperCount >= 2
        ? `同一场会议有 ${context.paperCount} 篇论文要展示，你在日历上挨个标好。平时看着挺空的几格，忽然写得密密麻麻。`
        : "这次有一篇论文要展示。你把自己的名字从日程里找出来，又核了一遍时间，才把那封长长的会务邮件往下翻。",
      ...getConferencePaperPresentationResults(context),
    ].join("\n\n"),
    source: "fixed",
    blocking: true,
    deadlineMonths: 0,
    chainId: context.id,
    stage: "act1",
    discardPaperUpdates: createPaperHandledUpdates(context, false),
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
